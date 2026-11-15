import { net, protocol } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const MEDIA_SCHEME = 'media'

/** Must run before the app is ready. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }])
}

export interface MediaDirectories {
  icons: string
  games: string
}

/**
 * Serves cached images:
 *   media://icons/<file>          executable icons
 *   media://games/<id>/<file>     covers, banners, logos and screenshots
 * Only files inside those folders can be read, so the renderer never gets arbitrary disk access.
 */
export function handleMediaProtocol(directories: MediaDirectories): void {
  protocol.handle(MEDIA_SCHEME, (request) => {
    const url = new URL(request.url)
    const segments = url.pathname.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment))
    let filePath: string | null = null

    if (url.hostname === 'icons' && segments.length === 1) {
      filePath = path.join(directories.icons, path.basename(segments[0]!))
    } else if (url.hostname === 'games' && segments.length === 2 && /^\d+$/.test(segments[0]!)) {
      filePath = path.join(directories.games, segments[0]!, path.basename(segments[1]!))
    }

    if (!filePath) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(filePath).toString())
  })
}
