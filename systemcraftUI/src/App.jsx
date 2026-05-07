import { useState, useEffect, useRef, useCallback } from 'react'
import { Box } from '@mui/material'
import { BrowserRouter, Routes, Route, useNavigate, useParams, useLocation } from 'react-router-dom'
import { C } from './theme'
import Landing from './components/Landing'
import Session from './components/Session'
import Scorecard from './components/Scorecard'
import { fetchCatalog, createSession, destroySession } from './lib/api'
import { SHELVES, SCENARIOS, TECHNOLOGIES, ALL_CONCEPTS } from './data'

const STATIC_CATALOG = { shelves: SHELVES, scenarios: SCENARIOS, technologies: TECHNOLOGIES, all_concepts: ALL_CONCEPTS }

// ── Shared catalog context via prop drilling ──────────────────────────────────

function LoadingScreen() {
  return (
    <Box sx={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', bgcolor: C.bg0 }}>
      <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8125rem', color: C.ink3 }}>
        Loading...
      </Box>
    </Box>
  )
}

// ── Header ────────────────────────────────────────────────────────────────────

function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const isLanding = location.pathname === '/' || location.pathname === ''
  const isSession = location.pathname.startsWith('/concept/') || location.pathname.startsWith('/scenario/')
  const isScorecard = location.pathname === '/scorecard'

  return (
    <Box sx={{
      height: 48, flexShrink: 0,
      display: 'flex', alignItems: 'center', gap: 2,
      px: 2.5, borderBottom: `1px solid ${C.line1}`,
      bgcolor: C.bg1, zIndex: 10,
    }}>
      <Box
        component="button"
        onClick={() => navigate('/')}
        sx={{ display: 'flex', alignItems: 'center', gap: 1.5, background: 'none', border: 'none', cursor: 'pointer', p: 0 }}
      >
        <Box sx={{ width: 10, height: 10, background: C.accent, transform: 'rotate(45deg)', flexShrink: 0 }} />
        <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8125rem', fontWeight: 500, color: C.ink1, letterSpacing: '0.02em' }}>
          SystemCraft
        </Box>
        <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem', color: C.ink3, display: { xs: 'none', sm: 'block' } }}>
          / distributed systems trainer
        </Box>
      </Box>

      {isLanding && (
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box component="button" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem', color: C.ink3, background: 'none', border: 'none', cursor: 'pointer', '&:hover': { color: C.ink1 }, display: { xs: 'none', sm: 'block' } }}>
            docs
          </Box>
          <Box component="button" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem', color: C.accent, background: C.accentSoft, border: `1px solid ${C.accentLine}`, borderRadius: 1, px: 1.5, py: 0.75, cursor: 'pointer', '&:hover': { background: 'rgba(96,165,250,0.18)' } }}>
            sign in
          </Box>
        </Box>
      )}

      {isScorecard && (
        <Box sx={{ ml: 'auto', fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem', color: C.ink3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          scorecard
        </Box>
      )}
    </Box>
  )
}

// ── Route: Landing ────────────────────────────────────────────────────────────

function LandingRoute({ catalog }) {
  const navigate = useNavigate()
  if (catalog === null) return <LoadingScreen />
  const launch = (concept) => navigate(`/concept/${concept.slug}`)
  return <Landing onLaunch={launch} catalog={catalog} />
}

// ── Route: Concept session (boots at mapped state) ────────────────────────────

function ConceptRoute({ catalog }) {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [view, setView] = useState(null)
  const [error, setError] = useState(null)
  const creatingRef = useRef(false)

  useEffect(() => {
    if (!catalog || creatingRef.current) return
    const concept = catalog.all_concepts?.find(c => c.slug === slug)
    if (!concept) { setError(`Unknown concept: ${slug}`); return }
    creatingRef.current = true
    createSession({ scenario: concept.scenario, boot_state: concept.state, concept_target: concept.slug })
      .then(s => setView({ ...concept, session_id: s.session_id }))
      .catch(() => { setView({ ...concept, session_id: null }); creatingRef.current = false })
  }, [slug, catalog])

  const handleBack = useCallback(() => {
    if (view?.session_id) destroySession(view.session_id).catch(() => {})
    navigate('/')
  }, [view, navigate])

  if (!catalog || !view) return <LoadingScreen />
  if (error) return (
    <Box sx={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', bgcolor: C.bg0 }}>
      <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8125rem', color: C.crit }}>{error}</Box>
    </Box>
  )
  return <Session view={view} onBack={handleBack} onFinish={() => navigate('/scorecard')} />
}

// ── Route: Scenario session (boots at state0_baseline) ────────────────────────

function ScenarioRoute({ catalog }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [view, setView] = useState(null)
  const creatingRef = useRef(false)

  useEffect(() => {
    if (!catalog || creatingRef.current) return
    const scenario = catalog.scenarios?.find(s => s.id === id)
    if (!scenario) return
    creatingRef.current = true
    const concept = catalog.all_concepts?.find(c => c.slug === scenario.target)
    const launchConcept = concept ?? { slug: scenario.target, scenario: id, state: 'state0_baseline', title: scenario.name }
    createSession({ scenario: id, boot_state: 'state0_baseline', concept_target: scenario.target })
      .then(s => setView({ ...launchConcept, session_id: s.session_id }))
      .catch(() => { setView({ ...launchConcept, session_id: null }); creatingRef.current = false })
  }, [id, catalog])

  const handleBack = useCallback(() => {
    if (view?.session_id) destroySession(view.session_id).catch(() => {})
    navigate('/')
  }, [view, navigate])

  if (!catalog || !view) return <LoadingScreen />
  return <Session view={view} onBack={handleBack} onFinish={() => navigate('/scorecard')} />
}

// ── Root App ──────────────────────────────────────────────────────────────────

function AppInner() {
  const [catalog, setCatalog] = useState(STATIC_CATALOG)

  useEffect(() => {
    fetchCatalog()
      .then(setCatalog)
      .catch(() => {})
  }, [])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', bgcolor: C.bg0 }}>
      <Header />
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Routes>
          <Route path="/"              element={<LandingRoute catalog={catalog} />} />
          <Route path="/concept/:slug" element={<ConceptRoute catalog={catalog} />} />
          <Route path="/scenario/:id"  element={<ScenarioRoute catalog={catalog} />} />
          <Route path="/scorecard"     element={<Scorecard onBack={() => {}} />} />
          <Route path="*"              element={<LandingRoute catalog={catalog} />} />
        </Routes>
      </Box>
    </Box>
  )
}

export default function App() {
  return (
    <BrowserRouter basename="/systemcraft">
      <AppInner />
    </BrowserRouter>
  )
}
