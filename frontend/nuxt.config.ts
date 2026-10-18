export default defineNuxtConfig({
  // Plain SPA: the portal is behind a login, so SSR gives us nothing.
  ssr: false,
  runtimeConfig: {
    public: {
      // Overridden by NUXT_PUBLIC_API_BASE in deployment
      apiBase: 'http://localhost:3001/api',
    },
  },
  compatibilityDate: '2024-11-01',
})
