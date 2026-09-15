// Em produção (servido pelo próprio Express), usa caminhos relativos.
// Em dev, usa NEXT_PUBLIC_API_URL ou localhost:3000.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
}

export async function api(path: string, options: RequestInit = {}): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Request failed with status ${res.status}`);
  }

  const json = await res.json();
  // Backend retorna { success, data, error, message }
  // Desempacota o `data` automaticamente para o caller não precisar acessar res.data
  if (json && typeof json === 'object' && 'success' in json) {
    if (json.success === false) {
      throw new Error(json.error || json.message || 'Erro desconhecido');
    }
    return json.data ?? json;
  }
  return json;
}

export function register(data: { email: string; password: string; name?: string; timezone?: string }) {
  return api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function login(data: { email: string; password: string }): Promise<{ access_token: string; refresh_token: string; user: any }> {
  return api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getMe() {
  return api('/api/auth/me');
}

export function connectWhatsapp() {
  return api('/api/whatsapp/connect', { method: 'POST' });
}

export function getWhatsappStatus() {
  return api('/api/whatsapp/status');
}

export function getGroups() {
  return api('/api/whatsapp/groups');
}

export function updateGroup(groupId: string, data: { is_monitored?: boolean; is_excluded?: boolean }) {
  return api(`/api/whatsapp/groups/${groupId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function getDigests() {
  return api('/api/digests');
}

export function getDigest(id: string) {
  return api(`/api/digests/${id}`);
}

export function generateManualDigest(data: { period_hours: number; format: string; channels: string[] }) {
  return api('/api/digests/manual', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateSchedule(data: {
  cron_expression?: string
  delivery_channels?: string[]
  report_format?: string
  is_active?: boolean
}) {
  return api('/api/digests/schedule/config', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function getSchedule() {
  return api('/api/digests/schedule/config');
}

export function getKeywords() {
  return api('/api/digests/keywords/list');
}

export function addKeyword(data: { word: string; type: string }) {
  return api('/api/digests/keywords', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteKeyword(id: string) {
  return api(`/api/digests/keywords/${id}`, {
    method: 'DELETE',
  });
}

export function getMessages(opts: {
  groupId?: string
  limit?: number
  offset?: number
  minUrgency?: number
  onlyMentions?: boolean
} = {}) {
  const params = new URLSearchParams()
  if (opts.groupId) params.set('group_id', opts.groupId)
  if (opts.limit) params.set('limit', String(opts.limit))
  if (opts.offset) params.set('offset', String(opts.offset))
  if (opts.minUrgency) params.set('min_urgency', String(opts.minUrgency))
  if (opts.onlyMentions) params.set('only_mentions', 'true')
  const qs = params.toString()
  return api(`/api/whatsapp/messages${qs ? '?' + qs : ''}`);
}

export function syncWhatsapp() {
  return api('/api/whatsapp/sync', { method: 'POST' });
}
