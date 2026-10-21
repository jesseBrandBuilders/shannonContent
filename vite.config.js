import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Vite only exposes VITE_* vars to the browser, but Vercel's Supabase
// integration injects NEXT_PUBLIC_SUPABASE_* / SUPABASE_* names. Accept
// either, so the app works with the integration or hand-set VITE_ vars.
// Only the public URL and anon/publishable key are read here — never the
// service-role key.
function supabaseEnv(env) {
  const first = (...keys) => keys.map((k) => env[k]).find(Boolean) || '';
  return {
    url: first('VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'),
    anonKey: first(
      'VITE_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_ANON_KEY',
      'VITE_SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_PUBLISHABLE_KEY'
    )
  };
}

export default defineConfig(({ mode }) => {
  const { url, anonKey } = supabaseEnv(loadEnv(mode, process.cwd(), ''));

  return {
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(anonKey)
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'icons/*.png'],
        manifest: {
          name: 'Shannon Content Studio',
          short_name: 'Content Studio',
          description: 'LinkedIn content management for EOS Implementers',
          theme_color: '#1e1b4b',
          background_color: '#fafaf9',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          navigateFallbackDenylist: [/^\/preview\.html$/]
        }
      })
    ],
    server: { port: 5173 }
  };
});
