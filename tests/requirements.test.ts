import { describe, expect, it } from 'vitest'
import { parseRawgRequirements, parseSteamRequirements } from '../src/main/metadata/requirements'
import { parseHardware, basicHardware } from '../src/main/services/hardware'

describe('requirements parsing', () => {
  it('reads Steam pc_requirements HTML', () => {
    const parsed = parseSteamRequirements({
      minimum:
        '<strong>Minimum:</strong><br><ul class="bb_ul"><li>Requires a 64-bit processor and operating system<br></li><li><strong>OS:</strong> Windows 10 64-bit<br></li><li><strong>Processor:</strong> Intel Core i5-8400 or AMD Ryzen 5 2600<br></li><li><strong>Memory:</strong> 12 GB RAM<br></li><li><strong>Graphics:</strong> NVIDIA GeForce GTX 1060 6 GB<br></li></ul>',
      recommended: '<strong>Recommended:</strong><br><ul class="bb_ul"><li><strong>Memory:</strong> 16 GB RAM</li></ul>'
    })
    expect(parsed?.minimum).toEqual([
      { label: 'OS', value: 'Windows 10 64-bit' },
      { label: 'Processor', value: 'Intel Core i5-8400 or AMD Ryzen 5 2600' },
      { label: 'Memory', value: '12 GB RAM' },
      { label: 'Graphics', value: 'NVIDIA GeForce GTX 1060 6 GB' }
    ])
    expect(parsed?.recommended).toEqual([{ label: 'Memory', value: '16 GB RAM' }])
    expect(parseSteamRequirements([])).toBeNull()
  })

  it('reads RAWG plain text for the PC platform', () => {
    const parsed = parseRawgRequirements([
      { platform: { slug: 'playstation4' }, requirements: {} },
      { platform: { slug: 'pc' }, requirements: { minimum: 'Minimum:\nOS: Windows 7\nMemory: 4 GB RAM', recommended: 'Recommended:\nMemory: 8 GB RAM' } }
    ])
    expect(parsed).toEqual({ minimum: [{ label: 'OS', value: 'Windows 7' }, { label: 'Memory', value: '4 GB RAM' }], recommended: [{ label: 'Memory', value: '8 GB RAM' }] })
  })
})

describe('parseHardware', () => {
  it('reads the PowerShell report, takes video memory from the registry and skips virtual adapters', () => {
    const json = JSON.stringify({
      cpu: { Name: 'AMD Ryzen 5 5600X 6-Core Processor             ', NumberOfCores: 6, NumberOfLogicalProcessors: 12, MaxClockSpeed: 3701 },
      gpu: [
        { Name: 'NVIDIA GeForce RTX 3060', AdapterRAM: 4293918720, DriverVersion: '32.0.15.6094' },
        { Name: 'Parsec Virtual Display Adapter', AdapterRAM: 0, DriverVersion: '1' }
      ],
      vram: [{ Name: 'NVIDIA GeForce RTX 3060', Bytes: 12884901888 }],
      ram: [
        { Capacity: 8589934592, Speed: 3200, ConfiguredClockSpeed: 3200, Manufacturer: 'Kingston', PartNumber: 'KF432C16BB/8 ' },
        { Capacity: 8589934592, Speed: 3200, ConfiguredClockSpeed: 3200, Manufacturer: 'Kingston', PartNumber: 'KF432C16BB/8' }
      ],
      board: { Manufacturer: 'ASUSTeK COMPUTER INC.', Product: 'TUF GAMING B550-PLUS' },
      disks: [{ FriendlyName: 'Samsung SSD 980 1TB', Size: 1000204886016, MediaType: 4, BusType: 17 }],
      os: 'Microsoft Windows 11 Pro'
    })
    const info = parseHardware(json, basicHardware())
    expect(info.cpu).toEqual({ name: 'AMD Ryzen 5 5600X 6-Core Processor', cores: 6, threads: 12, maxClockMhz: 3701 })
    expect(info.gpus).toEqual([{ name: 'NVIDIA GeForce RTX 3060', vramBytes: 12884901888, driver: '32.0.15.6094' }])
    expect(info.memory.totalBytes).toBe(17179869184)
    expect(info.memory.modules[0]).toMatchObject({ speedMhz: 3200, partNumber: 'KF432C16BB/8' })
    expect(info.motherboard).toEqual({ manufacturer: 'ASUSTeK COMPUTER INC.', product: 'TUF GAMING B550-PLUS' })
    expect(info.disks).toEqual([{ model: 'Samsung SSD 980 1TB', sizeBytes: 1000204886016, mediaType: 'SSD', busType: 'NVMe' }])
  })
})
