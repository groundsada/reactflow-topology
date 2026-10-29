import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  base: '/reactflow-topology/',
  build: { outDir: 'docs', emptyOutDir: true },
})
