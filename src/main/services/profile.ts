import { nativeImage } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ProfileState } from '@shared/types'
import type { Repository } from '../db/repository'

const NAME_KEY = 'profile.name'
const AVATAR_KEY = 'profile.avatar'
const AVATAR_SIZE = 256

/** The offline profile: a name and a photo, kept in the settings table and the profile folder. No account is involved. */
export class ProfileService {
  constructor(
    private readonly repository: Repository,
    readonly directory: string
  ) {}

  get(): ProfileState {
    const name = this.repository.getSetting(NAME_KEY)?.trim() ?? ''
    const avatarFile = this.repository.getSetting(AVATAR_KEY)
    return { created: name.length > 0, name, avatarFile: avatarFile || null }
  }

  setName(name: string): ProfileState {
    this.repository.setSetting(NAME_KEY, name.trim().slice(0, 40))
    return this.get()
  }

  /** Crops the picture to a centered square and stores a small PNG. A new file name each time avoids stale caches. */
  async setPhotoFromFile(source: string): Promise<ProfileState> {
    const image = nativeImage.createFromPath(source)
    if (image.isEmpty()) throw new Error('That file is not a picture Orus can open')
    const { width, height } = image.getSize()
    const side = Math.min(width, height)
    const square = image.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side })
    const png = square.resize({ width: AVATAR_SIZE, height: AVATAR_SIZE, quality: 'best' }).toPNG()
    return this.setPhotoFromBuffer(png)
  }

  async setPhotoFromBuffer(png: Buffer): Promise<ProfileState> {
    await fs.mkdir(this.directory, { recursive: true })
    const previous = this.repository.getSetting(AVATAR_KEY)
    const file = `avatar-${Date.now()}.png`
    await fs.writeFile(path.join(this.directory, file), png)
    this.repository.setSetting(AVATAR_KEY, file)
    if (previous) await fs.rm(path.join(this.directory, path.basename(previous)), { force: true })
    return this.get()
  }

  async removePhoto(): Promise<ProfileState> {
    const previous = this.repository.getSetting(AVATAR_KEY)
    this.repository.deleteSetting(AVATAR_KEY)
    if (previous) await fs.rm(path.join(this.directory, path.basename(previous)), { force: true })
    return this.get()
  }

  async remove(): Promise<ProfileState> {
    await this.removePhoto()
    this.repository.deleteSetting(NAME_KEY)
    return this.get()
  }

  avatarPath(): string | null {
    const file = this.repository.getSetting(AVATAR_KEY)
    return file ? path.join(this.directory, path.basename(file)) : null
  }
}
