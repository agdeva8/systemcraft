import { useState } from 'react'
import { Box } from '@mui/material'
import { C } from './theme'
import Landing from './components/Landing'
import Session from './components/Session'
import Scorecard from './components/Scorecard'

function Header({ view, onBack }) {
  return (
    <Box sx={{
      height: 48,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      px: 2.5,
      borderBottom: `1px solid ${C.line1}`,
      bgcolor: C.bg1,
      zIndex: 10,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{
          width: 10, height: 10,
          background: C.accent,
          transform: 'rotate(45deg)',
          flexShrink: 0,
        }} />
        <Box sx={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.8125rem',
          fontWeight: 500,
          color: C.ink1,
          letterSpacing: '0.02em',
        }}>
          SystemCraft
        </Box>
        <Box sx={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.6875rem',
          color: C.ink3,
          display: { xs: 'none', sm: 'block' },
        }}>
          / distributed systems trainer
        </Box>
      </Box>

      {view === 'session' && (
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 3 }}>
          <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem', color: C.ink3, display: { xs: 'none', md: 'block' } }}>
            session · sc_a8f1c2
          </Box>
          <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem', color: C.ink2 }}>
            cost · $0.18
          </Box>
        </Box>
      )}

      {view === 'landing' && (
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            component="button"
            sx={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: '0.6875rem',
              color: C.ink3,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              '&:hover': { color: C.ink1 },
              display: { xs: 'none', sm: 'block' },
            }}
          >
            docs
          </Box>
          <Box
            component="button"
            sx={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: '0.6875rem',
              color: C.accent,
              background: C.accentSoft,
              border: `1px solid ${C.accentLine}`,
              borderRadius: 1,
              px: 1.5,
              py: 0.75,
              cursor: 'pointer',
              '&:hover': { background: 'rgba(96,165,250,0.18)' },
            }}
          >
            sign in
          </Box>
        </Box>
      )}

      {view === 'scorecard' && (
        <Box sx={{ ml: 'auto', fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem', color: C.ink3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          scorecard
        </Box>
      )}
    </Box>
  )
}

export default function App() {
  const [view, setView] = useState({ name: 'landing' })

  const launch = (concept) => setView({ name: 'session', ...concept })
  const finish = () => setView({ name: 'scorecard' })
  const back = () => setView({ name: 'landing' })

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', bgcolor: C.bg0 }}>
      <Header view={view.name} onBack={back} />
      {view.name === 'landing' && <Landing onLaunch={launch} />}
      {view.name === 'session' && <Session view={view} onBack={back} onFinish={finish} />}
      {view.name === 'scorecard' && <Scorecard onBack={back} />}
    </Box>
  )
}
