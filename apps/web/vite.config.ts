import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../..', 'VITE_')
  // The shared root .env also configures Nest. Do not let its NODE_ENV force
  // React's development bundle during `vite build`.
  delete process.env.VITE_USER_NODE_ENV
  process.env.NODE_ENV = mode === 'production' ? 'production' : 'development'
  return {
    envDir: false,
    define: {
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(
        env.VITE_GOOGLE_CLIENT_ID ?? '',
      ),
    },
    plugins: [react()],
    server: {
      proxy: {
        '/api': 'http://localhost:3000',
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
  }
})
