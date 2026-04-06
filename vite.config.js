import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({

  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        tutorial: resolve(__dirname, 'tutorial.html')
      }
    }
  },

  base: './',
  assetsInclude: ['**/*.glsl'],
  server: {
    port: 5173,
  },
})
