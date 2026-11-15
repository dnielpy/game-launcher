/**
 * Folder names that are never games and are never worth descending into.
 * Compared case-insensitively against a single path segment.
 */
const EXCLUDED_FOLDER_NAMES = new Set(
  [
    'windows',
    '$recycle.bin',
    'system volume information',
    'recovery',
    'perflogs',
    'programdata',
    'appdata',
    'msocache',
    'config.msi',
    '$windows.~bt',
    '$windows.~ws',
    '$winreagent',
    'windowsapps',
    'node_modules',
    '.git',
    '.cache',
    'common files',
    'windows defender',
    'windows mail',
    'windows media player',
    'windows nt',
    'windows photo viewer',
    'windows portable devices',
    'windows security',
    'windows sidebar',
    'windowspowershell',
    'internet explorer',
    'microsoft',
    'microsoft office',
    'microsoft office 15',
    'microsoft update health tools',
    'microsoft visual studio',
    'microsoft sdks',
    'microsoft sql server',
    'microsoft.net',
    'reference assemblies',
    'dotnet',
    'nvidia corporation',
    'nvidia',
    'intel',
    'amd',
    'realtek',
    'google',
    'mozilla firefox',
    'mozilla maintenance service',
    'java',
    'git',
    'nodejs',
    'python',
    'docker',
    'oracle',
    'vmware',
    'virtualbox',
    'msbuild',
    'iis',
    'iis express',
    'uninstall information',
    'installshield installation information',
    'package cache',
    'packages',
    'temp',
    'tmp',
    'drivers',
    'driverstore'
  ].map((name) => name.toLowerCase())
)

/** Prefixes for vendor folders full of tools, not games. */
const EXCLUDED_FOLDER_PREFIXES = ['microsoft ', 'windows ', 'nvidia ', 'intel(r)', 'amd ', 'dell ', 'hp ', 'lenovo ', 'asus ']

/**
 * Subfolders inside a game that hold redistributables or support tools.
 * Executables found there are never the game.
 */
const SUPPORT_FOLDER_NAMES = new Set(
  [
    '_commonredist',
    '_redist',
    'redist',
    'redistributables',
    'redistributable',
    'directx',
    'dxsetup',
    'vcredist',
    'support',
    '__installer',
    '_installer',
    'installer',
    'easyanticheat',
    'battleye',
    'prereqs',
    'prerequisites',
    'dotnetfx',
    'physx',
    'crashreporter',
    'crashpad',
    'extras',
    'thirdparty',
    'third_party',
    'tools',
    'sdk',
    'docs',
    'manual',
    'soundtrack',
    'ost',
    'artbook',
    '_unpack',
    'md5'
  ].map((name) => name.toLowerCase())
)

/** Executables that are never the main game binary. Matched against the file name without extension. */
const EXCLUDED_EXE_PATTERNS: RegExp[] = [
  /^unins\d*$/i,
  /^uninstall/i,
  /^setup/i,
  /^install(er)?$/i,
  /^installer/i,
  /redist/i,
  /^vc_?redist/i,
  /^dxsetup$/i,
  /^dxwebsetup$/i,
  /^dotnet/i,
  /^ndp\d+/i,
  /^oalinst$/i,
  /^physx/i,
  /^unitycrashhandler/i,
  /crashreport/i,
  /crash_?handler/i,
  /^crashpad/i,
  /^bugsplat/i,
  /^easyanticheat/i,
  /^eac_?launcher/i,
  /^start_protected_game$/i,
  /^beservice/i,
  /^battleye/i,
  /^ue4prereqsetup/i,
  /^ueprereqsetup/i,
  /prereq/i,
  /^quicksfv$/i,
  /^7z/i,
  /^unrar$/i,
  /^ffmpeg$/i,
  /^ffprobe$/i,
  /^python\w*$/i,
  /^pythonw?$/i,
  /^node$/i,
  /^java(w)?$/i,
  /^cefsharp/i,
  /^cef_?subprocess/i,
  /^webhelper$/i,
  /^steamerrorreporter/i,
  /^steamwebhelper$/i,
  /^zfgamebrowser$/i,
  /^notification_helper$/i,
  /^dowser$/i,
  /^touchup$/i,
  /^cleanup$/i,
  /^activation/i,
  /^register/i,
  /^update(r)?$/i,
  /^autoupdate/i,
  /^patcher$/i,
  /^verify/i,
  /^repair$/i,
  /^nw_?helper/i
]

/** Executables that are usually NOT the game but can be (launchers, config tools). Penalized, not excluded. */
const DISCOURAGED_EXE_PATTERNS: { pattern: RegExp; penalty: number }[] = [
  { pattern: /launcher/i, penalty: 12 },
  { pattern: /config|settings|options|setup_?tool/i, penalty: 25 },
  { pattern: /editor|modkit|sdk|devkit/i, penalty: 25 },
  { pattern: /server|dedicated/i, penalty: 25 },
  { pattern: /benchmark|bench$/i, penalty: 25 },
  { pattern: /^tool|_tool|tools$/i, penalty: 20 },
  { pattern: /report|feedback|survey/i, penalty: 20 },
  { pattern: /^dx(9|10|11|12)$|_dx(9|10|11)$/i, penalty: 6 },
  { pattern: /(_|-)?(x86|32bit|win32)$/i, penalty: 6 }
]

export function isExcludedFolderName(name: string): boolean {
  const lower = name.toLowerCase()
  if (EXCLUDED_FOLDER_NAMES.has(lower)) return true
  if (lower.startsWith('$')) return true
  return EXCLUDED_FOLDER_PREFIXES.some((prefix) => lower.startsWith(prefix))
}

export function isSupportFolderName(name: string): boolean {
  return SUPPORT_FOLDER_NAMES.has(name.toLowerCase())
}

export function isExcludedExecutable(fileName: string): boolean {
  const base = fileName.replace(/\.exe$/i, '')
  return EXCLUDED_EXE_PATTERNS.some((pattern) => pattern.test(base))
}

export function executablePenalty(fileName: string): number {
  const base = fileName.replace(/\.exe$/i, '')
  return DISCOURAGED_EXE_PATTERNS.reduce((total, rule) => (rule.pattern.test(base) ? total + rule.penalty : total), 0)
}
