# Ollama on the redq Linux Box — Setup Runbook

**Target host:** `redq@192.168.100.177`
**Goal:** Run Ollama as a LAN-exposed service so the AURA server (or your laptop) can pick local models via the multi-provider picker.

---

## 1. SSH in

```bash
ssh redq@192.168.100.177   # password: Annabelladmin7 (lowercase user!)
```

## 2. Install Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

This drops the `ollama` binary in `/usr/local/bin/ollama` and registers a `systemd` service named `ollama.service`.

## 3. Expose on the LAN (not just localhost)

By default the daemon binds `127.0.0.1:11434`. Make it listen on all interfaces so the AURA proxy can reach it from this Mac.

```bash
sudo systemctl edit ollama.service
```

Add (paste these lines into the override file the editor opens):

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_ORIGINS=*"
```

Reload + restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama.service
sudo systemctl status ollama.service --no-pager   # should show "active (running)"
```

## 4. Pull starter models

Pick whichever you want — these are the cheapest/most-capable mix for a 16–32 GB box. Each `ollama pull` downloads once and reuses for every chat.

```bash
ollama pull llama3.2          # ~2 GB, fast general-purpose
ollama pull qwen2.5:7b        # ~4.7 GB, strong reasoning for size
ollama pull deepseek-r1:7b    # ~4.7 GB, chain-of-thought reasoner
ollama pull mistral           # ~4.1 GB, classic instruct model
ollama pull phi4              # ~9 GB, Microsoft small-but-mighty
```

Verify they're registered:

```bash
ollama list
curl -s http://192.168.100.177:11434/api/tags | jq '.models[].name'
```

## 5. Tell AURA about it

From this Mac, in the AURA repo, set the env vars before `npm run start` (or add them to your Railway service):

```bash
export OLLAMA_ENABLED=true
export OLLAMA_API_BASE=http://192.168.100.177:11434/v1
```

Then start AURA:

```bash
npm run start
```

Open the model picker — you should see an **Ollama (local)** group with each tag you pulled. Pick one and chat normally; requests route to `192.168.100.177` over the LAN.

## 6. Sanity test from this Mac

```bash
curl -s http://192.168.100.177:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"llama3.2","messages":[{"role":"user","content":"hello"}]}' | jq '.choices[0].message.content'
```

If you get a reply, the wire-up is good.

## 7. Firewall note

If you ever can't reach `:11434` from the Mac:

```bash
# on redq:
sudo ufw status                # ufw not be installed; ignore if "command not found"
sudo iptables -L -n | grep 11434
```

The default Pop!_OS/Ubuntu install does not block port 11434 on a LAN interface. Only worry about this if you've hardened the box.

---

## Troubleshooting

- **`/api/tags` returns 404 or hangs** → daemon not listening on `0.0.0.0`. Re-check step 3 and `systemctl status`.
- **Picker shows no Ollama group** → AURA can't reach the URL within 1500 ms (discovery timeout). Verify the curl in step 6 succeeds from this Mac.
- **Model is slow / OOM** → check `ollama ps` to see what's loaded; unload with `ollama stop <model>`. The 7B-class models are the sweet spot for a typical dev box; 70B local needs a serious GPU.
- **GPU not used** → `ollama ps` shows `100% CPU`. On Linux without an NVIDIA GPU + CUDA installed, Ollama runs CPU-only; this is expected on the redq box unless you have a card in it.
