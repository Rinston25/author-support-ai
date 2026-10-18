export function useAuth() {
  // 8 hours matches the JWT lifetime on the server
  const token = useCookie('bl_token', { maxAge: 60 * 60 * 8, sameSite: 'lax' })
  const user = useState('auth-user', () => null)
  const { api } = useApi()

  async function login(email, password) {
    const result = await api('/auth/login', { method: 'POST', body: { email, password } })
    token.value = result.token
    user.value = result.user
    return result.user
  }

  function logout() {
    token.value = null
    user.value = null
    return navigateTo('/login')
  }

  // On a page refresh the cookie survives but the in-memory user does not
  async function loadUser() {
    if (!token.value) return null
    if (user.value) return user.value
    try {
      user.value = (await api('/auth/me')).user
    } catch {
      token.value = null
    }
    return user.value
  }

  const isAdmin = computed(() => user.value?.role === 'admin')
  const homePath = computed(() => (isAdmin.value ? '/admin/tickets' : '/author/books'))

  return { token, user, isAdmin, homePath, login, logout, loadUser }
}
