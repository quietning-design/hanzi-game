import { defineConfig } from 'vite';

// 使用相对路径 base: './'，完美兼容 GitHub Pages 子路径部署（如 https://username.github.io/repo-name/）与本地预览
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      srcDir: 'public',
      manifest: true,
      registerType: 'autoUpdate',
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https?.*supabase.*$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 86400 },
            },
          },
        ],
      },
    }),
  ],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
