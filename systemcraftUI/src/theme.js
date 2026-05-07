import { createTheme } from '@mui/material/styles'

export const C = {
  bg0: '#161922',
  bg1: '#1c1f2e',
  bg2: '#222639',
  bg3: '#282d40',
  line1: '#262b3d',
  line2: '#303650',
  line3: '#3d4459',
  ink1: '#f0f2f8',
  ink2: '#c0c8dc',
  ink3: '#7c87a4',
  ink4: '#4a5270',
  accent: '#60a5fa',
  accentSoft: 'rgba(96,165,250,0.10)',
  accentLine: 'rgba(96,165,250,0.28)',
  ok: '#34d399',
  okSoft: 'rgba(52,211,153,0.10)',
  warn: '#fbbf24',
  warnSoft: 'rgba(251,191,36,0.10)',
  crit: '#f87171',
  critSoft: 'rgba(248,113,113,0.10)',
}

export default createTheme({
  palette: {
    mode: 'dark',
    background: { default: C.bg0, paper: C.bg1 },
    primary: { main: C.accent },
    error: { main: C.crit },
    warning: { main: C.warn },
    success: { main: C.ok },
    divider: C.line1,
    text: { primary: C.ink1, secondary: C.ink2, disabled: C.ink3 },
  },
  typography: {
    fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
    fontSize: 13,
    h1: { fontSize: '2.5rem', fontWeight: 500, letterSpacing: '-0.02em' },
    h2: { fontSize: '1.5rem', fontWeight: 500, letterSpacing: '-0.015em' },
    h3: { fontSize: '1.1rem', fontWeight: 500 },
    body1: { fontSize: '0.875rem', lineHeight: 1.65 },
    body2: { fontSize: '0.8125rem', lineHeight: 1.55 },
    caption: {
      fontSize: '0.6875rem',
      fontFamily: '"JetBrains Mono", monospace',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
    },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        'html, body, #root': { height: '100%' },
        body: { background: C.bg0, color: C.ink1, overflowX: 'hidden' },
        '#root': { display: 'flex', flexDirection: 'column' },
        '::-webkit-scrollbar': { width: 6, height: 6 },
        '::-webkit-scrollbar-track': { background: 'transparent' },
        '::-webkit-scrollbar-thumb': { background: C.line2, borderRadius: 3 },
        '::-webkit-scrollbar-thumb:hover': { background: C.line3 },
        /* react-grid-layout resize handle */
        '.react-resizable-handle': {
          position: 'absolute',
          zIndex: 10,
        },
        '.react-resizable-handle-se': {
          bottom: 0,
          right: 0,
          width: 18,
          height: 18,
          cursor: 'se-resize',
          backgroundImage: 'none',
          '&::after': {
            content: '""',
            position: 'absolute',
            right: 4,
            bottom: 4,
            width: 9,
            height: 9,
            borderRight: '2px solid #4a5270',
            borderBottom: '2px solid #4a5270',
            borderRadius: '0 0 2px 0',
            transition: 'border-color 0.15s',
          },
          '&:hover::after': {
            borderColor: '#60a5fa',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: 'none' } },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.6875rem',
          letterSpacing: '0.04em',
          fontWeight: 500,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.6875rem',
          height: 22,
          borderRadius: 4,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.75rem',
          letterSpacing: '0.04em',
          minHeight: 40,
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: { height: 2 },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.6875rem',
          background: C.bg3,
          border: `1px solid ${C.line2}`,
        },
      },
    },
  },
})
