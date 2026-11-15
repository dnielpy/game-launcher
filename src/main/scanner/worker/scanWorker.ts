/**
 * Entry point of the scan utility process. Runs the scan off the main process
 * so the UI never freezes, and reports progress back through the parent port.
 */
import { runScan, ScanCancelledError } from '../scanEngine'
import type { WorkerRequest, WorkerResponse } from './protocol'

const port = process.parentPort
let controller: AbortController | null = null

function send(message: WorkerResponse): void {
  port.postMessage(message)
}

port.on('message', async (event: { data: WorkerRequest }) => {
  const request = event.data
  if (request.type === 'cancel') {
    controller?.abort()
    return
  }
  if (request.type !== 'start' || controller) return

  controller = new AbortController()
  try {
    const output = await runScan(request.input, (progress) => send({ type: 'progress', progress }), controller.signal)
    send({ type: 'done', output })
  } catch (error) {
    if (error instanceof ScanCancelledError) send({ type: 'cancelled' })
    else send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  } finally {
    controller = null
  }
})
