import { useState, useRef, useEffect, useContext, useCallback } from 'react'
import { Box, IconButton, Tooltip } from '@mui/material'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import PauseIcon from '@mui/icons-material/Pause'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import VerticalAlignBottomIcon from '@mui/icons-material/VerticalAlignBottom'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import 'xterm/css/xterm.css'
import { C } from '../theme'
import { SessionCtx } from '../components/Session'
import { logsEventSource } from '../lib/api'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001'
const WS_BASE = API_BASE.replace(/^http/, 'ws')

const ALL_TABS = [
  { id: 'postgres', label: 'postgres' },
  { id: 'redis',    label: 'redis' },
  { id: 'app',      label: 'app shell' },
  { id: 'logs',     label: 'app logs' },
]

const STATES_WITH_REDIS = ['state1_cache', 'state2_thundering_herd', 'state3_hotkey']

function getAvailableTabs(sessionState) {
  if (sessionState && STATES_WITH_REDIS.some(s => sessionState.includes(s))) {
    return ALL_TABS
  }
  return ALL_TABS.filter(t => t.id !== 'redis')
}

const TERMINAL_SERVICES = new Set(['postgres', 'redis', 'app'])

function useTerminalWs(sessionId, service, containerRef, active) {
  const termRef = useRef(null)
  const fitRef = useRef(null)
  const wsRef = useRef(null)
  const mountedRef = useRef(false)
  const closingRef = useRef(false)
  const retryRef = useRef(null)
  const retriesRef = useRef(0)

  const connectWs = useCallback(() => {
    if (!termRef.current || !sessionId || closingRef.current) return
    const term = termRef.current

    if (wsRef.current) {
      try { wsRef.current.onclose = null; wsRef.current.close() } catch {}
    }

    const url = `${WS_BASE}/api/session/${sessionId}/terminal/${service}`
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => {
      retriesRef.current = 0
      term.writeln(`\x1b[90m--- connected to ${service} ---\x1b[0m`)
    }

    ws.onmessage = (e) => {
      const data = e.data instanceof ArrayBuffer ? new Uint8Array(e.data) : e.data
      term.write(data)
    }

    ws.onclose = () => {
      if (wsRef.current !== ws || closingRef.current) return
      if (retriesRef.current < 15) {
        retriesRef.current++
        if (retriesRef.current === 1) term.writeln('\x1b[90m--- reconnecting… ---\x1b[0m')
        retryRef.current = setTimeout(connectWs, 2000)
      } else {
        term.writeln('\x1b[31m--- connection lost ---\x1b[0m')
      }
    }

    ws.onerror = () => {}
  }, [sessionId, service])

  const attach = useCallback(() => {
    if (!containerRef.current || !sessionId || mountedRef.current) return
    closingRef.current = false

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"JetBrains Mono", monospace',
      theme: {
        background: C.bg0,
        foreground: C.ink1,
        cursor: C.accent,
        selectionBackground: 'rgba(96,165,250,0.3)',
        black: C.bg0,
        red: C.crit,
        green: C.ok,
        yellow: C.warn,
        blue: C.accent,
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: C.ink1,
      },
      scrollback: 2000,
      convertEol: true,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()

    termRef.current = term
    fitRef.current = fit
    mountedRef.current = true

    term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(new TextEncoder().encode(data))
      }
    })

    term.focus()
    connectWs()
  }, [sessionId, service, containerRef, connectWs])

  useEffect(() => {
    if (active) {
      const timer = setTimeout(() => {
        attach()
        fitRef.current?.fit()
        termRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [active, attach])

  useEffect(() => {
    if (!active || !fitRef.current) return
    const ro = new ResizeObserver(() => {
      try { fitRef.current?.fit() } catch {}
    })
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [active, containerRef])

  useEffect(() => {
    return () => {
      closingRef.current = true
      clearTimeout(retryRef.current)
      wsRef.current?.close()
      termRef.current?.dispose()
      mountedRef.current = false
    }
  }, [])

  return { termRef, wsRef }
}

const LOG_LEVEL_COLOR = {
  INFO: C.ok, WARNING: C.warn, ERROR: C.crit, CRITICAL: C.crit, DEBUG: C.ink4,
}

function LogTab({ sessionId, active }) {
  const [logs, setLogs] = useState([])
  const [paused, setPaused] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef = useRef(null)
  const containerRef = useRef(null)
  const bufferRef = useRef([])

  useEffect(() => {
    if (!sessionId) return
    const es = logsEventSource(sessionId)
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.error) return
        if (data.logs?.length) {
          if (paused) {
            bufferRef.current = [...bufferRef.current, ...data.logs]
          } else {
            setLogs(prev => {
              const combined = [...prev, ...data.logs]
              return combined.length > 1000 ? combined.slice(-1000) : combined
            })
          }
        }
      } catch {}
    }
    return () => es.close()
  }, [sessionId, paused])

  useEffect(() => {
    if (!paused && bufferRef.current.length) {
      setLogs(prev => {
        const combined = [...prev, ...bufferRef.current]
        bufferRef.current = []
        return combined.length > 1000 ? combined.slice(-1000) : combined
      })
    }
  }, [paused])

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40)
  }, [])

  return (
    <Box sx={{ height: '100%', display: active ? 'flex' : 'none', flexDirection: 'column', bgcolor: C.bg0 }}>
      <Box sx={{
        px: 1.5, py: 0.5, bgcolor: C.bg1, borderBottom: `1px solid ${C.line1}`,
        display: 'flex', alignItems: 'center', gap: 0.5,
      }}>
        <Box sx={{ fontFamily: '"JetBrains Mono"', fontSize: '0.6875rem', fontWeight: 700, color: C.ink3, letterSpacing: '0.06em' }}>
          APP LOGS
        </Box>
        <Box sx={{ flex: 1 }} />
        <Box sx={{ fontFamily: '"JetBrains Mono"', fontSize: '0.5625rem', color: C.ink4 }}>
          {logs.length} entries
        </Box>
        <Tooltip title={paused ? 'Resume' : 'Pause'}>
          <IconButton size="small" onClick={() => setPaused(p => !p)} sx={{ color: paused ? C.warn : C.ink4, p: 0.25 }}>
            {paused ? <PlayArrowIcon sx={{ fontSize: 16 }} /> : <PauseIcon sx={{ fontSize: 16 }} />}
          </IconButton>
        </Tooltip>
        <Tooltip title="Scroll to bottom">
          <IconButton size="small" onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView() }} sx={{ color: autoScroll ? C.accent : C.ink4, p: 0.25 }}>
            <VerticalAlignBottomIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Clear">
          <IconButton size="small" onClick={() => { setLogs([]); sinceRef.current = 0 }} sx={{ color: C.ink4, p: 0.25 }}>
            <DeleteOutlineIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Box
        ref={containerRef}
        onScroll={handleScroll}
        sx={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          px: 1.5, py: 0.5,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.6875rem', lineHeight: 1.65,
        }}
      >
        {logs.length === 0 && (
          <Box sx={{ color: C.ink4, py: 2, textAlign: 'center', fontSize: '0.75rem' }}>
            waiting for logs…
          </Box>
        )}
        {logs.map((entry, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 0, whiteSpace: 'pre', '&:hover': { bgcolor: C.bg2 } }}>
            <Box component="span" sx={{ color: LOG_LEVEL_COLOR[entry.level] || C.ink3, flexShrink: 0 }}>
              {entry.t}
            </Box>
          </Box>
        ))}
        <div ref={bottomRef} />
      </Box>
    </Box>
  )
}

function TerminalTab({ sessionId, service, active }) {
  const containerRef = useRef(null)
  const { termRef, wsRef } = useTerminalWs(sessionId, service, containerRef, active)

  return (
    <Box
      ref={containerRef}
      onClick={() => termRef.current?.focus()}
      sx={{
        height: '100%',
        width: '100%',
        display: active ? 'block' : 'none',
        '& .xterm': { height: '100%', padding: '4px 8px' },
        '& .xterm-viewport': { overflow: 'hidden !important' },
      }}
    />
  )
}

export default function TerminalPanel() {
  const { sessionId, currentState } = useContext(SessionCtx)
  const tabs = getAvailableTabs(currentState)
  const [activeTab, setActiveTab] = useState('postgres')
  const tabsScrollRef = useRef(null)

  const validTab = tabs.find(t => t.id === activeTab) ? activeTab : tabs[0]?.id
  if (validTab !== activeTab) setActiveTab(validTab)

  const scrollTabs = (dir) => {
    if (tabsScrollRef.current) tabsScrollRef.current.scrollLeft += dir * 100
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: C.bg0 }}>
      {/* Tab strip */}
      <Box sx={{
        height: 34, flexShrink: 0,
        display: 'flex', alignItems: 'stretch',
        borderBottom: `1px solid ${C.line1}`,
        bgcolor: C.bg1,
      }}>
        <IconButton size="small" onClick={() => scrollTabs(-1)} sx={{ color: C.ink4, borderRadius: 0, px: 0.75, flexShrink: 0, '&:hover': { bgcolor: C.bg2 } }}>
          <ChevronLeftIcon sx={{ fontSize: 14 }} />
        </IconButton>

        <Box ref={tabsScrollRef} sx={{ flex: 1, display: 'flex', overflow: 'hidden', scrollBehavior: 'smooth' }}>
          {tabs.map(t => (
            <Box
              key={t.id}
              component="button"
              onClick={() => setActiveTab(t.id)}
              sx={{
                px: 1.75, height: '100%',
                fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8125rem',
                display: 'flex', alignItems: 'center', gap: 0.875,
                cursor: 'pointer', whiteSpace: 'nowrap',
                background: 'none', border: 'none',
                borderRight: `1px solid ${C.line1}`,
                color: activeTab === t.id ? C.ink1 : C.ink3,
                bgcolor: activeTab === t.id ? C.bg0 : 'transparent',
                position: 'relative', flexShrink: 0,
                '&:hover': { color: activeTab === t.id ? C.ink1 : C.ink2 },
                transition: 'color 0.15s',
              }}
            >
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: C.ok }} />
              {t.label}
              {activeTab === t.id && (
                <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, bgcolor: C.accent }} />
              )}
            </Box>
          ))}
        </Box>

        <IconButton size="small" onClick={() => scrollTabs(1)} sx={{ color: C.ink4, borderRadius: 0, px: 0.75, flexShrink: 0, '&:hover': { bgcolor: C.bg2 } }}>
          <ChevronRightIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>

      {/* Terminal + log instances — all mounted, only active visible */}
      <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {tabs.map(t =>
          TERMINAL_SERVICES.has(t.id) ? (
            <TerminalTab key={t.id} sessionId={sessionId} service={t.id} active={activeTab === t.id} />
          ) : t.id === 'logs' ? (
            <LogTab key={t.id} sessionId={sessionId} active={activeTab === t.id} />
          ) : null
        )}
      </Box>
    </Box>
  )
}
