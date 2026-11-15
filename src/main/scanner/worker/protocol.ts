import type { ScanProgress } from '@shared/types'
import type { ScanInput, ScanOutput } from '../types'

export type WorkerRequest = { type: 'start'; input: ScanInput } | { type: 'cancel' }

export type WorkerResponse =
  | { type: 'progress'; progress: ScanProgress }
  | { type: 'done'; output: ScanOutput }
  | { type: 'cancelled' }
  | { type: 'error'; message: string }
