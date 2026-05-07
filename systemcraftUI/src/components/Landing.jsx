import { useState } from 'react'
import { Box, Tabs, Tab, Chip, Typography, Tooltip } from '@mui/material'
import { C } from '../theme'
import { SHELVES, SCENARIOS, TECHNOLOGIES, ALL_CONCEPTS } from '../data'

// Color-coded tech tag palette
const TECH_COLORS = {
  redis:         { bg: 'rgba(220,38,38,0.12)',  border: 'rgba(220,38,38,0.28)',  text: '#fca5a5' },
  kafka:         { bg: 'rgba(37,99,235,0.12)',   border: 'rgba(37,99,235,0.28)',   text: '#93c5fd' },
  postgres:      { bg: 'rgba(3,105,161,0.12)',   border: 'rgba(3,105,161,0.28)',   text: '#7dd3fc' },
  cassandra:     { bg: 'rgba(124,58,237,0.12)',  border: 'rgba(124,58,237,0.28)',  text: '#c4b5fd' },
  elasticsearch: { bg: 'rgba(5,150,105,0.12)',   border: 'rgba(5,150,105,0.28)',   text: '#6ee7b7' },
  s3:            { bg: 'rgba(217,119,6,0.12)',   border: 'rgba(217,119,6,0.28)',   text: '#fcd34d' },
  flink:         { bg: 'rgba(180,83,9,0.12)',    border: 'rgba(180,83,9,0.28)',    text: '#fed7aa' },
  queue:         { bg: 'rgba(234,88,12,0.12)',   border: 'rgba(234,88,12,0.28)',   text: '#fdba74' },
  queues:        { bg: 'rgba(234,88,12,0.12)',   border: 'rgba(234,88,12,0.28)',   text: '#fdba74' },
  lua:           { bg: 'rgba(22,163,74,0.12)',   border: 'rgba(22,163,74,0.28)',   text: '#86efac' },
  api:           { bg: 'rgba(99,102,241,0.12)',  border: 'rgba(99,102,241,0.28)',  text: '#a5b4fc' },
}
const techStyle = (tag) => TECH_COLORS[tag.toLowerCase()] || { bg: C.bg3, border: C.line2, text: C.ink3 }

// Tier metadata
const TIER_INFO = {
  T1: { label: 'Beginner',      color: C.ok },
  T2: { label: 'Intermediate',  color: C.warn },
  T3: { label: 'Advanced',      color: C.accent },
}

function TechTag({ tag }) {
  const s = techStyle(tag)
  return (
    <Box sx={{
      fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5625rem',
      color: s.text, bgcolor: s.bg, border: `1px solid ${s.border}`,
      borderRadius: 0.75, px: 0.875, py: 0.2, whiteSpace: 'nowrap',
    }}>
      {tag}
    </Box>
  )
}

function ConceptCard({ c, onLaunch }) {
  const tier = TIER_INFO[c.tier]
  return (
    <Box
      component="button"
      onClick={() => onLaunch(c)}
      sx={{
        textAlign: 'left', background: C.bg1,
        border: `1px solid ${C.line1}`, borderRadius: 2,
        p: 2, cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
        '&:hover': { background: C.bg2, borderColor: C.accentLine },
        display: 'flex', flexDirection: 'column', gap: 0.75,
        height: '100%', // uniform card height
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Tooltip title={`${c.tier} — ${tier?.label}`} arrow>
          <Box sx={{
            fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5625rem',
            color: tier?.color || C.ink3,
            border: `1px solid ${(tier?.color || C.ink3) + '44'}`,
            borderRadius: 0.5, px: 0.75, py: 0.2, cursor: 'help',
          }}>
            {c.tier}
          </Box>
        </Tooltip>
        <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.625rem', color: C.ink4 }}>→</Box>
      </Box>
      <Box sx={{ fontSize: '0.9375rem', fontWeight: 500, color: C.ink1, lineHeight: 1.3 }}>{c.title}</Box>
      <Box sx={{ fontSize: '0.8125rem', color: C.ink3, lineHeight: 1.55, flex: 1, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.desc}</Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, pt: 1, borderTop: `1px solid ${C.line1}` }}>
        {c.stack.map(s => <TechTag key={s} tag={s} />)}
      </Box>
    </Box>
  )
}

function TechCard({ tech, onLaunch }) {
  const concept = ALL_CONCEPTS.find(c => c.slug === tech.launchSlug)
  return (
    <Box sx={{
      background: C.bg1, border: `1px solid ${C.line1}`, borderRadius: 2,
      p: 2.5, display: 'flex', flexDirection: 'column', gap: 2,
      transition: 'border-color 0.15s',
      '&:hover': { borderColor: tech.color + '55' },
      height: '100%',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box sx={{
          width: 40, height: 40, borderRadius: 1.5, flexShrink: 0,
          background: tech.color + '18', border: `1px solid ${tech.color}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem',
        }}>
          {tech.emoji}
        </Box>
        <Box>
          <Box sx={{ fontSize: '1rem', fontWeight: 500, color: C.ink1 }}>{tech.name}</Box>
          <Box sx={{ fontSize: '0.8125rem', color: C.ink3, lineHeight: 1.4, mt: 0.25 }}>{tech.tagline}</Box>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {tech.facts.map((f, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: tech.color, flexShrink: 0, mt: 0.6 }} />
            <Box sx={{ fontSize: '0.8125rem', color: C.ink2, lineHeight: 1.5 }}>{f}</Box>
          </Box>
        ))}
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {tech.concepts.slice(0, 4).map(slug => {
          const c = ALL_CONCEPTS.find(x => x.slug === slug)
          return c ? <TechTag key={slug} tag={c.title.length > 20 ? slug.replace(/-/g, ' ') : c.title} /> : null
        })}
        {tech.concepts.length > 4 && (
          <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5625rem', color: C.ink4, bgcolor: C.bg2, border: `1px solid ${C.line1}`, borderRadius: 0.75, px: 0.875, py: 0.2 }}>
            +{tech.concepts.length - 4} more
          </Box>
        )}
      </Box>

      <Box
        component="button"
        onClick={() => concept && onLaunch(concept)}
        sx={{
          mt: 'auto',
          fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem',
          color: tech.color,
          background: tech.color + '14', border: `1px solid ${tech.color}33`,
          borderRadius: 1, px: 2, py: 1,
          cursor: 'pointer', textAlign: 'center',
          transition: 'background 0.15s',
          '&:hover': { background: tech.color + '26' },
        }}
      >
        Practice → {tech.concepts.length} concept{tech.concepts.length !== 1 ? 's' : ''}
      </Box>
    </Box>
  )
}

export default function Landing({ onLaunch }) {
  const [tab, setTab] = useState(0)
  const totalConcepts = SHELVES.reduce((a, s) => a + s.concepts.length, 0)
  const firstConcept = SHELVES[0].concepts[0]

  return (
    <Box sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Hero */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: '1.4fr 1fr' },
        gap: { xs: 4, lg: 8 },
        px: { xs: 3, sm: 5, lg: 8 },
        py: { xs: 5, lg: 8 },
        borderBottom: `1px solid ${C.line1}`,
        alignItems: 'center',
      }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: C.ok, boxShadow: `0 0 8px ${C.ok}` }} />
            <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem', color: C.ink3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              live infrastructure · docker
            </Box>
          </Box>

          <Typography variant="h1" sx={{ color: C.ink1, lineHeight: 1.04, fontSize: { xs: '2rem', sm: '2.5rem', lg: '3.25rem' } }}>
            Real Docker infrastructure.<br />
            <Box component="span" sx={{ color: C.ink3 }}>Engineered to break.</Box>
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            {[
              'Boot broken infrastructure. Watch real metrics turn red.',
              'Form a hypothesis. Get a Socratic question back (never an answer).',
              'Edit real code in the editor. Verify the fix holds.',
            ].map(line => (
              <Box key={line} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: C.accent, flexShrink: 0, mt: 0.6 }} />
                <Box sx={{ fontSize: '0.9375rem', color: C.ink2, lineHeight: 1.55 }}>{line}</Box>
              </Box>
            ))}
          </Box>

          {/* Primary CTA */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Box
              component="button"
              onClick={() => onLaunch(firstConcept)}
              sx={{
                display: 'inline-flex', alignItems: 'center', gap: 1.5,
                fontFamily: '"JetBrains Mono", monospace', fontSize: '0.875rem', fontWeight: 500,
                color: C.bg0, bgcolor: C.accent, border: 'none',
                borderRadius: 1.5, px: 3, py: 1.5,
                cursor: 'pointer',
                transition: 'opacity 0.15s, transform 0.1s',
                '&:hover': { opacity: 0.88, transform: 'translateY(-1px)' },
                boxShadow: `0 4px 20px ${C.accent}44`,
              }}
            >
              Start learning →
            </Box>
            <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem', color: C.ink4 }}>
              {totalConcepts} concepts · {SCENARIOS.length} scenarios · no setup needed
            </Box>
          </Box>
        </Box>

        {/* Mini arch preview */}
        <Box sx={{
          display: { xs: 'none', lg: 'flex' },
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          borderRadius: 2, border: `1px solid ${C.line2}`,
          bgcolor: C.bg1, aspectRatio: '4/3', overflow: 'hidden', position: 'relative',
          backgroundImage: `repeating-linear-gradient(135deg, ${C.line1}, ${C.line1} 8px, ${C.bg2} 8px, ${C.bg2} 16px)`,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0, p: 3 }}>
            {['client', 'app', 'postgres'].map((n, i) => (
              <Box key={n} sx={{ display: 'flex', alignItems: 'center' }}>
                <Box sx={{
                  width: 80, px: 1.5, py: 1, bgcolor: C.bg1, borderRadius: 1,
                  border: `1px solid ${i === 2 ? C.crit + '66' : C.ok + '44'}`,
                  boxShadow: i === 2 ? `0 0 12px ${C.crit}22` : 'none',
                  textAlign: 'center',
                }}>
                  <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5625rem', color: C.ink3 }}>{n}</Box>
                </Box>
                {i < 2 && (
                  <Box sx={{ width: 28, height: 1, bgcolor: i === 1 ? C.crit + '66' : C.line2, mx: 0.5, position: 'relative' }}>
                    <Box sx={{ position: 'absolute', right: -1, top: -3, width: 0, height: 0, borderTop: '3px solid transparent', borderBottom: '3px solid transparent', borderLeft: `5px solid ${i === 1 ? C.crit : C.line2}` }} />
                  </Box>
                )}
              </Box>
            ))}
          </Box>
          <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5625rem', color: C.crit, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: C.crit, animation: 'pulse 1.5s ease-in-out infinite', '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }} />
            94/100 connections saturated
          </Box>
        </Box>
      </Box>

      {/* Loop steps */}
      <Box sx={{ px: { xs: 3, sm: 5, lg: 8 }, py: 1.75, borderBottom: `1px solid ${C.line1}`, bgcolor: C.bg1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0 }}>
          {['Boot broken infra', 'Watch metrics turn red', 'Form hypothesis', 'Socratic question back', 'Apply fix in editor', 'Verify → advance'].map((step, i, arr) => (
            <Box key={step} sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75 }}>
                <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: C.bg2, border: `1px solid ${C.line2}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"JetBrains Mono"', fontSize: '0.5rem', color: C.ink3, flexShrink: 0 }}>
                  {i + 1}
                </Box>
                <Box sx={{ fontSize: '0.8125rem', color: C.ink2 }}>{step}</Box>
              </Box>
              {i < arr.length - 1 && <Box sx={{ color: C.ink4, fontSize: '0.75rem' }}>→</Box>}
            </Box>
          ))}
        </Box>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: `1px solid ${C.line1}`, bgcolor: C.bg0, position: 'sticky', top: 0, zIndex: 20, px: { xs: 3, sm: 5, lg: 8 }, display: 'flex', alignItems: 'center' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 44 }}>
          <Tab label="By Concept" />
          <Tab label="By Scenario" />
          <Tab label="By Technology" />
        </Tabs>
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Tier legend */}
          {tab === 0 && (
            <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 2 }}>
              {Object.entries(TIER_INFO).map(([t, { label, color }]) => (
                <Box key={t} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: color }} />
                  <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5625rem', color: C.ink4 }}>{t} = {label}</Box>
                </Box>
              ))}
            </Box>
          )}
          <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.625rem', color: C.ink4, display: { xs: 'none', sm: 'block' }, borderLeft: `1px solid ${C.line2}`, pl: 2 }}>
            {tab === 0 && `${totalConcepts} concepts · ${SHELVES.length} groups`}
            {tab === 1 && `${SCENARIOS.length} scenarios`}
            {tab === 2 && `${TECHNOLOGIES.length} technologies`}
          </Box>
        </Box>
      </Box>

      {/* Content */}
      <Box sx={{ px: { xs: 3, sm: 5, lg: 8 }, py: 5, flex: 1 }}>

        {/* By Concept */}
        {tab === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {SHELVES.map(shelf => (
              <Box key={shelf.id}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2, mb: 2.5, pb: 1.5, borderBottom: `1px solid ${C.line1}` }}>
                  <Box>
                    <Typography variant="h2" sx={{ color: C.ink1 }}>{shelf.title}</Typography>
                    <Box sx={{ fontSize: '0.875rem', color: C.ink3, mt: 0.5 }}>{shelf.sub}</Box>
                  </Box>
                  <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.625rem', color: C.ink4, whiteSpace: 'nowrap', display: { xs: 'none', sm: 'block' } }}>
                    {shelf.concepts.length} concepts
                  </Box>
                </Box>
                {/* 3-column grid at wide viewports, uniform card height */}
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 1.5, alignItems: 'stretch' }}>
                  {shelf.concepts.map(c => <ConceptCard key={c.slug} c={c} onLaunch={onLaunch} />)}
                </Box>
              </Box>
            ))}
          </Box>
        )}

        {/* By Scenario */}
        {tab === 1 && (
          <Box sx={{ border: `1px solid ${C.line1}`, borderRadius: 2, overflow: 'hidden', bgcolor: C.bg1 }}>
            <Box sx={{
              display: { xs: 'none', md: 'grid' },
              gridTemplateColumns: '56px 1.4fr 1.8fr 1fr 80px',
              px: 2.5, py: 1.5,
              fontFamily: '"JetBrains Mono", monospace', fontSize: '0.625rem', color: C.ink4,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              borderBottom: `1px solid ${C.line1}`, bgcolor: C.bg0,
            }}>
              <span>#</span><span>Scenario</span><span>Vehicle</span><span>Stack</span><span style={{ textAlign: 'right' }}>States</span>
            </Box>
            {SCENARIOS.map(sc => (
              <Box
                key={sc.id}
                component="button"
                onClick={() => onLaunch({ scenario: sc.id, slug: sc.target, title: sc.name, vehicle: sc.vehicle, state: 'state0_baseline', tier: 'T1', stack: sc.stack })}
                sx={{
                  width: '100%', textAlign: 'left',
                  display: 'grid', gridTemplateColumns: { xs: '1fr', md: '56px 1.4fr 1.8fr 1fr 80px' },
                  gap: 1, px: 2.5, py: 2,
                  borderBottom: `1px solid ${C.line1}`, '&:last-child': { borderBottom: 'none' },
                  cursor: 'pointer', background: 'transparent',
                  transition: 'background 0.15s', '&:hover': { background: C.bg2 },
                  alignItems: 'center',
                }}
              >
                <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.75rem', color: C.ink4 }}>{sc.num}</Box>
                <Box sx={{ fontSize: '0.9375rem', fontWeight: 500, color: C.ink1 }}>{sc.name}</Box>
                <Box sx={{ fontSize: '0.8125rem', color: C.ink3 }}>{sc.vehicle}</Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {sc.stack.map(s => <TechTag key={s} tag={s} />)}
                </Box>
                <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.75rem', color: C.ink3, textAlign: { md: 'right' } }}>{sc.states} states</Box>
              </Box>
            ))}
          </Box>
        )}

        {/* By Technology */}
        {tab === 2 && (
          <Box>
            <Box sx={{ mb: 4 }}>
              <Typography variant="h2" sx={{ color: C.ink1, mb: 0.75 }}>Practice by technology</Typography>
              <Box sx={{ fontSize: '0.9375rem', color: C.ink3, maxWidth: 600 }}>
                Pick a datastore. Learn what breaks it, why, and how to fix it — through live failure on real infrastructure.
              </Box>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 2, alignItems: 'stretch' }}>
              {TECHNOLOGIES.map(tech => <TechCard key={tech.id} tech={tech} onLaunch={onLaunch} />)}
            </Box>
          </Box>
        )}

      </Box>
    </Box>
  )
}
