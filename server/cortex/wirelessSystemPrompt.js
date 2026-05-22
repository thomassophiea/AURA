const WIRELESS_SYSTEM_PROMPT = `You are Cortex, a wireless AI copilot for AURA and Campus Controller. You are not a generic chatbot. You diagnose wireless issues using live API evidence only. Never invent metrics. Never invent API results. If evidence is missing, say what is missing.

Your answer MUST follow this exact format:

Short answer:
{one sentence}

What I found:
- Client: {client summary or N/A}
- AP: {AP summary or N/A}
- WLAN: {WLAN summary or N/A}
- Site: {site summary or N/A}
- Time window: {time window}
- Key events: {key events or none}
- RF indicators: {RF indicators or none}
- AP indicators: {AP indicators or none}
- WLAN/auth indicators: {WLAN/auth indicators or none}

Likely root cause:
{explanation based ONLY on evidence provided}

Confidence:
{High / Medium / Low — use the value provided}

Recommended next actions:
1. {action}
2. {action}
3. {action}

Do not add sections outside this format. Do not invent data not present in the evidence.`;

function evidenceToText(evidence) {
  const lines = ['## Live Evidence Collected'];

  if (evidence.client && Object.keys(evidence.client).some(k => evidence.client[k] != null)) {
    lines.push('\n### Client');
    for (const [k, v] of Object.entries(evidence.client)) {
      if (v !== undefined && v !== null) lines.push(`- ${k}: ${v}`);
    }
  }

  if (evidence.ap && Object.keys(evidence.ap).some(k => evidence.ap[k] != null)) {
    lines.push('\n### AP');
    for (const [k, v] of Object.entries(evidence.ap)) {
      if (v !== undefined && v !== null) lines.push(`- ${k}: ${v}`);
    }
  }

  if (evidence.wlan) {
    lines.push('\n### WLAN');
    for (const [k, v] of Object.entries(evidence.wlan)) {
      if (v !== undefined && v !== null) lines.push(`- ${k}: ${v}`);
    }
  }

  if (evidence.site) {
    lines.push('\n### Site');
    for (const [k, v] of Object.entries(evidence.site)) {
      if (v !== undefined && v !== null) lines.push(`- ${k}: ${v}`);
    }
  }

  if (evidence.events?.length) {
    lines.push('\n### Station Events (most recent first)');
    for (const e of evidence.events.slice(0, 10)) {
      lines.push(`- [${e.timestamp}] ${e.type}: ${e.description}`);
    }
  }

  if (evidence.smartRf) {
    lines.push('\n### Smart RF');
    lines.push(`- Channel changes: ${evidence.smartRf.channelChanges}`);
    lines.push(`- Power changes: ${evidence.smartRf.powerChanges}`);
    lines.push(`- DFS events: ${evidence.smartRf.dfsEvents}`);
  }

  if (evidence.auditLogs?.length) {
    lines.push('\n### Recent Config Changes');
    for (const l of evidence.auditLogs.slice(0, 5)) {
      lines.push(`- [${l.timestamp}] ${l.user}: ${l.change}`);
    }
  }

  if (evidence.missingData?.length) {
    lines.push('\n### Missing Data (APIs that returned no results)');
    for (const m of evidence.missingData) lines.push(`- ${m}`);
  }

  return lines.join('\n');
}

export function buildWirelessPrompt({ question, pageContext, evidence, rootCause, confidence }) {
  const systemContent = [
    WIRELESS_SYSTEM_PROMPT,
    '',
    evidenceToText(evidence),
    '',
    '## Deterministic Analysis',
    `Root cause category: ${rootCause.category}`,
    `Root cause explanation: ${rootCause.explanation}`,
    `Confidence: ${confidence}`,
    '',
    'Use ONLY the evidence above. Do not invent data. The confidence level is determined — use it exactly as provided.',
  ].join('\n');

  return {
    systemMsg: { role: 'system', content: systemContent },
    userMsg: { role: 'user', content: question },
  };
}
