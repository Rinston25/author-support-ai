// Runs before every page: guests go to /login, and each role stays in its own area.
export default defineNuxtRouteMiddleware(async (to) => {
  const { token, loadUser } = useAuth()
  const isLoginPage = to.path === '/login'

  if (!token.value) return isLoginPage ? undefined : navigateTo('/login')

  const user = await loadUser()
  if (!user) return isLoginPage ? undefined : navigateTo('/login')

  const home = user.role === 'admin' ? '/admin/tickets' : '/author/books'
  if (isLoginPage || to.path === '/') return navigateTo(home)
  if (to.path.startsWith('/admin') && user.role !== 'admin') return navigateTo(home)
  if (to.path.startsWith('/author') && user.role !== 'author') return navigateTo(home)
})
