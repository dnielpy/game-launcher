import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ExportSummary, ImportSummary, ProfileState } from '@shared/types'
import type { BackupGame, Repository } from '../db/repository'
import { isSafeEntryName, openContainer, writeContainer, type ContainerSource } from './container'
import { backupManifestSchema, type BackupManifest } from './schema'

export interface ProfileAccess {
  get(): ProfileState
  setName(name: string): ProfileState
  avatarPath(): string | null
  setPhotoFromBuffer(png: Buffer): Promise<ProfileState>
}

export interface BackupDirectories {
  /** Cached covers, banners and screenshots: <games>/<gameId>/<file>. */
  games: string
  /** Executable icons: <icons>/<file>. */
  icons: string
}

async function listFiles(directory: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
  } catch {
    return []
  }
}

/** Saves the whole library (games, play time, covers, details, profile) to one file and merges such a file back in. */
export class BackupService {
  constructor(
    private readonly repository: Repository,
    private readonly profile: ProfileAccess,
    private readonly directories: BackupDirectories,
    private readonly appVersion: string
  ) {}

  async export(target: string): Promise<ExportSummary> {
    const games: BackupGame[] = this.repository.listGames().map(({ playtimeSeconds: _p, lastPlayedAt: _l, sessionCount: _s, ...game }) => game)
    const sessions = this.repository.listSessions()
    const profile = this.profile.get()
    const roots = this.repository
      .listRoots()
      .filter((root) => root.kind === 'user')
      .map((root) => ({ path: root.path, category: root.category }))

    const sources: ContainerSource[] = []
    for (const game of games) {
      for (const file of await listFiles(path.join(this.directories.games, String(game.id)))) {
        sources.push({ name: `games/${game.id}/${file}`, path: path.join(this.directories.games, String(game.id), file) })
      }
      if (game.iconPath) sources.push({ name: `icons/${path.basename(game.iconPath)}`, path: path.join(this.directories.icons, path.basename(game.iconPath)) })
    }
    const avatar = this.profile.avatarPath()
    if (avatar) sources.push({ name: 'profile/avatar.png', path: avatar })

    const manifest = {
      format: 1,
      app: 'Orus',
      appVersion: this.appVersion,
      exportedAt: new Date().toISOString(),
      profile: profile.created ? { name: profile.name, avatar: avatar ? 'profile/avatar.png' : null } : null,
      roots,
      games,
      sessions
    }
    const written = await writeContainer(target, manifest, sources)
    return {
      filePath: target,
      games: games.length,
      sessions: sessions.length,
      images: written.entries.filter((entry) => entry.name.startsWith('games/')).length,
      sizeBytes: written.sizeBytes
    }
  }

  /** Merges a backup into this library. Nothing is deleted or overwritten: games already here keep their data. */
  async import(source: string): Promise<ImportSummary> {
    const container = await openContainer(source)
    try {
      const parsed = backupManifestSchema.safeParse(container.manifest)
      if (!parsed.success) throw new Error('This file is not a valid Orus backup')
      const manifest: BackupManifest = parsed.data

      const sessionsByGame = new Map<number, typeof manifest.sessions>()
      for (const session of manifest.sessions) sessionsByGame.set(session.gameId, [...(sessionsByGame.get(session.gameId) ?? []), session])

      const mediaJobs: { oldId: number; newId: number; icon: string | null }[] = []
      let gamesAdded = 0
      let gamesMerged = 0
      let sessionsAdded = 0

      this.repository.transaction(() => {
        for (const game of manifest.games) {
          const existing = this.repository.findGameByPath(game.installPath)
          let newId: number
          if (existing) {
            const { metadataTaken } = this.repository.mergeBackupGame(existing, game)
            newId = existing.id
            gamesMerged++
            if (metadataTaken) mediaJobs.push({ oldId: game.id, newId, icon: null })
          } else {
            newId = this.repository.insertBackupGame(game)
            gamesAdded++
            mediaJobs.push({ oldId: game.id, newId, icon: game.iconPath })
          }
          sessionsAdded += this.repository.addSessions(newId, sessionsByGame.get(game.id) ?? [])
        }
        for (const root of manifest.roots) this.repository.upsertRoot(root.path, 'user', root.category)
      })

      let imagesRestored = 0
      for (const job of mediaJobs) {
        const prefix = `games/${job.oldId}/`
        for (const entry of container.entries) {
          if (!entry.name.startsWith(prefix) || !isSafeEntryName(entry.name)) continue
          const file = entry.name.slice(prefix.length)
          if (file.includes('/')) continue
          const content = await container.read(entry.name)
          if (!content) continue
          const folder = path.join(this.directories.games, String(job.newId))
          await fs.mkdir(folder, { recursive: true })
          await fs.writeFile(path.join(folder, file), content)
          imagesRestored++
        }
        if (job.icon) {
          const icon = await container.read(`icons/${path.basename(job.icon)}`)
          if (icon) {
            const fileName = `${job.newId}.png`
            await fs.mkdir(this.directories.icons, { recursive: true })
            await fs.writeFile(path.join(this.directories.icons, fileName), icon)
            this.repository.setIcon(job.newId, fileName)
          }
        }
      }

      let profileRestored = false
      if (manifest.profile && manifest.profile.name.trim() && !this.profile.get().created) {
        this.profile.setName(manifest.profile.name)
        const avatar = manifest.profile.avatar ? await container.read(manifest.profile.avatar) : null
        if (avatar) await this.profile.setPhotoFromBuffer(avatar)
        profileRestored = true
      }

      return { gamesAdded, gamesMerged, sessionsAdded, imagesRestored, profileRestored, exportedAt: manifest.exportedAt }
    } finally {
      await container.close()
    }
  }
}
