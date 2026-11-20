import { describe, expect, it } from 'vitest'
import { checkCompatibility, cpuScores, gpuScores, judge, memoryGigabytes } from '../src/shared/compatibility'
import type { GameRequirements, HardwareInfo } from '../src/shared/types'

function pc(cpu: string, gpu: string, ramGb: number): HardwareInfo {
  return {
    cpu: { name: cpu, cores: 6, threads: 12, maxClockMhz: 3600 },
    gpus: [{ name: gpu, vramBytes: null, driver: null }],
    memory: { totalBytes: ramGb * 1024 ** 3 - 200 * 1024 ** 2, modules: [] },
    motherboard: null,
    disks: [],
    os: 'Windows 11',
    collectedAt: ''
  }
}

const cyberpunk: GameRequirements = {
  minimum: [
    { label: 'OS', value: '64-bit Windows 10' },
    { label: 'Processor', value: 'Core i7-6700 or Ryzen 5 1600' },
    { label: 'Memory', value: '12 GB RAM' },
    { label: 'Graphics', value: 'GeForce GTX 1060 6GB or Radeon RX 580 8GB or Arc A380' }
  ],
  recommended: [
    { label: 'Processor', value: 'Core i7-12700 or Ryzen 7 7800X3D' },
    { label: 'Memory', value: '16 GB RAM' },
    { label: 'Graphics', value: 'GeForce RTX 2060 SUPER or Radeon RX 5700 XT or Arc A770' }
  ]
}

describe('part names', () => {
  it('scores graphics cards in a sensible order', () => {
    const [gtx1060] = gpuScores('NVIDIA GeForce GTX 1060 6GB')
    const [rtx3060] = gpuScores('NVIDIA GeForce RTX 3060')
    const [rtx4070s] = gpuScores('NVIDIA GeForce RTX 4070 SUPER')
    const [laptop] = gpuScores('NVIDIA GeForce RTX 3060 Laptop GPU')
    expect(gtx1060!).toBeLessThan(rtx3060!)
    expect(rtx3060!).toBeLessThan(rtx4070s!)
    expect(laptop!).toBeLessThan(rtx3060!)
    expect(gpuScores('AMD Radeon RX 6700 XT')).toEqual([115])
    expect(gpuScores('GTX 970 / Radeon R9 290X')).toEqual([33, 38])
    expect(gpuScores('Intel(R) UHD Graphics 630')).toEqual([6])
  })

  it('scores processors in a sensible order', () => {
    const [i5_4460] = cpuScores('Intel Core i5-4460')
    const [i5_12400] = cpuScores('12th Gen Intel(R) Core(TM) i5-12400F')
    const [r5_5600] = cpuScores('AMD Ryzen 5 5600X 6-Core Processor')
    expect(i5_4460!).toBeLessThan(r5_5600!)
    expect(cpuScores('Intel Core i7-6700 or AMD Ryzen 5 1600')).toHaveLength(2)
    expect(i5_12400!).toBeGreaterThan(cpuScores('Intel Core i7-8700K')[0]!)
  })

  it('reads memory amounts', () => {
    expect(memoryGigabytes('8 GB RAM')).toBe(8)
    expect(memoryGigabytes('4096 MB RAM')).toBe(4)
    expect(memoryGigabytes('Lots')).toBeNull()
  })
})

describe('checkCompatibility', () => {
  it('is green near the recommended specs', () => {
    const result = checkCompatibility(cyberpunk, pc('AMD Ryzen 7 5800X', 'NVIDIA GeForce RTX 3070', 32))
    expect(result.overall).toBe('good')
  })

  it('is yellow between minimum and recommended, using the weakest part', () => {
    const result = checkCompatibility(cyberpunk, pc('AMD Ryzen 5 3600', 'NVIDIA GeForce GTX 1660 SUPER', 16))
    expect(result.overall).toBe('ok')
    expect(result.parts.find((part) => part.part === 'ram')?.verdict).toBe('good')
  })

  it('is red below the minimum', () => {
    const result = checkCompatibility(cyberpunk, pc('Intel Core i5-4460', 'NVIDIA GeForce GTX 750 Ti', 8))
    expect(result.overall).toBe('bad')
  })

  it('says nothing when it cannot compare', () => {
    expect(checkCompatibility(null, pc('x', 'y', 8)).overall).toBe('unknown')
    expect(checkCompatibility({ minimum: [{ label: 'OS', value: 'Windows 10' }], recommended: null }, pc('x', 'y', 8)).overall).toBe('unknown')
  })

  it('judges with only one side known', () => {
    expect(judge(50, 30, null)).toBe('good')
    expect(judge(32, 30, null)).toBe('ok')
    expect(judge(20, null, 50)).toBe('bad')
  })
})
