import { deflateRaw } from 'pako'
import { healthFor, shortSite, siteColours, vlanColours } from './data'
import { groupedLayout, layeredLayout, metroLayout, radialLayout } from './layouts'
import type { DeviceNode, Path } from './types'

export type ExportLayout = 'layered' | 'grouped' | 'radial' | 'metro'
export type ExportColour = 'site' | 'vlan' | 'mono'
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
  colour: 'site',
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
      ? MONO
      : options.colour === 'vlan'
        ? byVlan.get(device.vlans[0] ?? '') ?? MONO
        : bySite.get(device.site) ?? MONO

  let placed: Map<string, { x: number; y: number; w: number; h: number }>
  let groups: SceneGroup[] = []
  if (options.layout === 'grouped') {
    const laid = groupedLayout(path)
    placed = laid.nodes
    groups = laid.groups.map((box) => ({
      id: `group-${box.site}`,
      site: box.site,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      colour: bySite.get(box.site) ?? MONO,
    }))
  } else if (options.layout === 'radial') {
    placed = radialLayout(path)
  } else if (options.layout === 'metro') {
    placed = metroLayout(path)
  } else {
    placed = layeredLayout(path, 'LR')
  }

  const nodes: SceneNode[] = path.nodes
    .filter((node) => placed.has(node.id))
    .map((node) => {
      const pos = placed.get(node.id)!
      return {
        id: node.id,
        x: pos.x,
        y: pos.y,
        w: pos.w,
        h: pos.h,
        device: node,
        stroke: strokeOf(node),
        parent: options.layout === 'grouped' ? `group-${node.site}` : null,
      }
    })

  const edges: SceneEdge[] = path.edges.map((edge) => {
    const vlans = edge.vlans
    const stroke = options.colour === 'mono' ? MONO : vlans.length ? byVlan.get(vlans[0]) ?? MONO : MONO
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      stroke,
      width: edge.scope === 'interdomain' ? 3.5 : 2,
      dash: edge.scope === 'transit' ? '1 4' : edge.scope === 'internal' ? '5 4' : null,
      label: options.edgeLabels ? (vlans.length ? vlans.join(',') : edge.scope === 'transit' ? 'transit' : '') : null,
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
    const pad = 40
    const title = `${esc(path.name)} · ${esc(path.state ?? '')}${path.senseState ? ` · ${esc(path.senseState)}` : ''}`
    const cells: string[] = []
    cells.push(`<mxCell id="0" />`)
    cells.push(`<mxCell id="1" parent="0" />`)
    let n = 2

    if (includeLegend && options.legend && s.legend.length) {
      const lx = s.bounds.x - pad
      const ly = s.bounds.y + s.bounds.h + 28
      let row = 0
      let col = 0
      const cellW = 150
      const cellH = 22
      cells.push(
        `<mxCell id="${cellId('legend', n++)}" value="${esc(title)}" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontSize=13;fontStyle=1;fontColor=${INK};fontFamily=Helvetica" vertex="1" parent="1"><mxGeometry x="${lx}" y="${ly - 24}" width="420" height="20" as="geometry" /></mxCell>`,
      )
      for (const item of s.legend) {
        const x = lx + col * cellW
        const y = ly + row * cellH
        cells.push(
          `<mxCell id="${cellId('leg', n++)}" value="${esc(shortSite(item.site))}" style="shape=rectangle;strokeColor=${item.colour};fillColor=${item.colour};fillOpacity=18;strokeWidth=2;rounded=1;arcSize=12;fontSize=11;fontColor=${INK};fontFamily=Helvetica" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${cellW - 8}" height="${cellH - 4}" as="geometry" /></mxCell>`,
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
        `<mxCell id="${esc(g.id)}" value="${label}" style="swimlane;startSize=26;horizontal=1;fillColor=none;strokeColor=${g.colour};strokeWidth=2.5;dashed=0;fontColor=${g.colour};fontSize=11;fontStyle=1;fontFamily=Helvetica" vertex="1" parent="1"><mxGeometry x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" as="geometry" /></mxCell>`,
      )
    }

    for (const node of s.nodes) {
      const d = node.device
      const health = healthFor(path, d.site)
      const statusColour = health?.status === 'ok' ? OK : health?.status === 'warning' ? WARN : UNMANAGED
      const lines: string[] = []
      if (options.detail === 'full') {
        lines.push(`<b>${d.label}${d.endpoint ? ' (endpoint)' : ''}</b>`)
        lines.push(`<font color="${DIM}">${esc(shortSite(d.site))} · ${d.kind === 'host' ? 'host' : 'switch'}</font>`)
        for (const port of d.ports.slice(0, 4)) {
          const parts = [port.name, port.vlan ? `VLAN ${port.vlan}` : '', port.ipv4 ?? '', port.ipv6 ?? ''].filter(Boolean)
          lines.push(`<font color="${PORT_INK}">${esc(parts.join(' · '))}</font>`)
        }
        if (d.ports.length > 4) lines.push(`<font color="${PORT_INK}">+${d.ports.length - 4} more ports</font>`)
      } else {
        lines.push(`<b>${d.label}${d.endpoint ? ' (endpoint)' : ''}</b>`)
        lines.push(`<font color="${DIM}">${esc(shortSite(d.site))}</font>`)
      }
      const value = lines.join('<br/>')
      const dashed = d.kind === 'host' ? ';dashed=1' : ''
      cells.push(
        `<mxCell id="${esc(node.id)}" value="${esc(value)}" style="rounded=1;arcSize=8;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=${node.stroke};strokeWidth=3.5${dashed};fontColor=${INK};fontSize=12;fontFamily=Helvetica;verticalAlign=top;align=left;spacingLeft=8;spacingTop=6" vertex="1" parent="${node.parent ? esc(node.parent) : '1'}"><mxGeometry x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" as="geometry" /></mxCell>`,
      )
      if (options.detail === 'full' && health) {
        cells.push(
          `<mxCell id="${cellId('dot', n++)}" value="" style="ellipse;fillColor=${statusColour};strokeColor=none" vertex="1" parent="1"><mxGeometry x="${node.x + node.w - 19}" y="${node.y + 6}" width="11" height="11" as="geometry" /></mxCell>`,
        )
      }
    }

    for (const edge of s.edges) {
      const dash = edge.dash ? `;dashed=1;dashPattern=${edge.dash}` : ''
      const label = edge.label ? `;edgeLabel=1;labelBackgroundColor=#ffffff;fontSize=11;fontStyle=1;fontColor=${INK}` : ''
      cells.push(
        `<mxCell id="${esc(edge.id)}" value="${edge.label ? esc(edge.label) : ''}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=${edge.stroke};strokeWidth=${edge.width};endArrow=none${dash}${label}" edge="1" parent="1" source="${esc(edge.source)}" target="${esc(edge.target)}"><mxGeometry relative="1" as="geometry" /></mxCell>`,
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
