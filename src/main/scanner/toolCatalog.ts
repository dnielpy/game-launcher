import path from 'node:path'
import { normalizeForComparison } from './nameCleaner'

interface ToolEntry {
  /** Name shown in the library. */
  name: string
  /** Tested against the normalized title (lower-case, alphanumeric, single spaces). */
  title: RegExp
  /** Tested against the executable file name without extension, lower-case. */
  exe?: RegExp
}

/**
 * Programs that live next to games but are not games: launchers, overlays,
 * emulators, trainers and monitoring tools. They go to the Tools section.
 */
const TOOLS: ToolEntry[] = [
  // Monitoring and tuning
  { name: 'MSI Afterburner', title: /^msi afterburner\b/, exe: /^msiafterburner$/ },
  { name: 'RivaTuner Statistics Server', title: /^rivatuner\b/, exe: /^rtss$/ },
  { name: 'HWiNFO', title: /^hwinfo\b/, exe: /^hwinfo(32|64)?$/ },
  { name: 'CPU-Z', title: /^cpu z\b/, exe: /^cpuz(_x64)?$/ },
  { name: 'GPU-Z', title: /^gpu z\b/, exe: /^gpu-?z/ },
  { name: 'FPS Monitor', title: /^fps monitor\b/ },
  { name: 'Lossless Scaling', title: /^lossless scaling\b/, exe: /^losslessscaling$/ },
  { name: 'NVIDIA App', title: /^nvidia (app|geforce experience)\b/ },
  { name: 'AMD Software', title: /^amd (software|radeon)\b/ },
  { name: 'Razer Cortex', title: /^razer cortex\b/ },
  { name: 'Special K', title: /^special k\b/, exe: /^skif$/ },
  { name: 'ReShade', title: /^reshade\b/ },
  { name: 'Wallpaper Engine', title: /^wallpaper engine\b/, exe: /^wallpaper(32|64)$/ },

  // Store launchers
  { name: 'Steam', title: /^steam$/, exe: /^steam$/ },
  { name: 'Epic Games Launcher', title: /^epic games( launcher)?$/, exe: /^epicgameslauncher$/ },
  { name: 'GOG Galaxy', title: /^gog galaxy\b/, exe: /^galaxyclient$/ },
  { name: 'EA app', title: /^(ea app|ea desktop|electronic arts|origin)$/, exe: /^(eadesktop|origin)$/ },
  { name: 'Ubisoft Connect', title: /^(ubisoft connect|ubisoft game launcher|uplay)$/, exe: /^(ubisoftconnect|upc|uplay)$/ },
  { name: 'Battle.net', title: /^battle net$/, exe: /^battle\.net( launcher)?$/ },
  { name: 'Rockstar Games Launcher', title: /^rockstar games launcher\b/ },
  { name: 'Riot Client', title: /^riot client\b/, exe: /^riotclientservices$/ },
  { name: 'Xbox', title: /^xbox( app)?$/ },
  { name: 'Hydra Launcher', title: /^hydra( launcher)?$/ },
  { name: 'Heroic Games Launcher', title: /^heroic\b/ },
  { name: 'Playnite', title: /^playnite\b/ },
  { name: 'LaunchBox', title: /^launchbox\b/ },
  { name: 'Steam ROM Manager', title: /^steam rom manager\b/ },

  // Emulators
  { name: 'yuzu', title: /^yuzu\b/, exe: /^yuzu(-cmd)?$/ },
  { name: 'suyu', title: /^suyu\b/ },
  { name: 'Sudachi', title: /^sudachi\b/ },
  { name: 'Citron', title: /^citron\b/ },
  { name: 'Ryujinx', title: /^ryujinx\b/, exe: /^ryujinx$/ },
  { name: 'RPCS3', title: /^rpcs3\b/, exe: /^rpcs3$/ },
  { name: 'PCSX2', title: /^pcsx2\b/, exe: /^pcsx2/ },
  { name: 'Dolphin', title: /^dolphin( emulator)?( x64)?$/, exe: /^dolphin$/ },
  { name: 'RetroArch', title: /^retroarch\b/, exe: /^retroarch$/ },
  { name: 'Cemu', title: /^cemu\b/, exe: /^cemu$/ },
  { name: 'DuckStation', title: /^duckstation\b/, exe: /^duckstation/ },
  { name: 'PPSSPP', title: /^ppsspp\b/, exe: /^ppssppwindows/ },
  { name: 'Xenia', title: /^xenia\b/, exe: /^xenia/ },
  { name: 'Citra', title: /^(citra|lime3ds|azahar)\b/ },
  { name: 'melonDS', title: /^melonds\b/ },
  { name: 'DeSmuME', title: /^desmume\b/ },
  { name: 'mGBA', title: /^mgba\b/ },
  { name: 'Vita3K', title: /^vita3k\b/ },
  { name: 'shadPS4', title: /^shadps4\b/ },

  // Trainers, controllers and recording
  { name: 'Cheat Engine', title: /^cheat engine\b/ },
  { name: 'WeMod', title: /^wemod\b/ },
  { name: 'DS4Windows', title: /^ds4windows\b/ },
  { name: 'DSX', title: /^dsx$/ },
  { name: 'x360ce', title: /^x360ce\b/ },
  { name: 'OBS Studio', title: /^obs( studio)?$/, exe: /^obs(32|64)$/ },
  { name: 'Discord', title: /^discord$/ }
]

export interface ToolMatch {
  name: string
}

/** Returns the tool a game candidate actually is, or null when it looks like a game. */
export function matchTool(title: string, folderName: string, exePath: string | null): ToolMatch | null {
  const titles = [normalizeForComparison(title), normalizeForComparison(folderName)]
  const exe = exePath ? path.win32.basename(exePath).replace(/\.exe$/i, '').toLowerCase() : null
  for (const tool of TOOLS) {
    if (titles.some((value) => tool.title.test(value))) return { name: tool.name }
    if (exe && tool.exe?.test(exe)) return { name: tool.name }
  }
  return null
}
