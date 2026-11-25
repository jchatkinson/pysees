import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { BufferAttribute, CanvasTexture, InstancedBufferAttribute, InstancedBufferGeometry, LinearFilter, Mesh, ShaderMaterial, Vector2, Vector4 } from 'three'

export interface SceneLabel { position: [number, number, number]; text: string }

export interface SceneLabelStyle {
  /** Font size, CSS px. */ size: number
  weight?: number
  color: string
  /** A soft outline around the glyphs (legible over lines without a box). */ halo?: string
  /** Which point of the label sits on its anchor (+ offset): the box's top-left corner, its centre, or its right-middle. */ anchor?: 'top-left' | 'center' | 'right'
  /** Screen offset in CSS px (x right, y down). */ offset?: [number, number]
  /** A box behind the text, CSS px: padded to the text, or a fixed size (a circle: width = height, radius = half). */
  box?: { fill: string; stroke: string; padX?: number; width?: number; height?: number; radius?: number }
  /** CSS px of depth (as seen on screen) the label is pulled toward the camera, so a label just inside a member or in a floor's plane still shows. */
  lift?: number
}

/**
 * Text labels drawn in the scene, depth tested so the model hides those behind it. A cached glyph atlas per style (printable ASCII plus any
 * other characters used), one instance per box and glyph, one draw call per layer; the GPU places them, so camera moves cost nothing. Labels
 * keep a constant pixel size, face the screen and snap to device pixels. No DOM layer, and no drei `<Text>` (see AGENTS.md).
 */
export function SceneLabels({ labels, style }: { labels: SceneLabel[]; style: SceneLabelStyle }) {
  const dpr = useThree((s) => s.viewport.dpr)
  const gl = useThree((s) => s.gl)
  const family = useMemo(() => getComputedStyle(gl.domElement).fontFamily || 'sans-serif', [gl])
  const mesh = useMemo(() => (labels.length ? buildLabels(labels, style, dpr, family) : null), [labels, style, dpr, family])
  useEffect(() => () => { if (mesh) { mesh.geometry.dispose(); (mesh.material as ShaderMaterial).dispose() } }, [mesh])
  return mesh ? <primitive object={mesh} /> : null
}

const VERT = /* glsl */ `
attribute vec3 center;
attribute vec4 rect;   // device px from the snapped anchor (y up): x, y, w, h
attribute vec4 uvRect; // glyph: u0 v0 u1 v1; box: x < 0, y = corner radius (device px)
uniform vec2 viewport;
uniform float lift;
varying vec2 vUv;
varying vec2 vLocal;
varying vec2 vSize;
varying float vRadius;
varying float vBox;
void main() {
  vec2 c = position.xy;
  vBox = uvRect.x < 0.0 ? 1.0 : 0.0;
  vUv = mix(uvRect.xy, uvRect.zw, c);
  vLocal = c * rect.zw; vSize = rect.zw; vRadius = uvRect.y;
  vec4 mv = modelViewMatrix * vec4(center, 1.0);
  // Toward the camera by lift pixels' worth of world at this depth (along the view ray, so the label doesn't move on screen).
  float perPx = 2.0 / (projectionMatrix[1][1] * viewport.y);
  if (projectionMatrix[2][3] == -1.0) mv.xyz *= 1.0 - lift * perPx; else mv.z += lift * perPx;
  gl_Position = projectionMatrix * mv;
  vec2 p = floor((gl_Position.xy / gl_Position.w * 0.5 + 0.5) * viewport + 0.5) + rect.xy + c * rect.zw;
  gl_Position.xy = (p / viewport * 2.0 - 1.0) * gl_Position.w;
}`
const FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec4 fill;
uniform vec4 stroke;
uniform float strokeW;
varying vec2 vUv;
varying vec2 vLocal;
varying vec2 vSize;
varying float vRadius;
varying float vBox;
void main() {
  vec4 col;
  if (vBox > 0.5) {
    vec2 q = abs(vLocal - vSize * 0.5) - (vSize * 0.5 - vRadius);
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - vRadius; // rounded-box distance, < 0 inside
    col = mix(fill, stroke, clamp(d + strokeW + 0.5, 0.0, 1.0)) * clamp(0.5 - d, 0.0, 1.0);
  } else col = texture2D(map, vUv);
  if (col.a < 0.01) discard;
  gl_FragColor = col;
}`

interface Glyph { u0: number; v0: number; u1: number; v1: number; w: number; h: number; adv: number }
interface Atlas { texture: CanvasTexture; glyphs: Map<string, Glyph>; lineH: number; pad: number }

const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i))
const atlases = new WeakMap<SceneLabelStyle, Map<string, Atlas>>()

/** The style's atlas at this pixel ratio, rebuilt (and kept) with more characters when a label needs one it lacks. Never disposed: a few per style. */
function atlasFor(style: SceneLabelStyle, dpr: number, family: string, chars: Set<string>) {
  let byKey = atlases.get(style)
  if (!byKey) atlases.set(style, (byKey = new Map()))
  const key = `${dpr}|${family}`, have = byKey.get(key)
  if (have && [...chars].every((c) => have.glyphs.has(c))) return have
  const atlas = buildAtlas(style, dpr, family, [...new Set([...ASCII, ...(have?.glyphs.keys() ?? []), ...chars])])
  byKey.set(key, atlas)
  return atlas
}

function buildAtlas(style: SceneLabelStyle, dpr: number, family: string, chars: string[]): Atlas {
  const px = Math.round(style.size * dpr), font = `${style.weight ?? 400} ${px}px ${family}`
  const halo = style.halo ? Math.ceil(1.5 * dpr) : 0, pad = 1 + halo, lineH = Math.ceil(px * 1.3)
  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = font
  const W = 1024, cells: { ch: string; x: number; y: number; w: number; adv: number }[] = []
  let x = 0, y = 0
  for (const ch of chars) {
    const adv = measure.measureText(ch).width, w = Math.ceil(adv) + 2 * pad
    if (x + w > W) { x = 0; y += lineH }
    cells.push({ ch, x, y, w, adv }); x += w
  }
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = 2 ** Math.ceil(Math.log2(y + lineH))
  const g = canvas.getContext('2d')!
  Object.assign(g, { font, textBaseline: 'middle', lineJoin: 'round', fillStyle: style.color, strokeStyle: style.halo ?? '', lineWidth: 2 * halo })
  const H = canvas.height, glyphs = new Map<string, Glyph>()
  for (const c of cells) {
    if (halo) g.strokeText(c.ch, c.x + pad, c.y + lineH / 2)
    g.fillText(c.ch, c.x + pad, c.y + lineH / 2)
    glyphs.set(c.ch, { u0: c.x / W, u1: (c.x + c.w) / W, v0: 1 - (c.y + lineH) / H, v1: 1 - c.y / H, w: c.w, h: lineH, adv: c.adv })
  }
  const texture = new CanvasTexture(canvas)
  texture.minFilter = texture.magFilter = LinearFilter; texture.generateMipmaps = false; texture.premultiplyAlpha = true
  return { texture, glyphs, lineH, pad }
}

/** A CSS colour as premultiplied RGBA (raw sRGB values: the shader writes them as is, like the atlas). */
function rgba(css: string) {
  const g = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
  g.fillStyle = css; g.fillRect(0, 0, 1, 1)
  const [r, gr, b, a] = g.getImageData(0, 0, 1, 1).data, al = a / 255
  return new Vector4((r / 255) * al, (gr / 255) * al, (b / 255) * al, al)
}

function buildLabels(labels: SceneLabel[], style: SceneLabelStyle, dpr: number, family: string) {
  const atlas = atlasFor(style, dpr, family, new Set(labels.flatMap((l) => [...l.text])))
  const d = (v: number) => Math.round(v * dpr), box = style.box
  const [ox, oy] = (style.offset ?? [0, 0]).map(d), radius = box?.radius != null ? box.radius * dpr : 0
  const center: number[] = [], rect: number[] = [], uvRect: number[] = []
  const put = (p: [number, number, number], x: number, y: number, w: number, h: number, uv: [number, number, number, number]) => { center.push(...p); rect.push(x, y, w, h); uvRect.push(...uv) }
  // A label may have several lines ('\n'): one row each (box.height is a row's height), left-aligned at padX, or centred in a fixed width.
  const rowH = box?.height != null ? d(box.height) : atlas.lineH, padX = d(box?.padX ?? 0)
  for (const l of labels) {
    const rows = l.text.split('\n').map((t) => { const glyphs = [...t].map((ch) => [ch, atlas.glyphs.get(ch)!] as const); return { glyphs, w: Math.round(glyphs.reduce((s, [, g]) => s + g.adv, 0)) } })
    const bw = box?.width != null ? d(box.width) : Math.max(...rows.map((r) => r.w)) + 2 * padX, bh = rowH * rows.length
    const x0 = Math.round(style.anchor === 'center' ? ox - bw / 2 : style.anchor === 'right' ? ox - bw : ox)
    const top = Math.round(style.anchor === 'center' || style.anchor === 'right' ? oy - bh / 2 : oy)
    if (box) put(l.position, x0, -(top + bh), bw, bh, [-1, radius, 0, 0])
    rows.forEach((r, i) => {
      let pen = x0 + (box?.width != null ? Math.round((bw - r.w) / 2) : padX)
      const y = -(top + i * rowH + Math.round((rowH - atlas.lineH) / 2) + atlas.lineH)
      for (const [ch, g] of r.glyphs) {
        if (ch !== ' ') put(l.position, Math.round(pen) - atlas.pad, y, g.w, g.h, [g.u0, g.v0, g.u1, g.v1])
        pen += g.adv
      }
    })
  }
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3))
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  geometry.setAttribute('center', new InstancedBufferAttribute(new Float32Array(center), 3))
  geometry.setAttribute('rect', new InstancedBufferAttribute(new Float32Array(rect), 4))
  geometry.setAttribute('uvRect', new InstancedBufferAttribute(new Float32Array(uvRect), 4))
  geometry.instanceCount = center.length / 3
  const viewport = new Vector2(1, 1)
  const material = new ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, premultipliedAlpha: true,
    uniforms: { map: { value: atlas.texture }, viewport: { value: viewport }, lift: { value: (style.lift ?? 8) * dpr }, fill: { value: rgba(box?.fill ?? 'transparent') }, stroke: { value: rgba(box?.stroke ?? 'transparent') }, strokeW: { value: Math.max(1, Math.round(dpr * 0.75)) } },
  })
  const mesh = new Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.raycast = () => {}
  mesh.renderOrder = 10
  mesh.onBeforeRender = (renderer) => { renderer.getDrawingBufferSize(viewport) }
  return mesh
}
