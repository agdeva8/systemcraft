import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/systemcraft/',
  plugins: [react()],
  optimizeDeps: {
    include: ['@monaco-editor/react'],
  },
})
