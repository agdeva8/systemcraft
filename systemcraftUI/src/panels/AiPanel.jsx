import { useState, useRef, useEffect, useCallback } from 'react'
import { Box, Tooltip, IconButton, CircularProgress } from '@mui/material'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import SendIcon from '@mui/icons-material/Send'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import CloseIcon from '@mui/icons-material/Close'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import ViewSidebarIcon from '@mui/icons-material/ViewSidebar'
import { C } from '../theme'
import { streamAssist } from '../lib/api'
import FloatingWrapper from '../components/FloatingWrapper'

function AiMessage({ content }) {
  const parts = content.split(/(```[\s\S]*?```)/g)
  return (
    <Box sx={{ fontSize: '0.8125rem', color: C.ink1, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: '"JetBrains Mono", monospace' }}>
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const inner = part.slice(3).trimEnd().slice(0, -3)
          const nl = inner.indexOf('\n')
          const code = nl > -1 ? inner.slice(nl + 1) : inner
          return (
            <Box key={i} component="pre" sx={{
              bgcolor: C.bg0, border: `1px solid ${C.line2}`, borderRadius: 1,
              px: 1.5, py: 1, my: '8px',
              fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8125rem',
              color: C.ok, overflow: 'auto', whiteSpace: 'pre',
            }}>
              {code}
            </Box>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </Box>
  )
}

function AiBody({ messages, setMessages, input, setInput, loading, send, codeContext, terminalContext, bottomRef }) {
  return (
    <>
      {/* Context indicator */}
      {(codeContext?.path || terminalContext) && (
        <Box sx={{
          px: 1.5, py: 0.5, borderBottom: `1px solid ${C.line1}`,
          display: 'flex', gap: 0.5, flexWrap: 'wrap', flexShrink: 0,
        }}>
          {codeContext?.path && (
            <Box sx={{
              fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem',
              color: C.accent, bgcolor: C.accentSoft, border: `1px solid ${C.accentLine}`,
              borderRadius: 0.5, px: 0.75, py: 0.25,
            }}>
              ◈ {codeContext.path}
            </Box>
          )}
          {terminalContext && (
            <Box sx={{
              fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem',
              color: C.ok, bgcolor: C.okSoft, border: `1px solid ${C.ok}33`,
              borderRadius: 0.5, px: 0.75, py: 0.25,
            }}>
              ◈ terminal output
            </Box>
          )}
        </Box>
      )}

      {/* Messages */}
      <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5, minHeight: 0 }}>
        {messages.length === 0 && (
          <Box sx={{ color: C.ink4, fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8125rem', lineHeight: 1.75, mt: 0.5 }}>
            Ask anything — code, shell, infra.<br /><br />
            Context auto-included:<br />
            · Active file in Code Editor<br />
            · Terminal output<br /><br />
            <Box component="span" sx={{ color: C.ink3 }}>Enter ↵ to send</Box>
          </Box>
        )}
        {messages.map((msg, i) => (
          <Box key={i} sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
            <Box sx={{
              fontFamily: '"JetBrains Mono", monospace', fontSize: '0.625rem',
              color: msg.role === 'user' ? C.accent : C.ok,
              textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700,
            }}>
              {msg.role === 'user' ? 'You' : 'Assistant'}
            </Box>
            <Box sx={{
              bgcolor: msg.role === 'user' ? C.bg2 : 'transparent',
              border: msg.role === 'user' ? `1px solid ${C.line2}` : 'none',
              borderRadius: 1,
              px: msg.role === 'user' ? 1 : 0,
              py: msg.role === 'user' ? 0.75 : 0,
            }}>
              <AiMessage content={msg.content} />
            </Box>
          </Box>
        ))}
        {loading && messages[messages.length - 1]?.content === '' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: C.ink4, fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8125rem' }}>
            <CircularProgress size={14} sx={{ color: C.accent }} />
            thinking…
          </Box>
        )}
        <div ref={bottomRef} />
      </Box>

      {/* Input */}
      <Box sx={{ borderTop: `1px solid ${C.line1}`, p: 1, flexShrink: 0 }}>
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-end' }}>
          <Box
            component="textarea"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
            }}
            placeholder="Ask about code or terminal…"
            rows={2}
            sx={{
              flex: 1, bgcolor: C.bg2, border: `1px solid ${C.line2}`, borderRadius: 1,
              px: 1, py: 0.75, fontSize: '0.8125rem', color: C.ink1,
              fontFamily: '"JetBrains Mono", monospace', resize: 'none', outline: 'none',
              lineHeight: 1.55,
              '&:focus': { borderColor: C.accentLine },
              '&::placeholder': { color: C.ink4 },
            }}
          />
          <IconButton
            onClick={send}
            disabled={!input.trim() || loading}
            sx={{
              bgcolor: C.accent, color: C.bg0, borderRadius: 1,
              p: 0.875, flexShrink: 0,
              '&:hover': { bgcolor: C.accent, opacity: 0.85 },
              '&:disabled': { bgcolor: C.line2, color: C.ink4 },
            }}
          >
            <SendIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
        <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.625rem', color: C.ink4, mt: 0.5 }}>
          Enter to send · Shift+Enter for newline
        </Box>
      </Box>
    </>
  )
}

const DOCK_W = 360
const MIN_W = 260
const MAX_W = 700

export default function AiPanel({ sessionId, codeContext, terminalContext, onClose, floating, onToggleFloat }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [width, setWidth] = useState(DOCK_W)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startW = useRef(0)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const onResizeStart = useCallback((e) => {
    dragging.current = true
    startX.current = e.clientX
    startW.current = width
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
  }, [width])

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return
      const delta = startX.current - e.clientX
      setWidth(Math.min(MAX_W, Math.max(MIN_W, startW.current + delta)))
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const abortRef = useRef(null)

  const send = useCallback(() => {
    if (!input.trim() || loading) return
    const userMsg = { role: 'user', content: input }
    const history = [...messages, userMsg]
    setMessages([...history, { role: 'assistant', content: '' }])
    setInput('')
    setLoading(true)

    const apiHistory = history.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
    abortRef.current = streamAssist(sessionId, userMsg.content, apiHistory, codeContext, terminalContext, {
      onToken: (token) => {
        setMessages(h => {
          const updated = [...h]
          const last = updated[updated.length - 1]
          updated[updated.length - 1] = { ...last, content: last.content + token }
          return updated
        })
      },
      onDone: () => setLoading(false),
      onError: (err) => {
        setMessages(h => {
          const updated = [...h]
          updated[updated.length - 1] = { role: 'assistant', content: `Error: ${err}` }
          return updated
        })
        setLoading(false)
      },
    })
  }, [input, loading, messages, sessionId, codeContext, terminalContext])

  useEffect(() => {
    return () => abortRef.current?.()
  }, [])

  const bodyProps = { messages, setMessages, input, setInput, loading, send, codeContext, terminalContext, bottomRef }

  /* ── Floating mode ─── */
  if (floating) {
    return (
      <FloatingWrapper
        title="AI Assistant"
        color={C.ink1}
        defaultW={400}
        defaultH={500}
        onClose={onClose}
        onDock={onToggleFloat}
      >
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <AiBody {...bodyProps} />
        </Box>
      </FloatingWrapper>
    )
  }

  /* ── Docked sidebar mode ─── */
  return (
    <Box sx={{
      width, flexShrink: 0,
      borderLeft: `1px solid ${C.line1}`,
      display: 'flex', flexDirection: 'row',
      bgcolor: C.bg0, overflow: 'hidden', position: 'relative',
    }}>
      {/* Resize handle */}
      <Box
        onMouseDown={onResizeStart}
        sx={{
          width: 5, flexShrink: 0, cursor: 'ew-resize',
          bgcolor: 'transparent', transition: 'background 0.15s',
          '&:hover': { bgcolor: C.accentLine },
          zIndex: 10,
        }}
      />

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Header */}
        <Box sx={{
          height: 34, flexShrink: 0,
          px: 1.5, borderBottom: `1px solid ${C.line1}`,
          display: 'flex', alignItems: 'center', gap: 0.75,
          bgcolor: C.bg1,
        }}>
          <AutoAwesomeIcon sx={{ fontSize: 16, color: C.accent }} />
          <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8125rem', fontWeight: 700, color: C.ink1, flex: 1, letterSpacing: '0.03em' }}>
            AI Assistant
          </Box>
          {codeContext?.path && (
            <Box sx={{
              fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem',
              color: C.ink4, bgcolor: C.bg2, border: `1px solid ${C.line2}`,
              borderRadius: 0.5, px: 0.75, py: 0.25, maxWidth: 120,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {codeContext.path.split('/').pop()}
            </Box>
          )}
          {messages.length > 0 && (
            <Tooltip title="Clear chat" arrow>
              <IconButton onClick={() => setMessages([])} sx={{ color: C.ink4, p: 0.5, '&:hover': { color: C.crit } }}>
                <DeleteOutlineIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Undock to floating" arrow>
            <IconButton onClick={onToggleFloat} sx={{ color: C.ink4, p: 0.5, '&:hover': { color: C.accent } }}>
              <OpenInNewIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Close" arrow>
            <IconButton onClick={onClose} sx={{ color: C.ink4, p: 0.5, '&:hover': { color: C.ink1 } }}>
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>

        <AiBody {...bodyProps} />
      </Box>
    </Box>
  )
}
