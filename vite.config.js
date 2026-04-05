import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  assetsInclude: ['**/*.glsl'],
  server: {
    port: 5173,
  },
})
