import { useState, useCallback, useEffect, useContext, createContext, useRef } from 'react'
import { Box, Chip, Tooltip } from '@mui/material'
import { DockviewReact } from 'dockview'
import { themeAbyss } from 'dockview-core'
import 'dockview/dist/styles/dockview.css'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import { C } from '../theme'
import DiagramPanel from '../panels/DiagramPanel'
import TutorPanel from '../panels/TutorPanel'
import TerminalPanel from '../panels/TerminalPanel'
import CodePanel from '../panels/CodePanel'
import AiPanel from '../panels/AiPanel'

/* ── Shared context so panel components get live props ─────────── */
const SessionCtx = createContext({})

/* ── Panel components registered with dockview ─────────────────── */
function DvTerminal() {
  return <Box sx={{ height: '100%', overflow: 'hidden' }}><TerminalPanel /></Box>
}
function DvDiagram() {
  const { traffic } = useContext(SessionCtx)
  return <Box sx={{ height: '100%', overflow: 'hidden' }}><DiagramPanel traffic={traffic} /></Box>
}
function DvTutor() {
  const { target, advanced, onAdvance, onFinish } = useContext(SessionCtx)
  return (
    <Box sx={{ height: '100%', overflow: 'hidden' }}>
      <TutorPanel target={target} advanced={advanced} onAdvance={onAdvance} onFinish={onFinish} />
    </Box>
  )
}
function DvCode() {
  const { onApply, onContextChange, onAiOpen } = useContext(SessionCtx)
  return <Box sx={{ height: '100%', overflow: 'hidden' }}><CodePanel onApply={onApply} onContextChange={onContextChange} onAiOpen={onAiOpen} /></Box>
}

const DV_COMPONENTS = {
  terminal: DvTerminal,
  diagram: DvDiagram,
  tutor: DvTutor,
  code: DvCode,
}

/* ── Tab title renderer ─────────────────────────────────────────── */
const PANEL_META = {
  terminal: { title: 'Terminal',       step: '①', sub: 'Observe',    color: C.crit   },
  diagram:  { title: 'Architecture',   step: '②', sub: 'Diagnose',   color: C.warn   },
  tutor:    { title: 'Socratic Tutor', step: '③', sub: 'Understand', color: C.accent },
  code:     { title: 'Code Editor',    step: '④', sub: 'Fix',        color: C.ok     },
}

function CustomTab({ api }) {
  const m = PANEL_META[api.id]
  if (!m) return <span style={{ padding: '0 8px', fontFamily: '"JetBrains Mono", monospace', fontSize: 11 }}>{api.id}</span>
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 12px', height: '100%' }}>
      <span style={{
        width: 20, height: 20, borderRadius: '50%',
        background: m.color + '22', border: `1.5px solid ${m.color}66`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: m.color, fontWeight: 700,
        flexShrink: 0,
      }}>{m.step}</span>
      <span style={{ lineHeight: 1.2 }}>
        <span style={{ display: 'block', fontFamily: '"JetBrains Mono", monospace', fontSize: 13, fontWeight: 700, letterSpacing: '0.03em', color: '#f0f2f8' }}>{m.title}</span>
        <span style={{ display: 'block', fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: m.color, letterSpacing: '0.04em' }}>{m.sub}</span>
      </span>
    </span>
  )
}

const DV_TAB_COMPONENTS = {
  terminal: CustomTab,
  diagram: CustomTab,
  tutor: CustomTab,
  code: CustomTab,
}

/* ── Per-group header action buttons ────────────────────────────── */
const BTN = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 22, height: 22, borderRadius: 3, border: 'none', background: 'none',
  cursor: 'pointer', color: '#aab4d0', flexShrink: 0,
  transition: 'color 0.12s, background 0.12s',
  fontFamily: '"JetBrains Mono", monospace', fontSize: 11,
}

function PanelHeaderActions({ containerApi, activePanel, api }) {
  const [isMax, setIsMax] = useState(false)

  useEffect(() => {
    const unsub = api.onDidActiveChange?.(() => setIsMax(api.isMaximized()))
    return () => unsub?.dispose()
  }, [api])

  const handleMax = () => {
    if (api.isMaximized()) {
      containerApi.exitMaximizedGroup()
      setIsMax(false)
    } else if (activePanel) {
      containerApi.maximizeGroup(activePanel)
      setIsMax(true)
    }
  }

  const handlePopout = () => {
    if (activePanel) containerApi.addPopoutGroup(activePanel)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, paddingRight: 6, height: '100%' }}>
      <button
        title="Pop out to new window"
        style={BTN}
        onMouseEnter={e => { e.currentTarget.style.color = '#60a5fa'; e.currentTarget.style.background = '#222639' }}
        onMouseLeave={e => { e.currentTarget.style.color = '#aab4d0'; e.currentTarget.style.background = 'none' }}
        onClick={handlePopout}
      >↗</button>
      <button
        title={isMax ? 'Restore' : 'Maximize'}
        style={{ ...BTN, color: isMax ? '#60a5fa' : '#aab4d0' }}
        onMouseEnter={e => { e.currentTarget.style.color = '#f0f2f8'; e.currentTarget.style.background = '#222639' }}
        onMouseLeave={e => { e.currentTarget.style.color = isMax ? '#60a5fa' : '#aab4d0'; e.currentTarget.style.background = 'none' }}
        onClick={handleMax}
      >{isMax ? '⊟' : '⊞'}</button>
    </div>
  )
}

/* ── Metric thresholds ──────────────────────────────────────────── */
const THRESHOLDS = {
  p99:       { warn: 200, bad: 400 },
  errorRate: { warn: 0.5, bad: 1.5 },
  dbConn:    { warn: 80,  bad: 93  },
}
function tone(val, key) {
  const t = THRESHOLDS[key]
  if (!t) return 'neutral'
  if (val >= t.bad) return 'bad'
  if (val >= t.warn) return 'warn'
  return 'ok'
}

function MetricCell({ label, value, raw, metricKey, unit, flashing }) {
  const t = tone(raw ?? 0, metricKey)
  const color = t === 'bad' ? C.crit : t === 'warn' ? C.warn : t === 'ok' ? C.ok : C.ink2
  const thr = THRESHOLDS[metricKey]
  return (
    <Tooltip title={thr ? `warn ≥ ${thr.warn}  ·  critical ≥ ${thr.bad}` : ''} arrow placement="bottom" disableHoverListener={!thr}>
      <Box sx={{
        display: 'flex', flexDirection: 'column', gap: 0.3,
        px: 2, py: 1,
        borderRight: `1px solid ${C.line1}`, '&:last-child': { borderRight: 'none' },
        minWidth: 88, cursor: thr ? 'help' : 'default',
        '@keyframes flashCell': { '0%': { background: 'transparent' }, '25%': { background: t === 'bad' ? C.critSoft : C.warnSoft }, '100%': { background: 'transparent' } },
        animation: flashing ? 'flashCell 0.7s ease-out' : 'none',
      }}>
        <Box sx={{ fontFamily: '"JetBrains Mono"', fontSize: '0.5625rem', fontWeight: 700, color: C.ink3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</Box>
        <Box sx={{ fontFamily: '"JetBrains Mono"', fontSize: '1.05rem', fontWeight: 700, color, lineHeight: 1 }}>{value}</Box>
        {unit && <Box sx={{ fontFamily: '"JetBrains Mono"', fontSize: '0.5rem', color: C.ink3 }}>{unit}</Box>}
      </Box>
    </Tooltip>
  )
}

/* ── Progress steps ─────────────────────────────────────────────── */
const STEPS = ['Baseline', 'Cache layer', 'Thundering herd', 'Hot key']

/* ── Main Session ────────────────────────────────────────────────── */
export default function Session({ view, onBack, onFinish }) {
  const [traffic, setTraffic]       = useState(2340)
  const [advanced, setAdvanced]     = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [flashing, setFlashing]     = useState({})
  const [aiOpen, setAiOpen]         = useState(false)
  const [codeContext, setCodeContext] = useState(null)
  const apiRef = useRef(null)

  const target = view?.target || view?.slug || 'cache-aside'
  const OBJECTIVE = 'Diagnose connection pool exhaustion then add a Redis cache layer — cache hit ratio must exceed 85%.'

  useEffect(() => {
    const t = setInterval(() => {
      setFlashing({ p99: true, dbConn: true })
      setTimeout(() => setFlashing({}), 800)
    }, 4500)
    return () => clearInterval(t)
  }, [])

  const onReady = useCallback((event) => {
    apiRef.current = event.api

    // Tutor — left, anchors the left group
    event.api.addPanel({ id: 'tutor', component: 'tutor', tabComponent: 'tutor', title: 'Tutor' })
    // Terminal — same group as Tutor (tabbed)
    event.api.addPanel({
      id: 'terminal', component: 'terminal', tabComponent: 'terminal', title: 'Terminal',
      position: { direction: 'within', referencePanel: 'tutor' },
    })
    // Code Editor — same group as Tutor/Terminal (tabbed)
    event.api.addPanel({
      id: 'code', component: 'code', tabComponent: 'code', title: 'Code Editor',
      position: { direction: 'within', referencePanel: 'tutor' },
    })
    // Architecture — right column, full height
    event.api.addPanel({
      id: 'diagram', component: 'diagram', tabComponent: 'diagram', title: 'Architecture',
      position: { direction: 'right', referencePanel: 'tutor' },
    })
  }, [])

  const ctxValue = {
    traffic,
    advanced,
    target,
    onAdvance: () => setAdvanced(true),
    onFinish,
    onApply: () => setAdvanced(true),
    onContextChange: setCodeContext,
    onAiOpen: () => setAiOpen(true),
  }

  return (
    <SessionCtx.Provider value={ctxValue}>
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

        {/* ── Progress bar ──────────────────────────────────────── */}
        <Box sx={{ height: 3, flexShrink: 0, bgcolor: C.line1 }}>
          <Box sx={{ width: `${(currentStep / STEPS.length) * 100}%`, height: '100%', bgcolor: C.accent, transition: 'width 0.6s ease' }} />
        </Box>

        {/* ── Step tracker ──────────────────────────────────────── */}
        <Box sx={{ height: 30, flexShrink: 0, display: 'flex', alignItems: 'center', px: 2, bgcolor: C.bg1, borderBottom: `1px solid ${C.line1}`, overflowX: 'auto' }}>
          <Box component="button" onClick={onBack} sx={{ fontFamily: '"JetBrains Mono"', fontSize: '0.625rem', fontWeight: 700, color: C.ink3, background: 'none', border: 'none', cursor: 'pointer', px: 1, py: 0.5, mr: 1.5, borderRadius: 1, whiteSpace: 'nowrap', '&:hover': { color: C.ink1, bgcolor: C.bg2 } }}>
            ← catalog
          </Box>
          {STEPS.map((s, i) => {
            const done  = i < currentStep - 1
            const active = i === currentStep - 1
            const locked = i > currentStep - 1
            return (
              <Box key={s} sx={{ display: 'flex', alignItems: 'center' }}>
                <Box
                  component={locked ? 'div' : 'button'}
                  onClick={locked ? undefined : () => setCurrentStep(i + 1)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.375,
                    borderRadius: 1, border: 'none', background: 'none',
                    cursor: locked ? 'default' : 'pointer',
                    opacity: locked ? 0.6 : 1,
                    transition: 'opacity 0.15s, background 0.15s',
                    '&:hover': locked ? {} : { bgcolor: C.bg2 },
                  }}
                >
                  <Box sx={{
                    width: 15, height: 15, borderRadius: '50%', flexShrink: 0,
                    bgcolor: done ? C.ok : active ? C.accent : C.line3,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: '"JetBrains Mono"', fontSize: '0.4375rem', color: C.bg0, fontWeight: 700,
                  }}>
                    {done ? '✓' : i + 1}
                  </Box>
                  <Box sx={{ fontFamily: '"JetBrains Mono"', fontSize: '0.6875rem', fontWeight: active ? 700 : 500, color: active ? C.ink1 : done ? C.ok : C.ink2, whiteSpace: 'nowrap' }}>
                    {s}
                  </Box>
                </Box>
                {i < STEPS.length - 1 && <Box sx={{ width: 10, height: 1, bgcolor: C.line2, flexShrink: 0 }} />}
              </Box>
            )
          })}
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.5, pl: 2 }}>
            <Box sx={{ fontFamily: '"JetBrains Mono"', fontSize: '0.625rem', color: C.ink3 }}>sc_a8f1c2</Box>
            <Box sx={{ fontFamily: '"JetBrains Mono"', fontSize: '0.625rem', color: C.ink2, border: `1px solid ${C.line3}`, borderRadius: 0.75, px: 1, py: 0.25 }}>$0.18</Box>
            <Box
              component="button"
              onClick={() => setAiOpen(o => !o)}
              sx={{
                display: 'inline-flex', alignItems: 'center', gap: 0.75,
                fontFamily: '"IBM Plex Sans", sans-serif', fontSize: '0.875rem', fontWeight: 700,
                color: aiOpen ? C.bg0 : C.accent,
                bgcolor: aiOpen ? C.accent : C.accentSoft,
                border: `1.5px solid ${C.accent}`,
                borderRadius: 1, px: 1.5, py: 0.25, cursor: 'pointer',
                transition: 'all 0.15s', lineHeight: 1,
                '&:hover': { bgcolor: C.accent, color: C.bg0 },
              }}
            >
              <AutoAwesomeIcon sx={{ fontSize: 17 }} />
              AI
            </Box>
          </Box>
        </Box>

        {/* ── Mission strip ─────────────────────────────────────── */}
        <Box sx={{
          flexShrink: 0, px: 2, py: 0.625,
          bgcolor: C.bg0, borderBottom: `1px solid ${C.line1}`,
          borderLeft: `3px solid ${C.accent}`,
          display: 'flex', alignItems: 'center', gap: 2,
        }}>
          <Box sx={{ fontFamily: '"JetBrains Mono"', fontSize: '0.5rem', fontWeight: 700, color: C.accent, letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>◆ Mission</Box>
          <Box sx={{ fontSize: '0.8125rem', fontWeight: 600, color: C.ink1, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{OBJECTIVE}</Box>
          <Chip label={`fix: ${target.replace(/-/g, ' ')}`} size="small" sx={{ flexShrink: 0, bgcolor: C.accentSoft, color: C.accent, border: `1px solid ${C.accentLine}`, fontFamily: '"JetBrains Mono"', fontSize: '0.5625rem', fontWeight: 700 }} />
        </Box>

        {/* ── Metrics bar ───────────────────────────────────────── */}
        <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'stretch', borderBottom: `1px solid ${C.line1}`, bgcolor: C.bg1, overflowX: 'auto' }}>
          <Box sx={{ px: 2, py: 0.75, borderRight: `1px solid ${C.line1}`, display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 210 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ fontFamily: '"JetBrains Mono"', fontSize: '0.5625rem', fontWeight: 700, color: C.ink3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>↑ Load — drag to stress test</Box>
              <Box sx={{ fontFamily: '"JetBrains Mono"', fontSize: '0.875rem', fontWeight: 700, color: traffic > 7000 ? C.crit : traffic > 4000 ? C.warn : C.ink1 }}>
                {traffic.toLocaleString()} <Box component="span" sx={{ fontSize: '0.5rem', color: C.ink3 }}>req/s</Box>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ fontFamily: '"JetBrains Mono"', fontSize: '0.5rem', fontWeight: 700, color: C.ink3, flexShrink: 0 }}>100</Box>
              <Box component="input" type="range" min={100} max={10000} value={traffic} onChange={e => setTraffic(+e.target.value)}
                sx={{ flex: 1, accentColor: traffic > 7000 ? C.crit : traffic > 4000 ? C.warn : C.accent, height: 4, cursor: 'pointer' }} />
              <Box sx={{ fontFamily: '"JetBrains Mono"', fontSize: '0.5rem', fontWeight: 700, color: C.ink3, flexShrink: 0 }}>10k</Box>
            </Box>
          </Box>
          <MetricCell label="P99 latency" value="450ms" raw={450} metricKey="p99" flashing={flashing.p99} />
          <MetricCell label="Error rate"  value="1.5%"  raw={1.5} metricKey="errorRate" />
          <MetricCell label="DB conn"     value="94/100" raw={94}  metricKey="dbConn" unit="94% pool used" flashing={flashing.dbConn} />
          <MetricCell label="Cache hit"   value="—"      unit="no cache yet" />
          <MetricCell label="DB cpu"      value="31%" />
        </Box>

        {/* ── Dockview workspace + AI sidebar ──────────────────── */}
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
          <Box sx={{ flex: 1, minWidth: 0, position: 'relative' }}>
            <DockviewReact
              components={DV_COMPONENTS}
              tabComponents={DV_TAB_COMPONENTS}
              rightHeaderActionsComponent={PanelHeaderActions}
              onReady={onReady}
              theme={themeAbyss}
              style={{ height: '100%', width: '100%' }}
            />
          </Box>
          {aiOpen && (
            <AiPanel
              codeContext={codeContext}
              onClose={() => setAiOpen(false)}
            />
          )}
        </Box>

      </Box>
    </SessionCtx.Provider>
  )
}
