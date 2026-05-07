import { useState, useRef, useEffect, useCallback } from 'react'
import { Box, IconButton, Tooltip } from '@mui/material'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import CloseIcon from '@mui/icons-material/Close'
import DockIcon from '@mui/icons-material/ViewSidebar'
import { C } from '../theme'

const MIN_W = 300
const MIN_H = 250

export default function FloatingWrapper({ title, color = C.ink1, defaultX, defaultY, defaultW = 420, defaultH = 400, onClose, onDock, children }) {
  const [pos, setPos] = useState({
    x: defaultX ?? window.innerWidth - defaultW - 24,
    y: defaultY ?? window.innerHeight - defaultH - 24,
  })
  const [size, setSize] = useState({ w: defaultW, h: defaultH })
  const dragging = useRef(false)
  const resizing = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 })

  const onDragStart = useCallback((e) => {
    dragging.current = true
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
  }, [pos])

  const onResizeStart = useCallback((e) => {
    e.stopPropagation()
    resizing.current = true
    resizeStart.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h }
    document.body.style.cursor = 'se-resize'
    document.body.style.userSelect = 'none'
  }, [size])

  useEffect(() => {
    const onMove = (e) => {
      if (dragging.current) {
        setPos({
          x: Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOffset.current.x)),
          y: Math.max(0, Math.min(window.innerHeight - 50, e.clientY - dragOffset.current.y)),
        })
      }
      if (resizing.current) {
        setSize({
          w: Math.max(MIN_W, resizeStart.current.w + (e.clientX - resizeStart.current.x)),
          h: Math.max(MIN_H, resizeStart.current.h + (e.clientY - resizeStart.current.y)),
        })
      }
    }
    const onUp = () => {
      dragging.current = false
      resizing.current = false
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

  return (
    <Box sx={{
      position: 'fixed',
      left: pos.x, top: pos.y,
      width: size.w, height: size.h,
      zIndex: 1000,
      display: 'flex', flexDirection: 'column',
      bgcolor: C.bg0,
      border: `1px solid ${C.line2}`,
      borderRadius: '6px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <Box
        onMouseDown={onDragStart}
        sx={{
          height: 34, flexShrink: 0,
          display: 'flex', alignItems: 'center',
          borderBottom: `1px solid ${C.line1}`,
          bgcolor: C.bg1, cursor: 'grab',
          px: 1, gap: 0.75,
        }}
      >
        <DragIndicatorIcon sx={{ fontSize: 16, color: C.ink4 }} />
        <Box sx={{
          fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8125rem',
          fontWeight: 700, color, flex: 1, letterSpacing: '0.03em',
        }}>
          {title}
        </Box>
        {onDock && (
          <Tooltip title="Dock back" arrow>
            <IconButton onClick={onDock} sx={{ color: C.ink4, p: 0.5, '&:hover': { color: C.accent } }}>
              <DockIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Close" arrow>
          <IconButton onClick={onClose} sx={{ color: C.ink4, p: 0.5, '&:hover': { color: C.ink1 } }}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {children}
      </Box>

      {/* Resize handle */}
      <Box
        onMouseDown={onResizeStart}
        sx={{
          position: 'absolute', bottom: 0, right: 0,
          width: 18, height: 18, cursor: 'se-resize',
          '&::after': {
            content: '""', position: 'absolute',
            right: 4, bottom: 4, width: 9, height: 9,
            borderRight: `2px solid ${C.line3}`,
            borderBottom: `2px solid ${C.line3}`,
            borderRadius: '0 0 2px 0',
            transition: 'border-color 0.15s',
          },
          '&:hover::after': { borderColor: C.accent },
        }}
      />
    </Box>
  )
}
