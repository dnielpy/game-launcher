import { net, protocol } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { iconsDirectory } from './services/icons'

export const MEDIA_SCHEME = 'media'

/** Must run before the app is ready. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }])
}

/**
 * Serves cached images as media://icons/<file>. Only files inside the icons
 * folder can be read, so the renderer never gets arbitrary disk access.
 */
export function handleMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'icons') return new Response('Not found', { status: 404 })
    const fileName = path.basename(decodeURIComponent(url.pathname))
    const filePath = path.join(iconsDirectory(), fileName)
    return net.fetch(pathToFileURL(filePath).toString())
  })
}
