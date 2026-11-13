type Action = 'save' | 'delete';

function unconfirmed(action: Action): string {
  return `Could not confirm the ${action}. Check the Google Sheet before retrying to avoid ${action === 'save' ? 'a duplicate' : 'repeating the deletion'}.`;
}

export async function placeRequest<T>(url: string, body: object, action: Action): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`${unconfirmed(action)} (NETWORK_ERROR)`);
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const details = data as { error?: unknown; code?: unknown; requestId?: unknown } | null;
    const code = typeof details?.code === 'string' && /^[A-Z][A-Z0-9_]+$/.test(details.code)
      ? details.code
      : `HTTP_${response.status}`;
    const reference = typeof details?.requestId === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(details.requestId)
      ? `; ref ${details.requestId}`
      : '';
    const fallback = response.status === 401
      ? 'Please sign in again.'
      : response.status === 403
        ? 'Sign in with the admin password to make changes.'
        : unconfirmed(action);
    const message = typeof details?.error === 'string' ? details.error : fallback;
    throw new Error(`${message} (${code}; HTTP ${response.status}${reference})`);
  }

  const validResult = data && typeof data === 'object' && !Array.isArray(data)
    && (action === 'save'
      ? 'id' in data && typeof data.id === 'string' && 'name' in data && typeof data.name === 'string'
      : 'ok' in data && data.ok === true);
  if (!validResult) {
    throw new Error(`${unconfirmed(action)} (INVALID_SERVER_RESPONSE; HTTP ${response.status})`);
  }
  return data as T;
}
