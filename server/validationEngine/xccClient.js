import https from 'node:https';

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

export async function fetchXcc(path, { authToken, controllerUrl, fetchFn } = {}) {
  const fn = fetchFn ?? globalThis.fetch;
  const url = `${controllerUrl}/api/management${path}`;
  const init = {
    method: 'GET',
    headers: {
      Authorization: authToken ?? '',
      'Content-Type': 'application/json',
    },
  };
  if (!fetchFn && url.startsWith('https')) {
    init.agent = insecureAgent;
  }
  const resp = await fn(url, init);
  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`${resp.status} ${path}: ${msg}`);
  }
  return resp.json();
}
