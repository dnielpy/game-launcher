import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

/**
 * A gaming PC drawn in code: tower case with a glass side, motherboard, CPU with a liquid cooler, RAM,
 * graphics card, M.2 SSD and RGB fans. The lighting cycles through the rainbow and glows (bloom).
 * Drag to turn it, scroll to zoom, click a part to fly the camera to it.
 *
 * Units are centimetres. The glass side faces -x, the front +z, up is +y.
 */

export type PcPart = 'cpu' | 'gpu' | 'ram' | 'motherboard' | 'storage'

export interface PcSceneCallbacks {
  onHover: (part: PcPart | null, x: number, y: number) => void
  onSelect: (part: PcPart | null) => void
}

export interface PcScene {
  focus: (part: PcPart | null) => void
  resize: () => void
  dispose: () => void
}

// ------------------------------------------------------------------ RGB

const RGB_VERTEX = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const RGB_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uRing;
uniform vec3 uAxis;
uniform float uScale;
uniform float uOffset;
uniform float uIntensity;
varying vec3 vPos;
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
void main() {
  float t = uRing > 0.5 ? atan(vPos.y, vPos.x) / 6.2831853 : dot(vPos, uAxis) * uScale;
  float hue = fract(t + uTime * 0.11 + uOffset);
  float breathe = 0.85 + 0.15 * sin(uTime * 1.7 + uOffset * 6.2831853);
  gl_FragColor = vec4(hsv2rgb(vec3(hue, 1.0, 1.0)) * uIntensity * breathe, 1.0);
}
`

const timeUniform = { value: 0 }

function rgbMaterial(options: { ring?: boolean; axis?: THREE.Vector3; scale?: number; offset?: number; intensity?: number } = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: RGB_VERTEX,
    fragmentShader: RGB_FRAGMENT,
    uniforms: {
      uTime: timeUniform,
      uRing: { value: options.ring ? 1 : 0 },
      uAxis: { value: options.axis ?? new THREE.Vector3(0, 1, 0) },
      uScale: { value: options.scale ?? 0.05 },
      uOffset: { value: options.offset ?? 0 },
      uIntensity: { value: (options.intensity ?? 2.2) * 0.62 }
    }
  })
}

/** Hue shared by the colored lights, in step with the RGB shaders. */
function rgbColor(time: number, offset: number): THREE.Color {
  return new THREE.Color().setHSL((time * 0.11 + offset) % 1, 0.85, 0.55)
}

// ------------------------------------------------------------------ materials

const steel = () => new THREE.MeshStandardMaterial({ color: 0x17181b, metalness: 0.65, roughness: 0.42 })
const pcb = () => new THREE.MeshStandardMaterial({ color: 0x101317, metalness: 0.2, roughness: 0.75 })
const heatsink = () => new THREE.MeshStandardMaterial({ color: 0x2b2e35, metalness: 0.85, roughness: 0.32 })
const plastic = () => new THREE.MeshStandardMaterial({ color: 0x0c0c0e, metalness: 0.1, roughness: 0.55 })
const chrome = () => new THREE.MeshStandardMaterial({ color: 0x9aa0aa, metalness: 1, roughness: 0.18 })

function box(size: [number, number, number], material: THREE.Material, position: [number, number, number]): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
  mesh.position.set(...position)
  return mesh
}

/** A 12 cm fan: frame, RGB ring and spinning blades. The fan blows along its local z. */
function fan(radius = 5.6, offset = 0): { group: THREE.Group; rotor: THREE.Group } {
  const group = new THREE.Group()
  const frame = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.35, 0.55, 12, 48), plastic())
  group.add(frame)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.22, 10, 64), rgbMaterial({ ring: true, offset, intensity: 2.6 }))
  ring.position.z = 0.45
  group.add(ring)
  const rotor = new THREE.Group()
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.2, 24), plastic())
  hub.rotation.x = Math.PI / 2
  rotor.add(hub)
  const hubGlow = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), rgbMaterial({ ring: true, offset: offset + 0.5, intensity: 1.6 }))
  hubGlow.position.z = 0.62
  rotor.add(hubGlow)
  const bladeMaterial = new THREE.MeshStandardMaterial({ color: 0x1b1d22, metalness: 0.2, roughness: 0.4, transparent: true, opacity: 0.9 })
  for (let index = 0; index < 9; index++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(radius - 1.7, 1.5, 0.12), bladeMaterial)
    blade.position.x = (radius - 1.7) / 2 + 1.4
    blade.rotation.x = 0.5
    const arm = new THREE.Group()
    arm.rotation.z = (index / 9) * Math.PI * 2
    arm.add(blade)
    rotor.add(arm)
  }
  group.add(rotor)
  return { group, rotor }
}

function tag(object: THREE.Object3D, part: PcPart): THREE.Object3D {
  object.userData['part'] = part
  return object
}

// ------------------------------------------------------------------ the PC

interface Built {
  root: THREE.Group
  parts: Map<PcPart, THREE.Object3D>
  rotors: THREE.Group[]
  glass: THREE.Mesh
  lights: THREE.PointLight[]
}

function buildPc(): Built {
  const root = new THREE.Group()
  const parts = new Map<PcPart, THREE.Object3D>()
  const rotors: THREE.Group[] = []

  // Case: 22 wide, 50 tall, 46 deep.
  const caseMaterial = steel()
  root.add(box([22, 0.6, 46], caseMaterial, [0, 25, 0])) // top
  root.add(box([22, 0.6, 46], caseMaterial, [0, -25, 0])) // bottom
  root.add(box([0.6, 50, 46], caseMaterial, [11, 0, 0])) // right side
  root.add(box([22, 50, 0.6], caseMaterial, [0, 0, -23])) // back
  for (const z of [-23, 23]) for (const x of [-11, 11]) root.add(box([0.9, 50.6, 0.9], caseMaterial, [x, 0, z])) // pillars
  // Front: dark mesh, see-through enough for the fans.
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(22, 50, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0c, metalness: 0.4, roughness: 0.6, transparent: true, opacity: 0.55 })
  )
  mesh.position.set(0, 0, 23.2)
  root.add(mesh)
  // Feet.
  for (const z of [-19, 19]) for (const x of [-8, 8]) root.add(box([3, 1.2, 3], plastic(), [x, -25.9, z]))
  // Light strip along the front edge.
  const frontStrip = box([0.5, 48, 0.5], rgbMaterial({ axis: new THREE.Vector3(0, 1, 0), scale: 0.02, intensity: 2.4 }), [-10.4, 0, 23.5])
  root.add(frontStrip)

  // Glass side panel.
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 49, 45),
    new THREE.MeshPhysicalMaterial({ color: 0x0d1014, metalness: 0.2, roughness: 0.02, transparent: true, opacity: 0.18, depthWrite: false, clearcoat: 1, envMapIntensity: 0.6 })
  )
  glass.position.set(-11.2, 0, 0)
  glass.renderOrder = 10
  root.add(glass)

  // PSU shroud.
  root.add(box([21, 0.5, 45], steel(), [0, -14, 0]))
  root.add(box([0.5, 11, 45], steel(), [-10.5, -19.5, 0]))
  root.add(box([0.3, 0.6, 30], rgbMaterial({ axis: new THREE.Vector3(0, 0, 1), scale: 0.03, offset: 0.3 }), [-10.8, -14.2, 0]))

  // Motherboard on the right wall, components facing the glass.
  const board = new THREE.Group()
  const plate = box([0.3, 30.5, 24.4], pcb(), [9.6, 8.25, -7.3])
  board.add(plate)
  const traces = new THREE.MeshStandardMaterial({ color: 0x1c2a22, metalness: 0.3, roughness: 0.6 })
  board.add(box([0.05, 26, 0.15], traces, [9.43, 7, 2]))
  board.add(box([0.05, 0.15, 18], traces, [9.43, -1.5, -8]))
  board.add(box([2, 3.2, 8], heatsink(), [8.4, 21.2, -11])) // VRM top
  board.add(box([2, 9, 3], heatsink(), [8.4, 14, -17.2])) // VRM side
  const io = box([2.6, 11, 3.4], plastic(), [8.2, 14, -17.4]) // I/O cover
  board.add(io)
  board.add(box([0.25, 10, 0.4], rgbMaterial({ axis: new THREE.Vector3(0, 1, 0), scale: 0.06, offset: 0.6 }), [6.85, 14, -16]))
  board.add(box([1.6, 4.5, 4.5], heatsink(), [8.6, -5, 0])) // chipset
  for (const y of [-0.9, -6.5]) board.add(box([1.2, 0.8, 9], plastic(), [8.9, y, -9])) // PCIe slots
  board.add(box([0.6, 1.2, 8], chrome(), [8.9, -0.9, -9]))
  tag(board, 'motherboard')
  parts.set('motherboard', board)
  root.add(board)

  // CPU with a liquid cooler: pump block with an RGB ring, tubes up to a top radiator.
  const cpu = new THREE.Group()
  cpu.add(box([0.4, 4.5, 4.5], chrome(), [9.3, 14, -9.5])) // socket plate
  const pump = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.5, 2.6, 40), plastic())
  pump.rotation.z = Math.PI / 2
  pump.position.set(7.6, 14, -9.5)
  cpu.add(pump)
  const pumpRing = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.18, 10, 64), rgbMaterial({ ring: true, offset: 0.15, intensity: 2.8 }))
  pumpRing.rotation.y = Math.PI / 2
  pumpRing.position.set(6.25, 14, -9.5)
  cpu.add(pumpRing)
  const pumpCap = new THREE.Mesh(new THREE.CircleGeometry(2.3, 40), new THREE.MeshStandardMaterial({ color: 0x050506, metalness: 0.9, roughness: 0.2 }))
  pumpCap.rotation.y = -Math.PI / 2
  pumpCap.position.set(6.28, 14, -9.5)
  cpu.add(pumpCap)
  const logo = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.1, 6), rgbMaterial({ ring: true, offset: 0.65, intensity: 2 }))
  logo.rotation.y = -Math.PI / 2
  logo.position.set(6.26, 14, -9.5)
  cpu.add(logo)
  const tubeMaterial = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.5 })
  for (const dz of [-1.2, 1.2]) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(6.6, 15.5, -9.5 + dz), new THREE.Vector3(3, 18.5, -8 + dz * 1.5), new THREE.Vector3(1, 21.5, -5 + dz * 2)])
    cpu.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.55, 10), tubeMaterial))
  }
  tag(cpu, 'cpu')
  parts.set('cpu', cpu)
  root.add(cpu)

  // Radiator under the top panel with two fans blowing down.
  root.add(box([12, 2.6, 27], heatsink(), [-1, 23.2, -4]))
  for (const z of [-10.5, 2.5]) {
    const top = fan(5.6, z * 0.02)
    top.group.rotation.x = Math.PI / 2
    top.group.position.set(-1, 21.3, z)
    rotors.push(top.rotor)
    root.add(top.group)
  }

  // RAM: four sticks with light bars along their tops.
  const ram = new THREE.Group()
  for (let index = 0; index < 4; index++) {
    const z = -3.4 + index * 1.05
    ram.add(box([4.4, 13.3, 0.55], new THREE.MeshStandardMaterial({ color: 0x1d1f24, metalness: 0.7, roughness: 0.35 }), [7.3, 13.5, z]))
    ram.add(box([0.7, 13.1, 0.45], rgbMaterial({ axis: new THREE.Vector3(0, 1, 0), scale: 0.045, offset: index * 0.06, intensity: 2.5 }), [4.85, 13.5, z]))
  }
  tag(ram, 'ram')
  parts.set('ram', ram)
  root.add(ram)

  // M.2 SSD with a heatsink, between the CPU and the graphics card.
  const ssd = new THREE.Group()
  ssd.add(box([0.6, 2.2, 8], heatsink(), [9.1, 4.3, -9]))
  ssd.add(box([0.12, 0.25, 7.6], rgbMaterial({ axis: new THREE.Vector3(0, 0, 1), scale: 0.08, offset: 0.4, intensity: 1.8 }), [8.75, 5.35, -9]))
  ssd.add(box([0.12, 1.6, 2.2], new THREE.MeshStandardMaterial({ color: 0xd6d9de, metalness: 0.6, roughness: 0.3 }), [8.75, 4.2, -11.5]))
  tag(ssd, 'storage')
  parts.set('storage', ssd)
  root.add(ssd)

  // Graphics card in the first slot: long shroud, three fans underneath, light bar on the side.
  const gpu = new THREE.Group()
  gpu.add(box([12, 5, 30], new THREE.MeshStandardMaterial({ color: 0x15161a, metalness: 0.55, roughness: 0.38 }), [3, -3.4, -4.5]))
  gpu.add(box([12, 0.35, 30], new THREE.MeshStandardMaterial({ color: 0x24262c, metalness: 0.8, roughness: 0.3 }), [3, -0.75, -4.5])) // backplate
  gpu.add(box([0.25, 0.7, 26], rgbMaterial({ axis: new THREE.Vector3(0, 0, 1), scale: 0.035, offset: 0.2, intensity: 2.8 }), [-3.1, -1.8, -4.5]))
  gpu.add(box([0.25, 1.4, 6], new THREE.MeshStandardMaterial({ color: 0x0a0a0b, metalness: 0.9, roughness: 0.2 }), [-3.1, -3.8, -12]))
  const groove = new THREE.MeshStandardMaterial({ color: 0x3a3d45, metalness: 0.9, roughness: 0.25 })
  for (const z of [-2, 2, 6, 10]) gpu.add(box([0.2, 2.6, 0.35], groove, [-3.05, -3.9, z]))
  gpu.add(box([12.2, 0.3, 0.8], groove, [3, -5.95, -19.2]))
  gpu.add(box([0.3, 12, 1], chrome(), [8.4, -3.4, -19.6])) // bracket
  for (const [index, z] of [-14, -4.5, 5].entries()) {
    const gpuFan = fan(4.1, 0.1 + index * 0.08)
    gpuFan.group.rotation.x = Math.PI / 2
    gpuFan.group.position.set(3, -6.05, z)
    rotors.push(gpuFan.rotor)
    gpu.add(gpuFan.group)
  }
  tag(gpu, 'gpu')
  parts.set('gpu', gpu)
  root.add(gpu)

  // Case fans: three at the front, one at the back.
  for (const [index, y] of [13, 0, -9.5].entries()) {
    const front = fan(5.6, 0.25 + index * 0.1)
    front.group.position.set(-0.5, y + 2, 21.8)
    rotors.push(front.rotor)
    root.add(front.group)
  }
  const rear = fan(5.6, 0.7)
  rear.group.position.set(-1, 15, -21.8)
  rotors.push(rear.rotor)
  root.add(rear.group)

  // Colored lights inside the case, following the RGB cycle.
  const lights = [new THREE.PointLight(0xffffff, 140, 45, 1.5), new THREE.PointLight(0xffffff, 140, 45, 1.5), new THREE.PointLight(0xffffff, 110, 40, 1.5)]
  lights[0]!.position.set(-4, 14, 14)
  lights[1]!.position.set(-4, -8, 6)
  lights[2]!.position.set(0, 18, -16)
  for (const light of lights) root.add(light)
  const inside = new THREE.PointLight(0xdfe6ff, 90, 50, 1.4)
  inside.position.set(-6, 6, 4)
  root.add(inside)

  return { root, parts, rotors, glass, lights }
}

/** Where the camera goes to look at a part: in front of it, on the glass side, a little above. */
const VIEW_DIRECTIONS: Record<PcPart, THREE.Vector3> = {
  gpu: new THREE.Vector3(-1, -0.42, 0.5), // from a little below, to see the fans
  cpu: new THREE.Vector3(-1, 0.2, 0.35),
  ram: new THREE.Vector3(-1, 0.25, 0.55),
  motherboard: new THREE.Vector3(-1, 0.15, 0.3),
  storage: new THREE.Vector3(-1, 0.3, 0.45)
}

/**
 * Where the camera goes to look at a part: in front of it on the glass side. The aim point moves left of
 * the part, so the part sits in the right half of the screen, clear of the details panel.
 */
function framing(part: PcPart, object: THREE.Object3D): { position: THREE.Vector3; target: THREE.Vector3 } {
  const bounds = new THREE.Box3().setFromObject(object)
  const center = bounds.getCenter(new THREE.Vector3())
  const size = bounds.getSize(new THREE.Vector3())
  const distance = Math.max(size.y, size.z, 14) * 3.3
  const direction = VIEW_DIRECTIONS[part].clone().normalize()
  const position = center.clone().addScaledVector(direction, distance)
  const right = new THREE.Vector3().crossVectors(direction.clone().negate(), new THREE.Vector3(0, 1, 0)).normalize()
  const shift = right.multiplyScalar(-distance * 0.22)
  return { position: position.add(shift), target: center.clone().add(shift) }
}

export function createPcScene(canvas: HTMLCanvasElement, callbacks: PcSceneCallbacks): PcScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  const environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = environment
  scene.environmentIntensity = 0.55
  scene.add(new THREE.HemisphereLight(0x8899aa, 0x080808, 0.6))
  const key = new THREE.DirectionalLight(0xffffff, 1.2)
  key.position.set(-30, 40, 30)
  scene.add(key)

  const built = buildPc()
  scene.add(built.root)

  // Soft glow on the floor, tinted by the RGB.
  const floorMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false, map: radialTexture() })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -26.6
  scene.add(floor)

  const camera = new THREE.PerspectiveCamera(32, 1, 1, 600)
  const home = { position: new THREE.Vector3(-86, 24, 64), target: new THREE.Vector3(0, 1, 0) }
  camera.position.copy(home.position)

  const controls = new OrbitControls(camera, canvas)
  controls.target.copy(home.target)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.enablePan = false
  controls.minDistance = 22
  controls.maxDistance = 190
  controls.minPolarAngle = 0.25
  controls.maxPolarAngle = Math.PI * 0.62
  controls.autoRotate = true
  controls.autoRotateSpeed = 0.55
  controls.rotateSpeed = 0.7

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.62, 0.42, 0.62)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  // Camera flights.
  let flight: { fromPosition: THREE.Vector3; fromTarget: THREE.Vector3; toPosition: THREE.Vector3; toTarget: THREE.Vector3; start: number; duration: number } | null = null
  let focused: PcPart | null = null
  let idleTimer: ReturnType<typeof setTimeout> | null = null

  function flyTo(position: THREE.Vector3, target: THREE.Vector3) {
    flight = { fromPosition: camera.position.clone(), fromTarget: controls.target.clone(), toPosition: position, toTarget: target, start: performance.now(), duration: 1100 }
  }

  function focus(part: PcPart | null) {
    focused = part
    controls.autoRotate = false
    if (idleTimer) clearTimeout(idleTimer)
    if (part) {
      const shot = framing(part, built.parts.get(part)!)
      flyTo(shot.position, shot.target)
    } else {
      flyTo(home.position.clone(), home.target.clone())
      idleTimer = setTimeout(() => (controls.autoRotate = focused === null), 6000)
    }
  }

  controls.addEventListener('start', () => {
    controls.autoRotate = false
    flight = null
    if (idleTimer) clearTimeout(idleTimer)
  })
  controls.addEventListener('end', () => {
    if (focused === null) idleTimer = setTimeout(() => (controls.autoRotate = focused === null), 8000)
  })

  // Picking.
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const pickable: THREE.Object3D[] = [...built.parts.values()]

  function partAt(event: PointerEvent): PcPart | null {
    const rect = canvas.getBoundingClientRect()
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    const hit = raycaster.intersectObjects(pickable, true)[0]
    let object: THREE.Object3D | null = hit?.object ?? null
    while (object && object.userData['part'] === undefined) object = object.parent
    return (object?.userData['part'] as PcPart | undefined) ?? null
  }

  let downAt: { x: number; y: number } | null = null
  let hovered: PcPart | null = null
  const onPointerDown = (event: PointerEvent) => (downAt = { x: event.clientX, y: event.clientY })
  const onPointerMove = (event: PointerEvent) => {
    if (event.buttons !== 0) return
    const part = partAt(event)
    if (part !== hovered) {
      hovered = part
      canvas.style.cursor = part ? 'pointer' : 'grab'
      setHighlight(part)
    }
    callbacks.onHover(part, event.clientX, event.clientY)
  }
  const onPointerUp = (event: PointerEvent) => {
    if (!downAt || Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 5) return
    const part = partAt(event)
    callbacks.onSelect(part)
  }
  const onPointerLeave = () => {
    hovered = null
    setHighlight(null)
    callbacks.onHover(null, 0, 0)
  }
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointerleave', onPointerLeave)

  // Hover highlight: a thin glowing outline box around the part.
  const outline = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color(0x3fbf3f))
  ;(outline.material as THREE.LineBasicMaterial).transparent = true
  ;(outline.material as THREE.LineBasicMaterial).opacity = 0.8
  outline.visible = false
  scene.add(outline)
  function setHighlight(part: PcPart | null) {
    if (!part) {
      outline.visible = false
      return
    }
    outline.box.setFromObject(built.parts.get(part)!).expandByScalar(0.4)
    outline.visible = true
  }

  function resize() {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width === 0 || height === 0) return
    renderer.setSize(width, height, false)
    composer.setSize(width, height)
    bloom.resolution.set(width / 2, height / 2)
    camera.aspect = width / height
    // Keep the whole case in view on narrow windows.
    camera.fov = width / height < 1.2 ? 40 : 32
    camera.updateProjectionMatrix()
  }
  resize()

  const clock = new THREE.Clock()
  let frame = 0
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  const glassMaterial = built.glass.material as THREE.MeshPhysicalMaterial

  function render() {
    frame = requestAnimationFrame(render)
    const delta = Math.min(clock.getDelta(), 0.05)
    const time = clock.elapsedTime
    timeUniform.value = time
    for (const [index, rotor] of built.rotors.entries()) rotor.rotation.z += delta * (7 + (index % 3))
    for (const [index, light] of built.lights.entries()) light.color.copy(rgbColor(time, index * 0.22))
    floorMaterial.color.copy(rgbColor(time, 0.1)).lerp(new THREE.Color(0xffffff), 0.35)

    if (flight) {
      const progress = Math.min(1, (performance.now() - flight.start) / flight.duration)
      const eased = ease(progress)
      camera.position.lerpVectors(flight.fromPosition, flight.toPosition, eased)
      controls.target.lerpVectors(flight.fromTarget, flight.toTarget, eased)
      if (progress >= 1) flight = null
    }
    // The glass fades away while looking at a part, so nothing sits between the camera and it.
    const glassOpacity = focused ? 0 : 0.18
    glassMaterial.opacity += (glassOpacity - glassMaterial.opacity) * Math.min(1, delta * 6)
    built.glass.visible = glassMaterial.opacity > 0.005

    controls.update()
    composer.render()
  }
  render()

  return {
    focus,
    resize,
    dispose() {
      cancelAnimationFrame(frame)
      if (idleTimer) clearTimeout(idleTimer)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      controls.dispose()
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh
        mesh.geometry?.dispose()
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(material)) material.forEach((item) => item.dispose())
        else material?.dispose()
      })
      environment.dispose()
      composer.dispose()
      renderer.dispose()
    }
  }
}

/** White in the middle fading to nothing: the floor glow. */
function radialTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.35)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
