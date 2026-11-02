import { useState } from 'react'
import { DEFAULT_OPTIONS, download, toDrawioFile, type ExportOptions } from './drawio'
import type { Path } from './types'

const LAYOUTS: { id: ExportOptions['layout']; label: string }[] = [
  { id: 'layered', label: 'Layered (hops left→right)' },
  { id: 'grouped', label: 'Grouped (one swimlane per site)' },
  { id: 'radial', label: 'Radial (endpoints on a ring)' },
  { id: 'metro', label: 'Metro (columns × site rows)' },
]

const COLOURS: { id: ExportOptions['colour']; label: string }[] = [
  { id: 'mixed', label: 'Mixed per link (hand-drawn look)' },
  { id: 'site', label: 'Colour by site' },
  { id: 'vlan', label: 'Colour by VLAN' },
  { id: 'mono', label: 'Black (physical-fiber look)' },
]

const DETAILS: { id: ExportOptions['detail']; label: string }[] = [
  { id: 'full', label: 'Full (ports, VLANs, IPs, health dots)' },
  { id: 'compact', label: 'Compact (label + site only)' },
]

export function ExportDialog({ path, onClose }: { path: Path; onClose: () => void }) {
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_OPTIONS)
  const set = <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) => setOptions((o) => ({ ...o, [key]: value }))

  const go = () => {
    const { name, blob } = toDrawioFile(path, options)
    download(blob, name)
    onClose()
  }

  return (
    <div className="export-backdrop" onClick={onClose}>
      <div className="export-dialog" role="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="export-head">
          <strong>Export {path.name}</strong>
          <button className="float-close" onClick={onClose}>×</button>
        </div>
        <div className="export-body">
          <label>
            <span>Layout</span>
            <select value={options.layout} onChange={(e) => set('layout', e.target.value as ExportOptions['layout'])}>
              {LAYOUTS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </label>
          <label>
            <span>Colour</span>
            <select value={options.colour} onChange={(e) => set('colour', e.target.value as ExportOptions['colour'])}>
              {COLOURS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label>
            <span>Detail</span>
            <select value={options.detail} onChange={(e) => set('detail', e.target.value as ExportOptions['detail'])}>
              {DETAILS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </label>
          <div className="export-checks">
            <label><input type="checkbox" checked={options.edgeLabels} onChange={(e) => set('edgeLabels', e.target.checked)} /> VLAN labels on links</label>
            <label><input type="checkbox" checked={options.legend} onChange={(e) => set('legend', e.target.checked)} /> site legend + title</label>
            <label><input type="checkbox" checked={options.pages} onChange={(e) => set('pages', e.target.checked)} /> extra page per site</label>
          </div>
          <p className="export-note">
            {options.pages ? 'Downloads a multi-page .drawio file (one page per site). Opens in draw.io / diagrams.net.' : 'Downloads a single-page .drawio.svg that GitHub previews and draw.io opens.'}
          </p>
        </div>
        <div className="export-foot">
          <button className="tab" onClick={onClose}>Cancel</button>
          <button className="tab on" onClick={go}>Download</button>
        </div>
      </div>
    </div>
  )
}
