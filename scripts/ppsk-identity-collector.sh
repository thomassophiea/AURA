#!/usr/bin/env bash
#
# ppsk-identity-collector.sh — the out-of-band half of the PPSK identity bridge.
#
# ⚠ FRAGILE / LAB-GRADE. Campus OS does not report which PPSK key a client used,
# so AURA's Clients "Username" is blank for PPSK clients. This scrapes the
# MAC -> keyid mapping straight from the APs' hostapd and posts it to AURA's
# /api/v1/ppsk/observed, which the Clients view overlays onto Username.
#
# The clean, permanent fix is the controller reporting the keyid into the
# station userName (see docs/PPSK.md). This script is the stopgap: it depends on
# debug-level hostapd logging enabled per-AP, does not survive a controller
# re-sync or AP reboot, and holds AP SSH creds only in the operator's shell —
# never in AURA.
#
# Usage:
#   Enable keyid capture on the APs (invasive: patches r_hostapd, restarts it):
#     ppsk-identity-collector.sh --enable  --aps 192.168.100.128,192.168.100.142 --ap-pass '<pw>'
#   Poll once and post to AURA:
#     ppsk-identity-collector.sh --aura https://integration.up.railway.app \
#       --token "$TOK" --controller https://tsophiea.ddns.net:443 \
#       --aps 192.168.100.128,192.168.100.142 --ap-pass '<pw>'
#   Loop every 20s:  add  --interval 20
set -euo pipefail

APS=""; AP_PASS=""; AURA=""; TOKEN=""; CTRL=""; INTERVAL=0; ENABLE=0
while [ $# -gt 0 ]; do case "$1" in
  --aps) APS="$2"; shift 2;;
  --ap-pass) AP_PASS="$2"; shift 2;;
  --aura) AURA="$2"; shift 2;;
  --token) TOKEN="$2"; shift 2;;
  --controller) CTRL="$2"; shift 2;;
  --interval) INTERVAL="$2"; shift 2;;
  --enable) ENABLE=1; shift;;
  *) echo "unknown arg: $1" >&2; exit 2;;
esac; done
[ -n "$APS" ] && [ -n "$AP_PASS" ] || { echo "need --aps and --ap-pass" >&2; exit 2; }

SSH() { sshpass -p "$AP_PASS" ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  -o PubkeyAuthentication=no -o PreferredAuthentications=password,keyboard-interactive \
  -o ConnectTimeout=12 "admin@$1" "$2" 2>/dev/null; }

# Turn on debug-level hostapd logging + tee for the Skynet_PPSK radios. This is
# the invasive part — it edits the on-AP supervisor and restarts hostapd.
enable_capture() {
  local ap="$1"
  echo "[enable] $ap — patching r_hostapd for -dd + keyid tee (restarts hostapd)"
  SSH "$ap" '
    cp -n /usr/sbin/r_hostapd /tmp/r_hostapd.bak 2>/dev/null
    grep -q "tee -a /tmp/hapd_keyid" /usr/sbin/r_hostapd || \
      sed -i "s#hostapd -t -g#hostapd -dd -t -g#; s#| logger -t hostapd\$1#| tee -a /tmp/hapd_keyid_\$1.log | logger -t hostapd\$1#" /usr/sbin/r_hostapd
    # radios carrying Skynet_PPSK
    for f in $(grep -l "ssid=Skynet_PPSK" /tmp/seccfg_*.cfg 2>/dev/null); do
      r=$(echo "$f" | sed -E "s#.*seccfg_0([0-9])_.*#\1#")
      rm -f /tmp/hapd_keyid_$r.log
      P=$(ps w | grep "hostapd -t -g /tmp/hostapd_cmd$r" | grep -v grep | awk "{print \$1}" | head -1)
      W=$(ps w | grep "r_hostapd $r " | grep -v grep | awk "{print \$1}" | head -1)
      [ -n "$W" ] && kill "$W" 2>/dev/null
      [ -n "$P" ] && kill "$P" 2>/dev/null
      sleep 3
      setsid sh -c ". /etc/environ 2>/dev/null; /usr/sbin/r_hostapd $r /tmp/hostapd_cmd 15 >/dev/null 2>&1 &"
    done
    sleep 8; echo "  $(ls /tmp/hapd_keyid_*.log 2>/dev/null | wc -l) capture logs armed"'
}

# Scrape the latest MAC -> keyid per AP from the debug logs.
collect_ap() {
  local ap="$1"
  SSH "$ap" '
    for L in /tmp/hapd_keyid_*.log; do [ -f "$L" ] || continue
      # last keyid seen per MAC
      grep -iE "AP-STA-CONNECTED [0-9a-f:]+ keyid=" "$L" 2>/dev/null \
        | sed -E "s/.*AP-STA-CONNECTED ([0-9a-fA-F:]+) keyid=([^ ]+).*/\1 \2/"
    done' | awk -v ap="$ap" '{ m[$1]=$2 } END { for (k in m) print k, m[k], ap }'
}

post_to_aura() {
  # build JSON {observations:[{mac,keyid,ssid,apName}]} from stdin "mac keyid ap"
  local json; json=$(awk 'BEGIN{printf "{\"observations\":["} {if(NR>1)printf ","; printf "{\"mac\":\"%s\",\"keyid\":\"%s\",\"ssid\":\"Skynet_PPSK\",\"apName\":\"%s\"}", $1,$2,$3} END{printf "]}"}')
  [ "$json" = '{"observations":[]}' ] && { echo "  (no mappings yet)"; return; }
  curl -s --max-time 20 -X POST "$AURA/api/v1/ppsk/observed" \
    -H "Authorization: Bearer $TOKEN" -H "X-Controller-URL: $CTRL" \
    -H 'Content-Type: application/json' -d "$json" -w " [%{http_code}]\n"
}

if [ "$ENABLE" = 1 ]; then
  IFS=','; for ap in $APS; do enable_capture "$ap"; done; unset IFS
  echo "[enable] done. Now run without --enable to poll."; exit 0
fi
[ -n "$AURA" ] && [ -n "$TOKEN" ] || { echo "polling needs --aura and --token" >&2; exit 2; }

poll_once() {
  local all=""; IFS=','; for ap in $APS; do all="$all$(collect_ap "$ap")
"; done; unset IFS
  echo "$all" | grep -E '.' | sort -u | { echo "  posting:"; tee /dev/stderr | post_to_aura; }
}

if [ "$INTERVAL" -gt 0 ]; then
  echo "[collector] polling every ${INTERVAL}s (Ctrl-C to stop)"
  while true; do poll_once; sleep "$INTERVAL"; done
else
  poll_once
fi
