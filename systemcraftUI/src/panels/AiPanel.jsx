import { useState, useRef, useEffect, useCallback } from 'react'
import { Box, Tooltip, IconButton, CircularProgress } from '@mui/material'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import SendIcon from '@mui/icons-material/Send'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import CloseIcon from '@mui/icons-material/Close'
import { C } from '../theme'

function AiMessage({ content }) {
  const parts = content.split(/(```[\s\S]*?```)/g)
  return (
    <Box sx={{ fontSize: '1.0625rem', color: C.ink1, lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const inner = part.slice(3).trimEnd().slice(0, -3)
          const nl = inner.indexOf('\n')
          const code = nl > -1 ? inner.slice(nl + 1) : inner
          return (
            <Box key={i} component="pre" sx={{
              bgcolor: C.bg0, border: `1px solid ${C.line2}`, borderRadius: 1,
              px: 1.5, py: 1, my: '10px',
              fontFamily: '"JetBrains Mono", monospace', fontSize: '0.9375rem',
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

const MIN_W = 260
const MAX_W = 700

export default function AiPanel({ codeContext, terminalContext, onClose }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [width, setWidth] = useState(360)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startW = useRef(0)
  const bottomRef = useRef(null)

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = useCallback(async () => {
    if (!input.trim() || loading) return

    const contextParts = []
    if (codeContext?.path) {
      contextParts.push(
        `Active file: ${codeContext.path} (${codeContext.language || 'text'})`,
        '```',
        codeContext.content || '',
        '```',
      )
    }
    if (terminalContext) {
      contextParts.push(`\nTerminal output:\n\`\`\`\n${terminalContext}\n\`\`\``)
    }
    const contextBlock = contextParts.join('\n')

    const userMsg = { role: 'user', content: input }
    const history = [...messages, userMsg]
    setMessages(history)
    setInput('')
    setLoading(true)

    try {
      const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
      if (!apiKey) {
        setMessages(h => [...h, { role: 'assistant', content: 'Error: VITE_ANTHROPIC_API_KEY not set in .env' }])
        return
      }

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 1024,
          system: `You are an expert assistant embedded in SystemCraft, a distributed systems trainer. You help users understand code, debug terminal issues, and diagnose infrastructure problems.

Be concise. Show exact shell commands when relevant. Reference specific line numbers, variable names, or metric values from the context.${contextBlock ? `\n\nCurrent context:\n${contextBlock}` : ''}`,
          messages: history.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json()
      const result = data.content?.[0]?.text || 'No response'
      setMessages(h => [...h, { role: 'assistant', content: result }])
    } catch (err) {
      setMessages(h => [...h, { role: 'assistant', content: `Error: ${err.message}` }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages, codeContext, terminalContext])

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
          px: 2, py: 1, borderBottom: `1px solid ${C.line1}`,
          display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0,
          bgcolor: C.bg1,
        }}>
          <AutoAwesomeIcon sx={{ fontSize: 22, color: C.accent }} />
          <Box sx={{ fontFamily: '"IBM Plex Sans", sans-serif', fontSize: '1rem', fontWeight: 700, color: C.ink1, flex: 1 }}>
            AI Assistant
          </Box>
          {codeContext?.path && (
            <Box sx={{
              fontFamily: '"JetBrains Mono", monospace', fontSize: '0.75rem',
              color: C.ink4, bgcolor: C.bg2, border: `1px solid ${C.line2}`,
              borderRadius: 0.5, px: 1, py: 0.375, maxWidth: 140,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {codeContext.path.split('/').pop()}
            </Box>
          )}
          {messages.length > 0 && (
            <Tooltip title="Clear chat" arrow>
              <IconButton onClick={() => setMessages([])} sx={{ color: C.ink4, p: 0.75, '&:hover': { color: C.crit } }}>
                <DeleteOutlineIcon sx={{ fontSize: 22 }} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Close" arrow>
            <IconButton onClick={onClose} sx={{ color: C.ink4, p: 0.75, '&:hover': { color: C.ink1 } }}>
              <CloseIcon sx={{ fontSize: 22 }} />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Context indicator */}
        {(codeContext?.path || terminalContext) && (
          <Box sx={{
            px: 2, py: 0.75, borderBottom: `1px solid ${C.line1}`,
            display: 'flex', gap: 0.75, flexWrap: 'wrap', flexShrink: 0,
          }}>
            {codeContext?.path && (
              <Box sx={{
                fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8125rem',
                color: C.accent, bgcolor: C.accentSoft, border: `1px solid ${C.accentLine}`,
                borderRadius: 0.5, px: 1, py: 0.5,
              }}>
                ◈ {codeContext.path}
              </Box>
            )}
            {terminalContext && (
              <Box sx={{
                fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8125rem',
                color: C.ok, bgcolor: C.okSoft, border: `1px solid ${C.ok}33`,
                borderRadius: 0.5, px: 1, py: 0.5,
              }}>
                ◈ terminal output
              </Box>
            )}
          </Box>
        )}

        {/* Messages */}
        <Box sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {messages.length === 0 && (
            <Box sx={{ color: C.ink4, fontFamily: '"IBM Plex Sans", sans-serif', fontSize: '1rem', lineHeight: 1.9, mt: 0.5 }}>
              Ask anything — code, shell commands, infrastructure.<br /><br />
              Context auto-included:<br />
              · Active file in Code Editor<br />
              · Terminal output (when available)<br /><br />
              <Box component="span" sx={{ color: C.ink3 }}>Enter ↵ to send</Box>
            </Box>
          )}
          {messages.map((msg, i) => (
            <Box key={i} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Box sx={{
                fontFamily: '"JetBrains Mono", monospace', fontSize: '0.75rem',
                color: msg.role === 'user' ? C.accent : C.ok,
                textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700,
              }}>
                {msg.role === 'user' ? 'You' : 'Assistant'}
              </Box>
              <Box sx={{
                bgcolor: msg.role === 'user' ? C.bg2 : 'transparent',
                border: msg.role === 'user' ? `1px solid ${C.line2}` : 'none',
                borderRadius: 1,
                px: msg.role === 'user' ? 1.5 : 0,
                py: msg.role === 'user' ? 1 : 0,
              }}>
                <AiMessage content={msg.content} />
              </Box>
            </Box>
          ))}
          {loading && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: C.ink4, fontFamily: '"IBM Plex Sans", sans-serif', fontSize: '1rem' }}>
              <CircularProgress size={16} sx={{ color: C.accent }} />
              thinking…
            </Box>
          )}
          <div ref={bottomRef} />
        </Box>

        {/* Input */}
        <Box sx={{ borderTop: `1px solid ${C.line1}`, p: 1.25, flexShrink: 0 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
            <Box
              component="textarea"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
              }}
              placeholder="Ask about code or terminal…"
              rows={3}
              sx={{
                flex: 1, bgcolor: C.bg2, border: `1px solid ${C.line2}`, borderRadius: 1,
                px: 1.5, py: 1, fontSize: '1rem', color: C.ink1,
                fontFamily: '"IBM Plex Sans", sans-serif', resize: 'none', outline: 'none',
                lineHeight: 1.65,
                '&:focus': { borderColor: C.accentLine },
                '&::placeholder': { color: C.ink4 },
              }}
            />
            <IconButton
              onClick={send}
              disabled={!input.trim() || loading}
              sx={{
                bgcolor: C.accent, color: C.bg0, borderRadius: 1.5,
                p: 1.25, flexShrink: 0, mb: 0.25,
                '&:hover': { bgcolor: C.accent, opacity: 0.85 },
                '&:disabled': { bgcolor: C.line2, color: C.ink4 },
              }}
            >
              <SendIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Box>
          <Box sx={{ fontFamily: '"IBM Plex Sans", sans-serif', fontSize: '0.8125rem', color: C.ink4, mt: 0.75 }}>
            Enter to send · Shift+Enter for newline
          </Box>
        </Box>

      </Box>
    </Box>
  )
}
