export default defineNuxtConfig({
  // Plain SPA: every page is behind a login, so server rendering gives us nothing.
  ssr: false,
  compatibilityDate: '2024-11-01',
  css: ['~/assets/main.css'],
  runtimeConfig: {
    public: {
      // Overridden at build time by NUXT_PUBLIC_API_BASE
      apiBase: 'http://localhost:3001/api',
    },
  },
  app: {
    head: {
      title: 'BookLeaf Support',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },
  devtools: { enabled: false },
})
