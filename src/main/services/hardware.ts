import os from 'node:os'
import type { HardwareDisk, HardwareGpu, HardwareInfo, HardwareMemoryModule } from '@shared/types'
import type { Repository } from '../db/repository'
import { log } from '../logger'
import { runPowerShell } from '../scanner/sources/registry'

const CACHE_SETTING = 'hardware.cache'

/**
 * One PowerShell call that reads the parts of the PC. Video memory comes from the display driver's registry
 * key because Win32_VideoController stops counting at 4 GB.
 */
const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1 Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed
$gpu = @(Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion)
$vram = @(Get-ItemProperty -Path 'HKLM:\\SYSTEM\\ControlSet001\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0*' | ForEach-Object { [pscustomobject]@{ Name = $_.DriverDesc; Bytes = $_.'HardwareInformation.qwMemorySize' } })
$ram = @(Get-CimInstance Win32_PhysicalMemory | Select-Object Capacity,Speed,ConfiguredClockSpeed,Manufacturer,PartNumber)
$board = Get-CimInstance Win32_BaseBoard | Select-Object -First 1 Manufacturer,Product
$disks = @(Get-PhysicalDisk | Select-Object FriendlyName,Size,MediaType,BusType)
$os = (Get-CimInstance Win32_OperatingSystem).Caption
[pscustomobject]@{ cpu = $cpu; gpu = $gpu; vram = $vram; ram = $ram; board = $board; disks = $disks; os = $os } | ConvertTo-Json -Depth 4 -Compress
`

/** Display adapters that are not graphics cards. */
const VIRTUAL_GPU = /basic display|basic render|remote display|parsec|virtual|vmware|virtualbox|citrix|meta virtual|indirect display|spacedesk/i

function list(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
  return value !== null && typeof value === 'object' ? [value as Record<string, unknown>] : []
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().replace(/\s{2,}/g, ' ') : null
}

function num(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/** Media types from Get-PhysicalDisk: 3 HDD, 4 SSD (numbers on some systems, words on others). */
function mediaType(value: unknown): string | null {
  if (value === 3 || value === 'HDD') return 'HDD'
  if (value === 4 || value === 'SSD') return 'SSD'
  if (value === 5 || value === 'SCM') return 'SCM'
  return null
}

const BUS_TYPES: Record<number, string> = { 7: 'USB', 11: 'SATA', 17: 'NVMe', 8: 'RAID', 10: 'SAS' }

function busType(value: unknown): string | null {
  if (typeof value === 'number') return BUS_TYPES[value] ?? null
  return text(value)
}

/** Turns the PowerShell JSON into HardwareInfo. Anything missing falls back to what Node knows. */
export function parseHardware(json: string, fallback: HardwareInfo): HardwareInfo {
  let data: Record<string, unknown>
  try {
    data = JSON.parse(json) as Record<string, unknown>
  } catch {
    return fallback
  }

  const cpuRaw = list(data['cpu'])[0]
  const cpuName = text(cpuRaw?.['Name'])
  const vram = list(data['vram'])
  const gpus: HardwareGpu[] = list(data['gpu'])
    .map((gpu) => {
      const name = text(gpu['Name'])
      if (!name || VIRTUAL_GPU.test(name)) return null
      const fromRegistry = vram.find((entry) => text(entry['Name']) === name)
      const registryBytes = num(fromRegistry?.['Bytes'])
      return { name, vramBytes: registryBytes ?? num(gpu['AdapterRAM']), driver: text(gpu['DriverVersion']) }
    })
    .filter((gpu): gpu is HardwareGpu => gpu !== null)

  const modules: HardwareMemoryModule[] = list(data['ram']).map((module) => ({
    capacityBytes: num(module['Capacity']) ?? 0,
    speedMhz: num(module['ConfiguredClockSpeed']) ?? num(module['Speed']),
    manufacturer: text(module['Manufacturer']),
    partNumber: text(module['PartNumber'])
  }))
  const moduleTotal = modules.reduce((sum, module) => sum + module.capacityBytes, 0)

  const boardRaw = list(data['board'])[0]
  const disks: HardwareDisk[] = list(data['disks'])
    .map((disk) => ({ model: text(disk['FriendlyName']) ?? 'Disk', sizeBytes: num(disk['Size']) ?? 0, mediaType: mediaType(disk['MediaType']), busType: busType(disk['BusType']) }))
    .filter((disk) => disk.sizeBytes > 0)

  return {
    cpu: cpuName
      ? { name: cpuName, cores: num(cpuRaw?.['NumberOfCores']), threads: num(cpuRaw?.['NumberOfLogicalProcessors']), maxClockMhz: num(cpuRaw?.['MaxClockSpeed']) }
      : fallback.cpu,
    gpus: gpus.length > 0 ? gpus : fallback.gpus,
    memory: { totalBytes: moduleTotal > 0 ? moduleTotal : fallback.memory.totalBytes, modules },
    motherboard: boardRaw ? { manufacturer: text(boardRaw['Manufacturer']), product: text(boardRaw['Product']) } : null,
    disks,
    os: text(data['os']) ?? fallback.os,
    collectedAt: fallback.collectedAt
  }
}

/** What Node can tell without Windows tools: processor and memory. */
export function basicHardware(): HardwareInfo {
  const cpus = os.cpus()
  return {
    cpu: cpus[0] ? { name: cpus[0].model.trim(), cores: null, threads: cpus.length, maxClockMhz: cpus[0].speed || null } : null,
    gpus: [],
    memory: { totalBytes: os.totalmem(), modules: [] },
    motherboard: null,
    disks: [],
    os: `${os.type()} ${os.release()}`,
    collectedAt: new Date().toISOString()
  }
}

/** Reads the hardware once per start (it does not change while Orus runs) and keeps the last result for a quick first paint. */
export class HardwareService {
  private current: Promise<HardwareInfo> | null = null

  constructor(private readonly repository: Repository) {}

  cached(): HardwareInfo | null {
    const stored = this.repository.getSetting(CACHE_SETTING)
    if (!stored) return null
    try {
      return JSON.parse(stored) as HardwareInfo
    } catch {
      return null
    }
  }

  get(): Promise<HardwareInfo> {
    this.current ??= this.read().catch((error: unknown) => {
      log.warn('Could not read the hardware', error)
      this.current = null
      return this.cached() ?? basicHardware()
    })
    return this.current
  }

  private async read(): Promise<HardwareInfo> {
    const fallback = basicHardware()
    if (process.platform !== 'win32') return fallback
    const output = await runPowerShell(SCRIPT, 45_000)
    const info = parseHardware(output, fallback)
    this.repository.setSetting(CACHE_SETTING, JSON.stringify(info))
    return info
  }
}
