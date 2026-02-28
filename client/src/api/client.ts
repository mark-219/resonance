const API_BASE = '/api';

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;

  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(response.status, body.error || response.statusText);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export { ApiError };
