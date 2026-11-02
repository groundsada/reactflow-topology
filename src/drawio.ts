import { deflateRaw } from 'pako'
import { healthFor, shortSite, siteColours, vlanColours } from './data'
import { groupedLayout, layeredLayout, metroLayout, radialLayout } from './layouts'
import type { DeviceNode, Path } from './types'

export type ExportLayout = 'layered' | 'grouped' | 'radial' | 'metro'
export type ExportColour = 'mixed' | 'site' | 'vlan' | 'mono'
export type ExportDetail = 'full' | 'compact'

export type ExportOptions = {
  layout: ExportLayout
  colour: ExportColour
  detail: ExportDetail
  edgeLabels: boolean
  legend: boolean
  pages: boolean
}

export const DEFAULT_OPTIONS: ExportOptions = {
  layout: 'layered',
  colour: 'mixed',
  detail: 'full',
  edgeLabels: true,
  legend: true,
  pages: true,
}

const MONO = '#55606d'
const INK = '#1a2029'
const DIM = '#5d6975'
const PORT_INK = '#6a7682'
const OK = '#2e7d32'
const WARN = '#b26a00'
const UNMANAGED = '#8a949e'

export type SceneNode = {
  id: string
  x: number
  y: number
  w: number
  h: number
  device: DeviceNode
  stroke: string
  parent: string | null
}

export type SceneGroup = { id: string; site: string; x: number; y: number; w: number; h: number; colour: string }

export type SceneEdge = {
  id: string
  source: string
  target: string
  stroke: string
  width: number
  dash: string | null
  label: string | null
  labelColor: string
  exitX: number
  exitY: number
  entryX: number
  entryY: number
}

// solid pastel fills for site containers, straight from the reference diagrams
const GROUP_FILLS = ['#A9C4EB', '#D5E8D4', '#FFE6CC', '#F8CECC', '#E1D5E7', '#DAE8FC', '#FFF2CC', '#D0E0E3']
function groupFill(site: string): string {
  return GROUP_FILLS[Math.abs([...site].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)) % GROUP_FILLS.length]
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

// attach lines to the shape edge facing the other endpoint, so they never
// start in the middle of a box and cover its text
function anchorOf(nodes: SceneNode[], source: string, target: string): { exitX: number; exitY: number; entryX: number; entryY: number } {
  const a = nodes.find((n) => n.id === source)
  const b = nodes.find((n) => n.id === target)
  if (!a || !b) return { exitX: 0.5, exitY: 0.5, entryX: 0.5, entryY: 0.5 }
  const dx = b.x + b.w / 2 - (a.x + a.w / 2)
  const dy = b.y + b.h / 2 - (a.y + a.h / 2)
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { exitX: 1, exitY: 0.5, entryX: 0, entryY: 0.5 }
      : { exitX: 0, exitY: 0.5, entryX: 1, entryY: 0.5 }
  }
  return dy >= 0
    ? { exitX: 0.5, exitY: 1, entryX: 0.5, entryY: 0 }
    : { exitX: 0.5, exitY: 0, entryX: 0.5, entryY: 1 }
}

export type Scene = {
  nodes: SceneNode[]
  groups: SceneGroup[]
  edges: SceneEdge[]
  legend: { site: string; colour: string }[]
  bounds: { x: number; y: number; w: number; h: number }
}

export function scene(path: Path, options: ExportOptions): Scene {
  const bySite = siteColours(path)
  const byVlan = vlanColours(path)
  const strokeOf = (device: DeviceNode): string =>
    options.colour === 'mono'
      ? '#000000'
      : options.colour === 'vlan'
        ? byVlan.get(device.vlans[0] ?? '') ?? '#3399FF'
        : bySite.get(device.site) ?? '#3399FF'

  let placed: Map<string, { x: number; y: number; w: number; h: number }>
  let groups: SceneGroup[] = []
  if (options.layout === 'grouped') {
    const laid = groupedLayout(path)
    // inner node positions are relative to their site box; add the box origin
    const origin = new Map(laid.groups.map((box) => [box.site, box]))
    const siteOf = new Map(path.nodes.map((n) => [n.id, n.site]))
    placed = new Map()
    for (const [id, pos] of laid.nodes) {
      const box = origin.get(siteOf.get(id) ?? '')
      placed.set(id, { x: (box?.x ?? 0) + pos.x, y: (box?.y ?? 0) + pos.y, w: pos.w, h: pos.h })
    }
  } else if (options.layout === 'radial') {
    placed = radialLayout(path)
  } else if (options.layout === 'metro') {
    placed = metroLayout(path)
  } else {
    placed = layeredLayout(path, 'LR')
  }

  // export boxes are sized to their content, not the on-screen node size:
  // title 16 bold + one line per row, so nothing clips
  const SCALE = 2.1
  const nodeSize = (node: DeviceNode): { w: number; h: number } => {
    const rows = options.detail === 'full' ? 2 + Math.min(node.ports.length, 4) + (node.ports.length > 4 ? 1 : 0) : 2
    return { w: 320, h: Math.max(84, 40 + rows * 24) }
  }

  const nodes: SceneNode[] = path.nodes
    .filter((node) => placed.has(node.id))
    .map((node) => {
      const pos = placed.get(node.id)!
      const size = nodeSize(node)
      return {
        id: node.id,
        x: pos.x * SCALE,
        y: pos.y * SCALE,
        w: size.w,
        h: size.h,
        device: node,
        stroke: strokeOf(node),
        parent: options.layout === 'grouped' ? `group-${node.site}` : null,
      }
    })

  // group boxes recomputed from the sized child nodes, with room for the label
  if (options.layout === 'grouped') {
    groups = [...new Set(nodes.map((n) => n.device.site))].map((site) => {
      const members = nodes.filter((n) => n.device.site === site)
      const minx = Math.min(...members.map((n) => n.x)) - 60
      const miny = Math.min(...members.map((n) => n.y)) - 84
      const maxx = Math.max(...members.map((n) => n.x + n.w)) + 60
      const maxy = Math.max(...members.map((n) => n.y + n.h)) + 60
      return { id: `group-${site}`, site, x: minx, y: miny, w: maxx - minx, h: maxy - miny, colour: bySite.get(site) ?? MONO }
    })
  }

  // per-link mixed palette, the way the hand-drawn diagrams do it: each
  // circuit picks its own color instead of one uniform accent
  const LINK_PALETTE = ['#3399FF', '#000000', '#4D9900', '#B09500', '#7F00FF', '#1BA1E2', '#00994D', '#CC0000', '#3700CC', '#808080']
  const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)

  const edges: SceneEdge[] = path.edges.map((edge) => {
    const vlans = edge.vlans
    const stroke =
      edge.scope === 'transit'
        ? '#808080'
        : options.colour === 'mono'
          ? '#000000'
          : options.colour === 'vlan'
            ? vlans.length
              ? byVlan.get(vlans[0]) ?? '#3399FF'
              : '#3399FF'
            : options.colour === 'site'
              ? bySite.get(path.nodes.find((n) => n.id === edge.source)?.site ?? '') ?? '#3399FF'
              : LINK_PALETTE[Math.abs(hash(edge.id)) % LINK_PALETTE.length]
    // width encodes weight: fat ribbons, like the reference diagrams
    const width =
      edge.scope === 'transit' ? 10 : edge.scope === 'interdomain' ? 16 : Math.min(6 + (edge.sessions.length - 1) * 6, 40)
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      stroke,
      width,
      dash: edge.scope === 'transit' ? '1 1' : edge.scope === 'internal' ? '1 1' : null,
      label: options.edgeLabels ? (vlans.length ? vlans.join(',') : edge.scope === 'transit' ? 'transit' : '') : null,
      labelColor: luminance(stroke) < 0.45 ? '#FFFFFF' : INK,
      ...anchorOf(nodes, edge.source, edge.target),
    }
  })

  const xs = [...nodes.map((n) => n.x), ...groups.map((g) => g.x)]
  const ys = [...nodes.map((n) => n.y), ...groups.map((g) => g.y)]
  const xe = [...nodes.map((n) => n.x + n.w), ...groups.map((g) => g.x + g.w)]
  const ye = [...nodes.map((n) => n.y + n.h), ...groups.map((g) => g.y + g.h)]
  const minx = xs.length ? Math.min(...xs) : 0
  const miny = ys.length ? Math.min(...ys) : 0
  const bounds = {
    x: minx,
    y: miny,
    w: (xe.length ? Math.max(...xe) : minx + 400) - minx,
    h: (ye.length ? Math.max(...ye) : miny + 300) - miny,
  }

  return {
    nodes,
    groups,
    edges,
    legend: [...bySite.entries()].map(([site, colour]) => ({ site, colour })),
    bounds,
  }
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function cellId(prefix: string, n: number): string {
  return `${prefix}-${n}`
}

export type DrawioPage = { name: string; xml: string }

export function drawioPages(path: Path, options: ExportOptions): DrawioPage[] {
  const base = scene(path, options)
  const pages: DrawioPage[] = []

  const diagram = (s: Scene, includeLegend: boolean): string => {
    const title = `${esc(path.name)} · ${esc(path.state ?? '')}${path.senseState ? ` · ${esc(path.senseState)}` : ''}`
    const cells: string[] = []
    cells.push(`<mxCell id="0" />`)
    cells.push(`<mxCell id="1" parent="0" />`)
    let n = 2

    if (includeLegend && options.legend && s.legend.length) {
      const lx = s.bounds.x
      const ly = s.bounds.y + s.bounds.h + 110
      let row = 0
      let col = 0
      const cellW = 150
      const cellH = 22
      cells.push(
        `<mxCell id="${cellId('legend', n++)}" value="${esc(title)}" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontSize=56;fontStyle=1;fontColor=#7F00FF;fontFamily=Helvetica" vertex="1" parent="1"><mxGeometry x="${lx}" y="${s.bounds.y - 96}" width="900" height="64" as="geometry" /></mxCell>`,
      )
      for (const item of s.legend) {
        const x = lx + col * cellW
        const y = ly + row * cellH
        cells.push(
          `<mxCell id="${cellId('leg', n++)}" value="${esc(shortSite(item.site))}" style="rounded=1;arcSize=30;whiteSpace=wrap;html=1;fillColor=${groupFill(item.site)};strokeColor=${item.colour};strokeWidth=3;fontSize=18;fontColor=${INK};fontFamily=Helvetica;verticalAlign=middle" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${cellW - 8}" height="${cellH - 4}" as="geometry" /></mxCell>`,
        )
        col += 1
        if (col >= 4) {
          col = 0
          row += 1
        }
      }
    }

    for (const g of s.groups) {
      const count = s.nodes.filter((node) => node.parent === g.id).length
      const label = `${esc(shortSite(g.site))} (${count})`
      cells.push(
        `<mxCell id="${esc(g.id)}" value="${label}" style="rounded=1;arcSize=30;whiteSpace=wrap;html=1;fillColor=${groupFill(g.site)};strokeColor=${g.colour};strokeWidth=6;fontColor=${g.colour};fontSize=26;fontStyle=1;fontFamily=Helvetica;verticalAlign=top;spacingTop=16;spacingLeft=18" vertex="1" parent="1"><mxGeometry x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" as="geometry" /></mxCell>`,
      )
    }

    for (const node of s.nodes) {
      const d = node.device
      const health = healthFor(path, d.site)
      const statusColour = health?.status === 'ok' ? OK : health?.status === 'warning' ? WARN : UNMANAGED
      const lines: string[] = []
      if (options.detail === 'full') {
        lines.push(`<font style="font-size:22px"><b>${d.label}${d.endpoint ? ' (endpoint)' : ''}</b></font>`)
        lines.push(`<font style="font-size:15px" color="${DIM}">${esc(shortSite(d.site))} · ${d.kind === 'host' ? 'host' : 'switch'}</font>`)
        for (const port of d.ports.slice(0, 4)) {
          const parts = [port.name, port.vlan ? `VLAN ${port.vlan}` : '', port.ipv4 ?? '', port.ipv6 ?? ''].filter(Boolean)
          lines.push(`<font style="font-size:14px" color="${PORT_INK}">${esc(parts.join(' · '))}</font>`)
        }
        if (d.ports.length > 4) lines.push(`<font style="font-size:14px" color="${PORT_INK}">+${d.ports.length - 4} more ports</font>`)
      } else {
        lines.push(`<font style="font-size:22px"><b>${d.label}${d.endpoint ? ' (endpoint)' : ''}</b></font>`)
        lines.push(`<font style="font-size:15px" color="${DIM}">${esc(shortSite(d.site))}</font>`)
      }
      const value = lines.join('<br/>')
      const dashed = d.kind === 'host' ? ';dashed=1;dashPattern=1 1' : ''
      cells.push(
        `<mxCell id="${esc(node.id)}" value="${esc(value)}" style="rounded=1;arcSize=20;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=${node.stroke};strokeWidth=5${dashed};fontColor=${INK};fontSize=14;fontFamily=Helvetica;verticalAlign=top;align=left;spacingLeft=8;spacingTop=6" vertex="1" parent="1"><mxGeometry x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" as="geometry" /></mxCell>`,
      )
      if (options.detail === 'full' && health) {
        cells.push(
          `<mxCell id="${cellId('dot', n++)}" value="" style="ellipse;fillColor=${statusColour};strokeColor=none" vertex="1" parent="1"><mxGeometry x="${node.x + node.w - 19}" y="${node.y + 6}" width="11" height="11" as="geometry" /></mxCell>`,
        )
      }
    }

    for (const edge of s.edges) {
      const dash = edge.dash ? `;dashed=1;dashPattern=${edge.dash}` : ''
      // label sits directly on the line, contrasting with the line color
      const label = edge.label ? `;fontSize=24;fontStyle=1;fontColor=${edge.labelColor};labelBackgroundColor=none` : ''
      cells.push(
        `<mxCell id="${esc(edge.id)}" value="${edge.label ? esc(edge.label) : ''}" style="endArrow=none;html=1;rounded=0;curved=1;exitX=${edge.exitX};exitY=${edge.exitY};exitDx=0;exitDy=0;exitPerimeter=1;entryX=${edge.entryX};entryY=${edge.entryY};entryDx=0;entryDy=0;entryPerimeter=1;strokeColor=${edge.stroke};strokeWidth=${edge.width}${dash}${label}" edge="1" parent="1" source="${esc(edge.source)}" target="${esc(edge.target)}"><mxGeometry relative="1" as="geometry" /></mxCell>`,
      )
    }

    return cells.join('')
  }

  const pageW = Math.ceil(base.bounds.w + 80)
  const pageH = Math.ceil(base.bounds.h + 160)
  const mainXml = `<mxGraphModel dx="1200" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageW}" pageHeight="${pageH}" math="0" shadow="0"><root>${diagram(base, true)}</root></mxGraphModel>`
  pages.push({ name: path.name, xml: mainXml })

  if (options.pages) {
    const sites = [...new Set(path.nodes.map((node) => node.site))]
    for (const site of sites) {
      const members = base.nodes.filter((n) => n.device.site === site)
      if (!members.length) continue
      const sub: Scene = {
        nodes: members,
        groups: [],
        edges: base.edges.filter((e) => members.some((m) => m.id === e.source || m.id === e.target)),
        legend: [],
        bounds: base.bounds,
      }
      const xml = `<mxGraphModel dx="1200" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="900" pageHeight="700" math="0" shadow="0"><root>${diagram(sub, false)}</root></mxGraphModel>`
      pages.push({ name: shortSite(site), xml })
    }
  }

  return pages
}

// draw.io stores each <diagram> payload as base64(deflateRaw(encodeURIComponent(xml))).
// Plain escaped XML in the text node is rejected by Graph.decompress (atob) on open.
function compress(xml: string): string {
  const bytes = deflateRaw(encodeURIComponent(xml))
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

function guid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function toDrawioFile(path: Path, options: ExportOptions): { name: string; blob: Blob } {
  const pages = drawioPages(path, options)
  const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'topology'
  if (options.pages && pages.length > 1) {
    const parts = pages.map((p) => `<diagram name="${esc(p.name)}" id="${guid()}">${compress(p.xml)}</diagram>`).join('')
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="reactflow-topology" agent="" version="24.0.0" modified="${new Date().toISOString()}">${parts}</mxfile>`
    return { name: `${slug(path.name)}.drawio`, blob: new Blob([xml], { type: 'application/vnd.drawio' }) }
  }
  // single-page: .drawio.svg with the model in the svg content attribute, which is
  // the form draw.io reads back from an svg (raw xml, attribute-escaped)
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="reactflow-topology" agent="" version="24.0.0"><diagram name="${esc(pages[0].name)}" id="${guid()}">${compress(pages[0].xml)}</diagram></mxfile>`
  const w = 1000
  const h = 800
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" content="${esc(xml)}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" />`
  return { name: `${slug(path.name)}.drawio.svg`, blob: new Blob([svg], { type: 'image/svg+xml' }) }
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
