# Railway env wiring for the new multi-provider picker

**Date:** 2026-05-21
**Goal:** Make the Railway-deployed AURA backend see the same provider set as your local dev box.

---

## Step 1 — log in & link (one time)

```bash
railway login
cd /Volumes/redq/Documents/NobaraShare/GitHub/AURA
railway link            # pick the AURA service if multiple are listed
railway status          # confirm: project + environment + service show up
```

## Step 2 — set the env vars you actually want enabled

Set only the ones you have keys for. Each one makes its provider appear in the picker; skipping one just hides that provider.

```bash
# Cheap / free cloud providers
railway variables --set "GEMINI_API_KEY=YOUR_GEMINI_KEY"
railway variables --set "MISTRAL_API_KEY=YOUR_MISTRAL_KEY"
railway variables --set "CEREBRAS_API_KEY=YOUR_CEREBRAS_KEY"
railway variables --set "DEEPSEEK_API_KEY=YOUR_DEEPSEEK_KEY"

# Already-supported providers (if not already set)
# railway variables --set "ANTHROPIC_API_KEY=sk-ant-..."
# railway variables --set "GROQ_API_KEY=gsk_..."

# Ollama-from-Railway — ONLY if your redq box is reachable from Railway's
# public network. By default it isn't (192.168.x.x is RFC1918), so production
# Ollama needs either a Tailscale subnet router, a public DDNS entry with the
# port forwarded, or running Ollama on a Railway worker. Skip unless you've
# set one of those up.
# railway variables --set "OLLAMA_ENABLED=true"
# railway variables --set "OLLAMA_API_BASE=http://YOUR-PUBLIC-HOST:11434/v1"
```

## Step 3 — redeploy

Railway auto-redeploys when variables change, but to force a fresh deploy:

```bash
railway redeploy
```

## Step 4 — verify

```bash
railway run --service aura -- node -e "console.log({
  gemini: !!process.env.GEMINI_API_KEY,
  mistral: !!process.env.MISTRAL_API_KEY,
  cerebras: !!process.env.CEREBRAS_API_KEY,
  deepseek: !!process.env.DEEPSEEK_API_KEY,
  ollama: process.env.OLLAMA_ENABLED === 'true',
})"
```

Or hit the live endpoint and read the picker payload:

```bash
TOKEN="$(your-auth-flow)"  # however you grab a JWT
curl -s -H "Authorization: Bearer $TOKEN" https://YOUR-AURA.up.railway.app/api/cortex/models | jq '.providers, .models | length'
```

`.providers` should list every provider whose key you set; `.models | length` should jump by 2–3 per added provider.

---

## About Ollama from Railway

The local Ollama install on `redq@192.168.100.177` is great for your dev Mac on the same LAN, but Railway's container can't reach `192.168.100.177` directly. Two clean options if you want production to use redq's local models:

1. **Tailscale subnet router** — install Tailscale on redq + a Railway sidecar/init step that joins the tailnet. Lets the Railway service reach `100.x.x.x:11434` privately. ~10 min setup.
2. **DDNS + port forward** — point an A record at your home IP and forward `11434/tcp` on your router. Free but exposes Ollama to the public internet (Ollama has no auth — anyone who finds the port can use your GPU/CPU and pull arbitrary models).

For now I'd just skip the Ollama keys on Railway entirely. Cloud providers are what you want in production, and local Ollama is what you want for offline / private dev.
