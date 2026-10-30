import { useEffect, useMemo, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './styles.css'
import { VIEWS } from './views'
import { Inspector } from './Inspector'
import { SenseViewer } from './SenseViewer'
import { Splitter } from './Splitter'
import { connectivity, healthFor, loadPaths, shortSite, siteColours, siteOrder, vlansOf } from './data'
import { CanvasScreen, CommandScreen, ListScreen, MatrixScreen } from './screens'
import { ZoomScreen } from './ZoomScreen'
import type { Path, ScreenId, ViewId } from './types'

const SCREENS: { id: ScreenId; label: string }[] = [
  { id: 'canvas', label: 'Canvas' },
  { id: 'zoom', label: 'Zoom map' },
  { id: 'list', label: 'List' },
  { id: 'command', label: 'Command' },
  { id: 'matrix', label: 'Matrix' },
  { id: 'console', label: 'Console' },
]

export default function App() {
  const [screen, setScreen] = useState<ScreenId>('canvas')

  return (
    <div className="screen-switch">
      <nav className="screen-nav">
        <span className="nav-brand">topology</span>
        {SCREENS.map((candidate) => (
          <button key={candidate.id} className={screen === candidate.id ? 'on' : ''} onClick={() => setScreen(candidate.id)}>
            {candidate.label}
          </button>
        ))}
      </nav>
      {screen === 'canvas' && <CanvasScreen />}
      {screen === 'zoom' && <ZoomScreen />}
      {screen === 'list' && <ListScreen />}
      {screen === 'command' && <CommandScreen />}
      {screen === 'matrix' && <MatrixScreen />}
      {screen === 'console' && <ConsoleScreen />}
    </div>
  )
}

function ConsoleScreen() {
  const [paths, setPaths] = useState<Path[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pathId, setPathId] = useState<string | null>(null)
  const [view, setView] = useState<ViewId | 'sense'>('sense')
  const [focus, setFocus] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [railWidth, setRailWidth] = useState(268)
  const [inspectorWidth, setInspectorWidth] = useState(330)

  useEffect(() => {
    loadPaths()
      .then((loaded) => {
        setPaths(loaded)
        setPathId((previous) => {
          if (previous && loaded.some((path) => path.id === previous)) return previous
          const interesting = loaded.find((path) => path.nodes.filter((node) => node.endpoint).length > 2) ?? loaded[0]
          return interesting?.id ?? null
        })
      })
      .catch((ex) => setError(String(ex)))
  }, [])

  const path = useMemo(() => paths?.find((candidate) => candidate.id === pathId) ?? null, [paths, pathId])

  useEffect(() => {
    setFocus(null)
    setSelected(null)
  }, [pathId])

  const shown = useMemo(() => {
    if (!paths) return []
    const needle = filter.trim().toLowerCase()
    if (!needle) return paths
    return paths.filter((candidate) =>
      [candidate.name, candidate.uuid, candidate.intent.type ?? '', ...candidate.nodes.map((node) => node.site)].join(' ').toLowerCase().includes(needle),
    )
  }, [paths, filter])

  if (error) {
    return (
      <div className="fatal">
        <h1>Could not load paths</h1>
        <p className="mono">{error}</p>
      </div>
    )
  }
  if (!paths) return <div className="fatal">Loading…</div>

  const active = VIEWS.find((candidate) => candidate.id === view) ?? null

  return (
    <div
      className={`app ${view === 'sense' ? 'sense-mode' : ''}`}
      style={{ gridTemplateColumns: view === 'sense' ? `${railWidth}px 6px minmax(0, 1fr)` : `${railWidth}px 6px minmax(0, 1fr) 6px ${inspectorWidth}px` }}
    >
      <aside className="rail">
        <div className="rail-head">
          <h1>Path console</h1>
          <p className="sub">
            {paths.filter((candidate) => candidate.source === 'production').length} reservations · {paths.filter((candidate) => candidate.source === 'synthetic').length} synthetic
          </p>
          <input className="search" placeholder="filter by name, site, intent…" value={filter} onChange={(event) => setFilter(event.target.value)} />
        </div>
        <div className="rail-list">
          {shown.map((candidate) => {
            const ends = candidate.nodes.filter((node) => node.endpoint).length
            const sites = new Set(candidate.nodes.map((node) => node.site)).size
            const warn = Object.values(candidate.health).some((health) => health.status === 'warning')
            return (
              <button key={candidate.id} className={`rail-item ${candidate.id === pathId ? 'on' : ''}`} onClick={() => setPathId(candidate.id)}>
                <span className="rail-name">
                  {candidate.name}
                  {candidate.source === 'synthetic' && <span className="tag synth">synthetic</span>}
                  {warn && <span className="tag warn">warn</span>}
                </span>
                <span className="rail-meta">
                  {candidate.problem ? (
                    <em>{candidate.problem}</em>
                  ) : (
                    <>
                      {ends} end{ends === 1 ? '' : 's'} · {sites} site{sites === 1 ? '' : 's'} · {candidate.hops.length} hops
                    </>
                  )}
                </span>
              </button>
            )
          })}
          {!shown.length && <p className="empty">nothing matches “{filter}”</p>}
        </div>
      </aside>

      <Splitter width={railWidth} onChange={setRailWidth} min={190} max={520} />

      <main className="main">
        <header className="topbar">
          <div className="tabs">
            <button className={`tab ${view === 'sense' ? 'on' : ''}`} onClick={() => setView('sense')}>
              Inspector
            </button>
            <span className="tab-split" />
            {VIEWS.map((candidate) => (
              <button key={candidate.id} className={`tab ${candidate.id === view ? 'on' : ''}`} onClick={() => setView(candidate.id)} title={candidate.blurb}>
                {candidate.label}
              </button>
            ))}
          </div>
          {path && <PathBar path={path} focus={focus} setFocus={setFocus} />}
        </header>

        {active && <p className="blurb">{active.blurb}</p>}

        {view === 'sense' ? (
          <section className="canvas">
            {path && !path.problem ? <SenseViewer path={path} onRefresh={() => undefined} refreshedAt="" /> : <div className="fatal small">{path?.problem ?? 'pick a path'}</div>}
          </section>
        ) : (
          <section className="canvas">
            {path && active && !path.problem ? (
              <ReactFlowProvider key={`${path.id}-${view}`}>
                <active.Component path={path} focus={focus} selected={selected} onSelect={setSelected} />
              </ReactFlowProvider>
            ) : (
              <div className="fatal small">{path?.problem ?? 'pick a path'}</div>
            )}
          </section>
        )}
      </main>

      {view !== 'sense' && (
        <>
          <Splitter width={inspectorWidth} onChange={setInspectorWidth} min={240} max={620} side="right" />
          {path && <Inspector path={path} selected={selected} onSelect={setSelected} />}
        </>
      )}
    </div>
  )
}

function PathBar({ path, focus, setFocus }: { path: Path; focus: string | null; setFocus: (site: string | null) => void }) {
  const colours = siteColours(path)
  const link = connectivity(path)
  const ends = path.nodes.filter((node) => node.endpoint)
  const parallel = path.edges.filter((edge) => edge.sessions.length > 1)
  return (
    <div className="pathbar">
      <div className="pathbar-row">
        <strong>{path.name}</strong>
        <span className="chip">{path.state}</span>
        {path.senseState && <span className="chip">{path.senseState}</span>}
        {path.intent.type && <span className="chip intent">{path.intent.type}</span>}
        <span className="chip">{ends.length} endpoints</span>
        <span className="chip">{vlansOf(path).length} VLANs</span>
        {parallel.length > 0 && <span className="chip">{parallel.length} bundled link{parallel.length === 1 ? '' : 's'}</span>}
        {link.seen !== link.total && (
          <span className="chip bad">
            disjoint {link.seen}/{link.total}
          </span>
        )}
      </div>
      <div className="pathbar-row sites">
        <button className={`site-pill ${focus === null ? 'on' : ''}`} onClick={() => setFocus(null)}>
          all sites
        </button>
        {siteOrder(path).map((site) => {
          const health = healthFor(path, site)
          return (
            <button
              key={site}
              className={`site-pill ${focus === site ? 'on' : ''} ${health?.status ?? ''}`}
              style={{ ['--accent' as string]: colours.get(site) }}
              onClick={() => setFocus(focus === site ? null : site)}
              title={health?.reason ?? (health?.warnings.length ? `${health.warnings.length} warning(s)` : site)}
            >
              <span className="swatch" style={{ background: colours.get(site) }} />
              {shortSite(site)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
