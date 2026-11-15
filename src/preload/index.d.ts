import type { LauncherApi } from '../shared/ipc'

declare global {
  interface Window {
    api: LauncherApi
  }
}

export {}
