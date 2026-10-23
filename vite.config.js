import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tests run in a US timezone so local-vs-UTC date bugs show up
process.env.TZ = 'America/New_York'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    // Edge Functions import Deno-style specifiers; map them to Node packages or stubs
    alias: [
      { find: /^jsr:@supabase\/functions-js\/edge-runtime\.d\.ts$/, replacement: '/tests/helpers/empty.js' },
      { find: /^jsr:@supabase\/supabase-js@2$/, replacement: '@supabase/supabase-js' },
      { find: /^npm:@anthropic-ai\/sdk@1$/, replacement: '/tests/helpers/denoStubs.js' },
      { find: /^npm:web-push@3\.6\.7$/, replacement: '/tests/helpers/webpushStub.js' },
    ],
    include: ['tests/**/*.test.{js,jsx,ts}'],
    env: {
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-test-key',
      VITE_VAPID_PUBLIC_KEY: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
      VITE_STRIPE_PRICE_ID: 'price_test',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}', 'api/**/*.js', 'supabase/functions/**/*.ts'],
      exclude: ['src/js/**', 'src/main.jsx'],
      reporter: ['text', 'html', 'json-summary'],
    },
  },
})
