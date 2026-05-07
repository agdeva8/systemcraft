import { Box, Chip } from '@mui/material'
import { C } from '../theme'

const CONCEPTS = [
  { name: 'Cache-Aside', at: '00:42', ok: true },
  { name: 'Connection Pool Exhaustion', at: '01:08', ok: true },
  { name: 'Thundering Herd', at: '04:12', ok: true },
  { name: 'TTL Jitter', at: '04:55', ok: true },
  { name: 'Hot Key Problem', at: '—', ok: false },
]

const DELTAS = [
  { k: 'p99 latency', before: '847ms', after: '11ms', ok: true },
  { k: 'error rate', before: '2.4%', after: '0.0%', ok: true },
  { k: 'db cpu', before: '98%', after: '14%', ok: true },
  { k: 'redis hit ratio', before: '—', after: '92.3%', ok: true },
]

const TIERS = [
  { t: 'T1', name: 'Baseline → cache', at: '00:42', done: true, sub: 'Identified pool exhaustion. Added Redis cache-aside.' },
  { t: 'T2', name: 'Thundering herd', at: '04:12', done: true, sub: 'Spotted aligned TTLs. Added TTL jitter.' },
  { t: 'T3', name: 'Hot key (in progress)', at: '—', done: false, sub: 'Cache layer won\'t save you when 80% of traffic is one URL.' },
  { t: 'T4', name: 'L1 cache', at: '—', done: false, sub: 'Locked' },
]

const NEXT = [
  { title: 'Hot Key Problem', desc: 'Finish the URL Shortener arc — what happens when one key dominates.' },
  { title: 'Async Queues', desc: 'Different vehicle. Decouple writes from the request thread.' },
  { title: 'Token Bucket', desc: 'Atomic Redis ops protect what\'s behind the gateway.' },
]

export default function Scorecard({ onBack }) {
  return (
    <Box sx={{ flex: 1, overflowY: 'auto', px: { xs: 3, sm: 5, lg: 8 }, py: 5 }}>
      <Box sx={{ maxWidth: 960, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>

        {/* Title */}
        <Box>
          <Box
            component="button"
            onClick={onBack}
            sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem', color: C.ink3, background: 'none', border: 'none', cursor: 'pointer', mb: 3, px: 0, '&:hover': { color: C.ink1 } }}
          >
            ← back to catalog
          </Box>
          <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.625rem', color: C.ink3, letterSpacing: '0.08em', textTransform: 'uppercase', mb: 1.5 }}>
            Run complete · url_shortener
          </Box>
          <Box sx={{ fontSize: { xs: '1.75rem', sm: '2.5rem' }, fontWeight: 500, color: C.ink1, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
            You diagnosed thundering herd.<br />
            <Box component="span" sx={{ color: C.ink3 }}>3 of 4 tiers cleared in 6:18.</Box>
          </Box>
        </Box>

        {/* Before / After deltas */}
        <Box>
          <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.625rem', color: C.ink3, letterSpacing: '0.08em', textTransform: 'uppercase', mb: 2 }}>
            System health · before vs after
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 2 }}>
            {DELTAS.map(d => (
              <Box key={d.k} sx={{ bgcolor: C.bg1, border: `1px solid ${C.line1}`, borderRadius: 2, p: 2.5 }}>
                <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.625rem', color: C.ink3, letterSpacing: '0.06em', textTransform: 'uppercase', mb: 1.5 }}>{d.k}</Box>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.5 }}>
                  <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.875rem', color: C.crit, textDecoration: 'line-through', opacity: 0.6 }}>{d.before}</Box>
                  <Box sx={{ color: C.ink4, fontSize: '0.75rem' }}>→</Box>
                </Box>
                <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '1.5rem', fontWeight: 500, color: C.ok }}>{d.after}</Box>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Tier ladder + Concepts touched */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.4fr 1fr' }, gap: 3 }}>
          {/* Tier ladder */}
          <Box sx={{ bgcolor: C.bg1, border: `1px solid ${C.line1}`, borderRadius: 2, p: 3 }}>
            <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.625rem', color: C.ink3, letterSpacing: '0.08em', textTransform: 'uppercase', mb: 3 }}>Tier ladder</Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              {TIERS.map(tier => (
                <Box key={tier.t} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                  <Box sx={{
                    width: 40, height: 40, borderRadius: 1, border: `1px solid ${tier.done ? C.ok + '55' : C.line2}`,
                    bgcolor: tier.done ? C.okSoft : C.bg2,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem', fontWeight: 500,
                    color: tier.done ? C.ok : C.ink4,
                    flexShrink: 0,
                  }}>
                    {tier.t}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2 }}>
                      <Box sx={{ fontWeight: 500, color: tier.done ? C.ink1 : C.ink3, fontSize: '0.9375rem' }}>{tier.name}</Box>
                      <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem', color: C.ink4, whiteSpace: 'nowrap' }}>{tier.at}</Box>
                    </Box>
                    <Box sx={{ fontSize: '0.8125rem', color: C.ink3, mt: 0.25, lineHeight: 1.5 }}>{tier.sub}</Box>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Concepts */}
          <Box sx={{ bgcolor: C.bg1, border: `1px solid ${C.line1}`, borderRadius: 2, p: 3 }}>
            <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.625rem', color: C.ink3, letterSpacing: '0.08em', textTransform: 'uppercase', mb: 3 }}>Concepts touched</Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {CONCEPTS.map(c => (
                <Box key={c.name} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, borderBottom: `1px solid ${C.line1}`, '&:last-child': { borderBottom: 'none' } }}>
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: c.ok ? C.ok : C.line2, flexShrink: 0 }} />
                  <Box sx={{ flex: 1, fontSize: '0.875rem', color: c.ok ? C.ink1 : C.ink3 }}>{c.name}</Box>
                  <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem', color: C.ink4 }}>{c.at}</Box>
                </Box>
              ))}
            </Box>
            <Box sx={{ mt: 3, pt: 2.5, borderTop: `1px solid ${C.line1}`, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, textAlign: 'center' }}>
              {[['12', 'tutor turns'], ['3', 'fixes applied'], ['$0.34', 'opus cost']].map(([v, l]) => (
                <Box key={l}>
                  <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '1.25rem', fontWeight: 500, color: C.ink1 }}>{v}</Box>
                  <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5625rem', color: C.ink3, letterSpacing: '0.06em', textTransform: 'uppercase', mt: 0.25 }}>{l}</Box>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        {/* Next up */}
        <Box>
          <Box sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.625rem', color: C.ink3, letterSpacing: '0.08em', textTransform: 'uppercase', mb: 2 }}>
            Next up · adjacent concepts
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 2 }}>
            {NEXT.map(n => (
              <Box
                key={n.title}
                component="button"
                onClick={onBack}
                sx={{
                  textAlign: 'left',
                  bgcolor: C.bg1,
                  border: `1px solid ${C.line1}`,
                  borderRadius: 2,
                  p: 2.5,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
                  '&:hover': { bgcolor: C.bg2, borderColor: C.accentLine },
                }}
              >
                <Box sx={{ fontSize: '0.9375rem', fontWeight: 500, color: C.ink1, mb: 0.75 }}>{n.title}</Box>
                <Box sx={{ fontSize: '0.8125rem', color: C.ink3, lineHeight: 1.55 }}>{n.desc}</Box>
              </Box>
            ))}
          </Box>
        </Box>

      </Box>
    </Box>
  )
}
