import { useState, useRef } from 'react'
import { Box, IconButton } from '@mui/material'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { C } from '../theme'

const TABS = [
  { id: 'postgres',  label: 'postgres',  status: 'crit',   prompt: 'postgres=#' },
  { id: 'redis',     label: 'redis',     status: 'ok',     prompt: 'redis>' },
  { id: 'app-logs',  label: 'app logs',  status: 'warn',   prompt: '$' },
  { id: 'llm',       label: 'llm',       status: 'accent', prompt: '#' },
]

const statusColor = s => ({ crit: C.crit, ok: C.ok, warn: C.warn, accent: C.accent }[s] || C.ink3)

function TermContent({ tab }) {
  if (tab === 'postgres') return (
    <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.8, color: C.ink1 }}>
      <Box><Box component="span" sx={{ color: C.accent }}>postgres=#</Box> SELECT count(*), state FROM pg_stat_activity GROUP BY state;</Box>
      <Box component="pre" sx={{ m: 0, color: C.ink2, fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit' }}>{` count | state
-------+--------
    94 | active
     6 | idle`}</Box>
      <Box sx={{ color: C.ink3, fontStyle: 'italic', mt: 0.5 }}>-- 67 of 94 active blocked on same query</Box>
      <Box sx={{ mt: 1.5 }}><Box component="span" sx={{ color: C.accent }}>postgres=#</Box> <Box component="span" sx={{ color: C.ink3 }}>SELECT query, count(*) FROM pg_stat_activity GROUP BY query ORDER BY count DESC LIMIT 3;</Box></Box>
      <Box component="pre" sx={{ m: 0, color: C.ink2, fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit' }}>{`                    query                         | count
--------------------------------------------------+-------
 SELECT long_url FROM urls WHERE short_code = $1  |    67
 SELECT long_url FROM urls WHERE short_code = $1  |    18
 <IDLE>                                           |     6`}</Box>
    </Box>
  )

  if (tab === 'redis') return (
    <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.8, color: C.ink1 }}>
      <Box><Box component="span" sx={{ color: C.ok }}>redis&gt;</Box> INFO stats</Box>
      <Box component="pre" sx={{ m: 0, color: C.ink2, fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit' }}>{`keyspace_hits:0
keyspace_misses:0
instantaneous_ops_per_sec:0`}</Box>
      <Box sx={{ color: C.warn, mt: 0.5 }}>→ redis running but unused (no cache layer yet)</Box>
      <Box sx={{ mt: 1.5 }}><Box component="span" sx={{ color: C.ok }}>redis&gt;</Box> TTL url:abc123</Box>
      <Box sx={{ color: C.ink2 }}>(integer) -2  <Box component="span" sx={{ color: C.ink4 }}># key does not exist</Box></Box>
    </Box>
  )

  if (tab === 'app-logs') return (
    <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.8, color: C.ink1 }}>
      <Box sx={{ color: C.warn }}>[WARN]  db pool: 94/100 connections in use</Box>
      <Box sx={{ color: C.warn }}>[WARN]  db pool: 98/100 connections in use</Box>
      <Box sx={{ color: C.crit }}>[ERROR] connection timeout after 5000ms — pool exhausted</Box>
      <Box sx={{ color: C.crit }}>[ERROR] connection timeout after 5000ms — pool exhausted</Box>
      <Box sx={{ color: C.crit }}>[ERROR] HTTPException 503: service unavailable</Box>
      <Box sx={{ color: C.warn }}>[WARN]  db pool: 95/100 connections in use</Box>
    </Box>
  )

  return (
    <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.8, color: C.ink1 }}>
      <Box sx={{ color: C.accent }}># socratic tutor — questions only, never answers</Box>
      <Box>concept_target: <Box component="span" sx={{ color: C.accent }}>cache-aside</Box></Box>
      <Box>model: <Box component="span" sx={{ color: C.ink1 }}>claude-opus-4-5</Box></Box>
      <Box>tokens: <Box component="span" sx={{ color: C.ink1 }}>1,204</Box></Box>
      <Box>cost: <Box component="span" sx={{ color: C.ok }}>$0.18</Box></Box>
    </Box>
  )
}

export default function TerminalPanel() {
  const [activeTab, setActiveTab] = useState('postgres')
  const [cmd, setCmd] = useState('')
  const inputRef = useRef(null)
  const tabsScrollRef = useRef(null)
  const active = TABS.find(t => t.id === activeTab)

  const scrollTabs = (dir) => {
    if (tabsScrollRef.current) tabsScrollRef.current.scrollLeft += dir * 100
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: C.bg0 }}>
      {/* Tab strip with overflow scroll */}
      <Box sx={{
        height: 34, flexShrink: 0,
        display: 'flex', alignItems: 'stretch',
        borderBottom: `1px solid ${C.line1}`,
        bgcolor: C.bg1,
      }}>
        <IconButton size="small" onClick={() => scrollTabs(-1)} sx={{ color: C.ink4, borderRadius: 0, px: 0.75, flexShrink: 0, '&:hover': { bgcolor: C.bg2 } }}>
          <ChevronLeftIcon sx={{ fontSize: 14 }} />
        </IconButton>

        <Box
          ref={tabsScrollRef}
          sx={{ flex: 1, display: 'flex', overflow: 'hidden', scrollBehavior: 'smooth' }}
        >
          {TABS.map(t => (
            <Box
              key={t.id}
              component="button"
              onClick={() => setActiveTab(t.id)}
              sx={{
                px: 1.75, height: '100%',
                fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8125rem',
                borderRight: `1px solid ${C.line1}`,
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
              <Box sx={{
                width: 6, height: 6, borderRadius: '50%',
                bgcolor: statusColor(t.status),
                ...(t.status === 'crit' ? {
                  '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.35 } },
                  animation: 'pulse 2s ease-in-out infinite',
                } : {}),
              }} />
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

      {/* Terminal output */}
      <Box
        onClick={() => inputRef.current?.focus()}
        sx={{ flex: 1, overflowY: 'auto', p: 1.5, minHeight: 0, cursor: 'text' }}
      >
        <TermContent tab={activeTab} />
      </Box>

      {/* Input */}
      <Box sx={{
        height: 34, px: 1.5, flexShrink: 0,
        borderTop: `1px solid ${C.line1}`, bgcolor: C.bg1,
        display: 'flex', alignItems: 'center', gap: 1,
      }}>
        <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8125rem', color: C.accent, flexShrink: 0 }}>
          {active?.prompt}
        </Box>
        <Box
          ref={inputRef}
          component="input"
          value={cmd}
          onChange={e => setCmd(e.target.value)}
          placeholder="type a command…"
          sx={{
            flex: 1, bgcolor: 'transparent', border: 'none', outline: 'none',
            fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8125rem',
            color: C.ink1, '&::placeholder': { color: C.ink4 },
          }}
        />
      </Box>
    </Box>
  )
}
