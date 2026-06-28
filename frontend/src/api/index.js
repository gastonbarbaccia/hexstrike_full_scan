const BASE = '/api'

function getToken() {
  return localStorage.getItem('hs-token') || ''
}

async function req(method, path, body) {
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  const token = getToken()
  if (token && token !== 'no-auth') headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    localStorage.removeItem('hs-token')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  dashboard: () => req('GET', '/dashboard'),

  auth: {
    config: () => req('GET', '/auth/config'),
    login: (data) => req('POST', '/auth/login', data),
    me: () => req('GET', '/auth/me'),
  },

  targets: {
    list: () => req('GET', '/targets'),
    create: (data) => req('POST', '/targets', data),
    get: (id) => req('GET', `/targets/${id}`),
    update: (id, data) => req('PUT', `/targets/${id}`, data),
    delete: (id) => req('DELETE', `/targets/${id}`),
    listEnvironments: (targetId) => req('GET', `/targets/${targetId}/environments`),
    createEnvironment: (targetId, data) => req('POST', `/targets/${targetId}/environments`, data),
    deleteEnvironment: (targetId, envId) => req('DELETE', `/targets/${targetId}/environments/${envId}`),
  },

  scans: {
    list: () => req('GET', '/scans'),
    start: (data) => req('POST', '/scans', data),
    get: (id) => req('GET', `/scans/${id}`),
    cancel: (id) => req('POST', `/scans/${id}/cancel`),
    delete: (id) => req('DELETE', `/scans/${id}`),
    findings: (id) => req('GET', `/scans/${id}/findings`),
    updateFinding: (scanId, findingId, data) => req('PATCH', `/scans/${scanId}/findings/${findingId}`, data),
    stream: (id) => {
      const token = getToken()
      const url = token && token !== 'no-auth'
        ? `${BASE}/scans/${id}/stream?token=${encodeURIComponent(token)}`
        : `${BASE}/scans/${id}/stream`
      return new EventSource(url)
    },
  },

  scheduled: {
    list: () => req('GET', '/scheduled'),
    create: (data) => req('POST', '/scheduled', data),
    update: (id, data) => req('PATCH', `/scheduled/${id}`, data),
    delete: (id) => req('DELETE', `/scheduled/${id}`),
  },

  settings: {
    get: () => req('GET', '/settings'),
    update: (data) => req('PATCH', '/settings', data),
  },

  users: {
    list: () => req('GET', '/users'),
    create: (data) => req('POST', '/users', data),
    update: (id, data) => req('PUT', `/users/${id}`, data),
    delete: (id) => req('DELETE', `/users/${id}`),
  },

  sla: {
    get: () => req('GET', '/sla'),
    update: (data) => req('PATCH', '/sla', data),
  },

  support: {
    list: () => req('GET', '/support'),
    create: (data) => req('POST', '/support', data),
    get: (id) => req('GET', `/support/${id}`),
    updateStatus: (id, status) => req('PATCH', `/support/${id}/status`, { status }),
    listComments: (id) => req('GET', `/support/${id}/comments`),
    addComment: (id, body, attachments = []) => req('POST', `/support/${id}/comments`, { body, attachments }),
    sync: (id) => req('POST', `/support/${id}/sync`),
    jiraStatus: () => req('GET', '/support/jira/status'),
    uploadFile: async (file) => {
      const formData = new FormData()
      formData.append('file', file)
      const headers = {}
      const token = getToken()
      if (token && token !== 'no-auth') headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`${BASE}/support/upload`, { method: 'POST', headers, body: formData })
      if (res.status === 401) { throw new Error('No autorizado — iniciá sesión nuevamente') }
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || `HTTP ${res.status}`) }
      return res.json()
    },
  },

  vulnerabilities: {
    list: () => req('GET', '/vulnerabilities'),
    update: (findingId, data) => req('PATCH', `/vulnerabilities/${findingId}`, data),
    listComments: (findingId) => req('GET', `/vulnerabilities/${findingId}/comments`),
    createComment: (findingId, data) => req('POST', `/vulnerabilities/${findingId}/comments`, data),
    updateComment: (findingId, commentId, data) => req('PATCH', `/vulnerabilities/${findingId}/comments/${commentId}`, data),
    deleteComment: (findingId, commentId) => req('DELETE', `/vulnerabilities/${findingId}/comments/${commentId}`),
    listActivity: (findingId) => req('GET', `/vulnerabilities/${findingId}/activity`),
    uploadFile: async (file) => {
      const formData = new FormData()
      formData.append('file', file)
      const headers = {}
      const token = getToken()
      if (token && token !== 'no-auth') headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`${BASE}/vulnerabilities/uploads`, { method: 'POST', headers, body: formData })
      if (res.status === 401) { throw new Error('No autorizado — iniciá sesión nuevamente') }
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || `HTTP ${res.status}`) }
      return res.json()
    },
  },
}
