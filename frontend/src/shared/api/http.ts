const DEFAULT_API_BASE_URL = "http://127.0.0.1:9000/api/v1";

export async function httpGet<T>(path: string): Promise<T> {
  const response = await fetch(`${DEFAULT_API_BASE_URL}${path}`);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function httpPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${DEFAULT_API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function httpPostNoContent(path: string, body?: unknown): Promise<void> {
  const response = await fetch(`${DEFAULT_API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }
}

export async function httpPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${DEFAULT_API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function httpPatchNoContent(path: string, body: unknown): Promise<void> {
  const response = await fetch(`${DEFAULT_API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }
}

export async function httpDelete(path: string): Promise<void> {
  const response = await fetch(`${DEFAULT_API_BASE_URL}${path}`, { method: "DELETE" });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }
}

