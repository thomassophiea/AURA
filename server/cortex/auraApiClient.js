import https from 'node:https';

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

async function callOne(apiCall, { authToken, controllerUrl, fetchFn }) {
  const fn = fetchFn ?? globalThis.fetch;
  const url = `${controllerUrl}/management${apiCall.path}`;
  const init = {
    method: apiCall.method,
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
    throw new Error(`${resp.status} ${msg}`);
  }
  return resp.json();
}

export async function executeApiPlan(plan, opts) {
  const results = {};
  const missing = [];

  for (const apiCall of plan) {
    if (apiCall.disruptive) continue;
    try {
      results[apiCall.label] = await callOne(apiCall, opts);
    } catch (err) {
      console.warn(`[AuraApiClient] ${apiCall.method} ${apiCall.path} failed: ${err.message}`);
      missing.push(apiCall.label);
    }
  }

  if (missing.length) results.__missingData__ = missing;
  return results;
}

export async function executeDisruptiveCall(apiCall, opts) {
  return callOne(apiCall, opts);
}
