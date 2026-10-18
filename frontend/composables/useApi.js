// The error shape every API failure is turned into, so pages can show
// error.message and branch on error.code without knowing about HTTP.
export class ApiError extends Error {
  constructor(status, code, message, details = []) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export function useApi() {
  const config = useRuntimeConfig()
  const token = useCookie('bl_token')

  async function api(path, { method = 'GET', body, query } = {}) {
    try {
      return await $fetch(path, {
        baseURL: config.public.apiBase,
        method,
        query,
        // POSTs always send a JSON body (the API rejects an empty one)
        body: method !== 'GET' && body === undefined ? {} : body,
        headers: token.value ? { Authorization: `Bearer ${token.value}` } : {},
      })
    } catch (error) {
      const status = error.response?.status
      // An expired or invalid session: start over at the login page
      if (status === 401 && token.value) {
        token.value = null
        useState('auth-user').value = null
        await navigateTo('/login')
      }
      const apiError = error.data?.error
      throw new ApiError(
        status || 0,
        apiError?.code || (status ? 'REQUEST_FAILED' : 'NETWORK_ERROR'),
        apiError?.message || 'Could not reach the server. Please try again.',
        apiError?.details,
      )
    }
  }

  return { api }
}
