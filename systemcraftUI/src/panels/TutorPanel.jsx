import { useState, useRef, useEffect, useContext } from 'react'
import { Box, Chip } from '@mui/material'
import { C } from '../theme'
import { SessionCtx } from '../components/Session'
import { sendDiagnose } from '../lib/api'

const ANSWER_CHIPS = ['TTLs aligned', 'Cold cache stampede', 'Lock contention', 'Pool exhaustion']

function Bubble({ who, text, meta }) {
  const isAi = who === 'ai'
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, alignItems: isAi ? 'flex-start' : 'flex-end' }}>
      <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5625rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: isAi ? C.accent : C.ink4 }}>
        {isAi ? 'Tutor' : 'You'}
      </Box>
      <Box sx={{
        px: 2, py: 1.5, borderRadius: 1.5,
        fontSize: '1rem', fontWeight: 600, lineHeight: 1.7,
        color: C.ink1,
        bgcolor: isAi ? C.accentSoft : C.bg2,
        border: `1px solid ${isAi ? C.accentLine : C.line1}`,
        maxWidth: '86%',
      }}>
        {text}
      </Box>
      {meta && (
        <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5625rem', color: C.ink4 }}>{meta}</Box>
      )}
    </Box>
  )
}

function ElapsedTimer() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return (
    <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.625rem', color: C.ink4, letterSpacing: '0.04em' }}>
      {m}:{String(s).padStart(2, '0')} elapsed
    </Box>
  )
}

export default function TutorPanel({ target, advanced, onAdvance, onFinish }) {
  const { sessionId, metrics } = useContext(SessionCtx)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [apiHistory, setApiHistory] = useState([])
  const scrollRef = useRef(null)

  // Seed opening question on mount
  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    const ctx = {
      current_state: 'state0_baseline',
      current_metrics: metrics ?? {},
      tier: 1,
      concept_target: target ?? '',
      history: [],
    }
    sendDiagnose(sessionId, 'start', ctx)
      .then(r => {
        setMessages([{ who: 'ai', text: r.reply }])
        setApiHistory([
          { role: 'user', content: 'start' },
          { role: 'assistant', content: r.reply },
        ])
      })
      .catch(() => {
        setMessages([{ who: 'ai', text: 'DB shows 94 active connections but CPU is at 31%. What does that combination usually tell you about where the bottleneck lives?' }])
      })
      .finally(() => setLoading(false))
  }, [sessionId])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, advanced, loading])

  const send = async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading) return
    setInput('')
    setMessages(m => [...m, { who: 'user', text: msg }])
    setLoading(true)

    const newHistory = [...apiHistory, { role: 'user', content: msg }]
    const ctx = {
      current_state: 'state0_baseline',
      current_metrics: metrics ?? {},
      tier: 1,
      concept_target: target ?? '',
      history: apiHistory,
    }

    try {
      const r = await sendDiagnose(sessionId, msg, ctx)
      setMessages(m => [...m, { who: 'ai', text: r.reply }])
      setApiHistory([...newHistory, { role: 'assistant', content: r.reply }])
    } catch {
      setMessages(m => [...m, { who: 'ai', text: 'What specific metric value catches your eye first?' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: C.bg1 }}>
      {/* Header */}
      <Box sx={{ px: 2, py: 0.875, borderBottom: `1px solid ${C.line1}`, bgcolor: C.bg0, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: C.accent, boxShadow: `0 0 6px ${C.accent}` }} />
        <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem', color: C.ink2 }}>Socratic Tutor</Box>
        <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5625rem', color: C.ink4 }}>· {target}</Box>
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
          <ElapsedTimer />
          <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5625rem', color: C.ink4 }}>opus</Box>
        </Box>
      </Box>

      {/* Messages */}
      <Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 2.5, minHeight: 0 }}>
        {messages.map((m, i) => <Bubble key={i} {...m} />)}
        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5625rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: C.accent }}>Tutor</Box>
            <Box sx={{ px: 2, py: 1.5, borderRadius: 1.5, bgcolor: C.accentSoft, border: `1px solid ${C.accentLine}`, display: 'flex', gap: 0.75, alignItems: 'center' }}>
              {[0, 1, 2].map(i => (
                <Box key={i} sx={{
                  width: 6, height: 6, borderRadius: '50%', bgcolor: C.accent,
                  '@keyframes bounce': { '0%,100%': { opacity: 0.3, transform: 'scale(0.8)' }, '50%': { opacity: 1, transform: 'scale(1)' } },
                  animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                }} />
              ))}
            </Box>
          </Box>
        )}
        {advanced && (
          <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: C.okSoft, border: `1px solid ${C.ok}44` }}>
            <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5625rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: C.ok, mb: 0.75 }}>Concept understood</Box>
            <Box sx={{ fontSize: '0.875rem', color: C.ok, mb: 2 }}>TTL jitter applied. Cache hit rate stabilized at 92%. Thundering herd resolved.</Box>
            <Box component="button" onClick={onFinish} sx={{
              display: 'block', width: '100%',
              fontFamily: '"JetBrains Mono", monospace', fontSize: '0.75rem', fontWeight: 500,
              color: C.bg0, bgcolor: C.ok, border: 'none', borderRadius: 1,
              py: 1, cursor: 'pointer', '&:hover': { opacity: 0.88 }, transition: 'opacity 0.15s',
            }}>
              View scorecard →
            </Box>
          </Box>
        )}
      </Box>

      {/* Quick answer chips */}
      <Box sx={{ px: 2, pt: 1, pb: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.75, flexShrink: 0 }}>
        <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5rem', color: C.ink4, letterSpacing: '0.06em', textTransform: 'uppercase', width: '100%', mb: 0.25 }}>Quick answer</Box>
        {ANSWER_CHIPS.map(s => (
          <Chip key={s} label={s} size="small" onClick={() => send(s)} sx={{
            bgcolor: C.bg2, color: C.ink2, border: `1px solid ${C.line2}`, cursor: 'pointer',
            fontSize: '0.6875rem',
            '&:hover': { borderColor: C.accentLine, color: C.accent },
            transition: 'border-color 0.15s, color 0.15s',
          }} />
        ))}
      </Box>

      {/* Input */}
      <Box sx={{ px: 2, pt: 0.5, pb: 1.5, display: 'flex', gap: 1, flexShrink: 0, flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Box
            component="textarea"
            rows={2}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Type your hypothesis… (Enter to send, Shift+Enter for newline)"
            sx={{
              flex: 1,
              bgcolor: C.bg2, border: `1px solid ${C.line2}`, borderRadius: 1,
              px: 1.5, py: 1,
              fontSize: '0.9375rem', color: C.ink1,
              fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
              resize: 'none', outline: 'none',
              '&:focus': { borderColor: C.accentLine },
              '&::placeholder': { color: C.ink4, fontSize: '0.8125rem' },
            }}
          />
          <Box component="button" onClick={() => send()} disabled={loading} sx={{
            fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem', fontWeight: 500,
            color: C.accent, bgcolor: C.accentSoft, border: `1px solid ${C.accentLine}`,
            borderRadius: 1, px: 1.75, cursor: loading ? 'wait' : 'pointer', flexShrink: 0, alignSelf: 'stretch',
            opacity: loading ? 0.6 : 1,
            '&:hover:not(:disabled)': { bgcolor: 'rgba(96,165,250,0.18)' },
          }}>
            Send
          </Box>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Chip
            label="💡 Hint, please"
            size="small"
            onClick={() => send('Can you give me a hint?')}
            sx={{
              bgcolor: 'transparent', color: C.ink4, border: `1px dashed ${C.line2}`, cursor: 'pointer',
              fontSize: '0.625rem',
              '&:hover': { color: C.ink2, borderColor: C.line3 },
            }}
          />
        </Box>
      </Box>
    </Box>
  )
}
