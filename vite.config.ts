import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the same build works on a static host under any path
// and from the demo laptop with `npm run preview` (no network needed).
export default defineConfig({
  base: './',
  plugins: [react()],
  // Cloudflare quick tunnels get a fresh random subdomain each run, so allow
  // the whole domain (leading dot) for both `dev` and `preview`.
  server: { allowedHosts: ['.trycloudflare.com'] },
  preview: { allowedHosts: ['.trycloudflare.com'] },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
})
