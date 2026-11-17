import { z } from 'zod'

const text = z.string().max(5000)
const stringList = z.array(z.string().max(500)).max(200).default([])

const launchSchema = z
  .union([
    z.object({ type: z.literal('exe'), exePath: z.string().min(1), args: z.string().default(''), workingDir: z.string().default('') }),
    z.object({ type: z.literal('uri'), uri: z.string().min(1) })
  ])
  .nullable()

const metadataSchema = z
  .object({
    source: z.enum(['steam', 'rawg']),
    externalId: z.string(),
    name: z.string(),
    shortDescription: text.nullable().default(null),
    description: z.string().max(100_000).nullable().default(null),
    releaseDate: z.string().nullable().default(null),
    genres: stringList,
    developers: stringList,
    publishers: stringList,
    rating: z.number().nullable().default(null),
    ratingLabel: z.string().nullable().default(null),
    ratingCount: z.number().nullable().default(null),
    metacritic: z.number().nullable().default(null),
    storeUrl: z.string().nullable().default(null),
    coverFile: z.string().nullable().default(null),
    heroFile: z.string().nullable().default(null),
    logoFile: z.string().nullable().default(null),
    screenshotFiles: stringList
  })
  .nullable()

export const backupGameSchema = z.object({
  id: z.number().int(),
  installPath: z.string().min(1),
  folderName: z.string(),
  title: z.string().min(1),
  searchTitle: z.string(),
  launch: launchSchema,
  sources: z.array(z.enum(['folder', 'registry', 'shortcut', 'steam', 'epic', 'manual'])).default([]),
  category: z.enum(['game', 'tool', 'emulator']),
  engine: z.enum(['unity', 'unreal', 'gamemaker', 'godot', 'rpgmaker', 'unknown']).default('unknown'),
  confidence: z.number().default(0),
  needsReview: z.boolean().default(false),
  exeCandidates: z.array(z.object({ path: z.string(), score: z.number(), sizeBytes: z.number() })).default([]),
  sizeBytes: z.number().default(0),
  status: z.enum(['installed', 'missing', 'unavailable']).default('installed'),
  hidden: z.boolean().default(false),
  favorite: z.boolean().default(false),
  iconPath: z.string().nullable().default(null),
  manualFields: z.array(z.enum(['title', 'exe', 'args', 'category', 'match', 'location'])).default([]),
  metadata: metadataSchema.default(null),
  metadataStatus: z.enum(['pending', 'matched', 'not_found', 'skipped']).default('pending'),
  addedAt: z.string(),
  updatedAt: z.string(),
  lastSeenAt: z.string()
})

export const backupSessionSchema = z.object({
  gameId: z.number().int(),
  startedAt: z.string().min(1),
  endedAt: z.string().min(1),
  seconds: z.number().min(0)
})

export const backupManifestSchema = z.object({
  format: z.literal(1),
  app: z.literal('Orus'),
  appVersion: z.string().default('unknown'),
  exportedAt: z.string(),
  profile: z.object({ name: z.string().max(80), avatar: z.string().nullable().default(null) }).nullable().default(null),
  roots: z.array(z.object({ path: z.string().min(1), category: z.enum(['games', 'noisy']) })).default([]),
  games: z.array(backupGameSchema),
  sessions: z.array(backupSessionSchema).default([])
})

export type BackupManifest = z.infer<typeof backupManifestSchema>
