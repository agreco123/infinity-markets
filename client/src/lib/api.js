const BASE = import.meta.env.VITE_API_URL || '';

async function request(path, opts = {}) {
    const token = localStorage.getItem('im_token');
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
    if (res.status === 401) {
          // Only redirect to login if user had an active session (token existed).
      // Without this check, unauthenticated calls (like auto-save) hijack navigation.
      if (token) {
              localStorage.removeItem('im_token');
              window.location.href = '/login';
      }
          throw new Error('Session expired');
    }
    if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `${res.status} ${res.statusText}`);
    }
    // Check if response is a file download
  const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/pdf') || ct.includes('spreadsheet') || ct.includes('presentation')) {
          return res.blob();
    }
    return res.json();
}

export const api = {
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
};
