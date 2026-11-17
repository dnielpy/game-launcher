import { promises as fs } from 'node:fs'
import path from 'node:path'

/**
 * One-file container for backups: a small header, a JSON manifest, then every file back to back.
 *
 *   "ORUSDATA" | u32 format version | u32 manifest length | manifest (JSON) | file 1 | file 2 | ...
 *
 * The manifest lists the files (name and size) in order, so any file can be read without unpacking the rest.
 */
export const CONTAINER_MAGIC = 'ORUSDATA'
export const CONTAINER_VERSION = 1
const HEADER_BYTES = CONTAINER_MAGIC.length + 8
const MAX_MANIFEST_BYTES = 128 * 1024 * 1024

export interface ContainerEntry {
  name: string
  size: number
}

export interface ContainerSource {
  /** Name inside the container, with forward slashes. */
  name: string
  /** File on disk to copy in. */
  path: string
}

/** Names that are safe to restore: relative, no ".." and no odd characters. */
export function isSafeEntryName(name: string): boolean {
  if (name.length === 0 || name.length > 200 || name.startsWith('/')) return false
  return name.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..' && !/[\\:*?"<>|\u0000-\u001f]/.test(part))
}

/** Writes the container to a temporary file and moves it into place when it is complete. Files that vanished are skipped. */
export async function writeContainer(target: string, manifest: Record<string, unknown>, sources: ContainerSource[]): Promise<{ entries: ContainerEntry[]; sizeBytes: number }> {
  const entries: (ContainerEntry & { path: string })[] = []
  for (const source of sources) {
    try {
      const stat = await fs.stat(source.path)
      if (stat.isFile()) entries.push({ name: source.name, size: stat.size, path: source.path })
    } catch {
      // A file removed while exporting is simply left out.
    }
  }

  const body = Buffer.from(JSON.stringify({ ...manifest, files: entries.map(({ name, size }) => ({ name, size })) }), 'utf8')
  const header = Buffer.alloc(HEADER_BYTES)
  header.write(CONTAINER_MAGIC, 0, 'ascii')
  header.writeUInt32BE(CONTAINER_VERSION, CONTAINER_MAGIC.length)
  header.writeUInt32BE(body.length, CONTAINER_MAGIC.length + 4)

  const temporary = `${target}.partial`
  const handle = await fs.open(temporary, 'w')
  let written = header.length + body.length
  try {
    await handle.write(header)
    await handle.write(body)
    for (const entry of entries) {
      const content = await fs.readFile(entry.path)
      // The size listed in the manifest must match what is written, even if the file changed meanwhile.
      if (content.length !== entry.size) throw new Error(`${entry.name} changed while exporting. Try again.`)
      await handle.write(content)
      written += content.length
    }
  } catch (error) {
    await handle.close()
    await fs.rm(temporary, { force: true })
    throw error
  }
  await handle.close()
  await fs.rename(temporary, target)
  return { entries: entries.map(({ name, size }) => ({ name, size })), sizeBytes: written }
}

export interface OpenContainer {
  manifest: Record<string, unknown>
  entries: ContainerEntry[]
  read(name: string): Promise<Buffer | null>
  close(): Promise<void>
}

export async function openContainer(file: string): Promise<OpenContainer> {
  const handle = await fs.open(file, 'r')
  try {
    const { size: fileSize } = await handle.stat()
    const header = Buffer.alloc(HEADER_BYTES)
    const { bytesRead } = await handle.read(header, 0, HEADER_BYTES, 0)
    if (bytesRead < HEADER_BYTES || header.toString('ascii', 0, CONTAINER_MAGIC.length) !== CONTAINER_MAGIC) {
      throw new Error('This is not an Orus data file')
    }
    const version = header.readUInt32BE(CONTAINER_MAGIC.length)
    if (version > CONTAINER_VERSION) throw new Error('This file was made by a newer version of Orus. Update Orus first.')
    const manifestLength = header.readUInt32BE(CONTAINER_MAGIC.length + 4)
    if (manifestLength === 0 || manifestLength > MAX_MANIFEST_BYTES || HEADER_BYTES + manifestLength > fileSize) {
      throw new Error('The data file is damaged')
    }

    const body = Buffer.alloc(manifestLength)
    await handle.read(body, 0, manifestLength, HEADER_BYTES)
    let manifest: Record<string, unknown>
    try {
      manifest = JSON.parse(body.toString('utf8')) as Record<string, unknown>
    } catch {
      throw new Error('The data file is damaged')
    }

    const listed = Array.isArray(manifest['files']) ? (manifest['files'] as unknown[]) : []
    const entries: ContainerEntry[] = []
    const offsets = new Map<string, number>()
    let offset = HEADER_BYTES + manifestLength
    for (const item of listed) {
      const entry = item as Partial<ContainerEntry>
      if (typeof entry.name !== 'string' || typeof entry.size !== 'number' || !Number.isInteger(entry.size) || entry.size < 0) throw new Error('The data file is damaged')
      if (offset + entry.size > fileSize) throw new Error('The data file is incomplete')
      entries.push({ name: entry.name, size: entry.size })
      if (isSafeEntryName(entry.name)) offsets.set(entry.name, offset)
      offset += entry.size
    }

    return {
      manifest,
      entries,
      async read(name) {
        const start = offsets.get(name)
        const entry = entries.find((item) => item.name === name)
        if (start === undefined || !entry) return null
        const content = Buffer.alloc(entry.size)
        if (entry.size > 0) await handle.read(content, 0, entry.size, start)
        return content
      },
      close: () => handle.close()
    }
  } catch (error) {
    await handle.close()
    throw error
  }
}

export async function writeFileSafely(target: string, content: Buffer): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, content)
}
