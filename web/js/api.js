// Cliente de la API del hospital. Es el único módulo que hace fetch.

export async function getState() {
  return request("GET", "/api/state");
}

export async function getLocations() {
  return request("GET", "/api/locations");
}

async function request(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return data;
}
