#!/usr/bin/env bash
#
# ppsk-provision-lab.sh — apply an AURA-rendered wpa_psk_file to a lab AP and
# prove per-key identity on real hardware.
#
# ⚠ LAB ONLY. This is the concrete "apply out of band" path the PPSK UI names.
# It side-loads a second hostapd on a SPARE, controller-unused VAP so it never
# touches the live controller-managed BSSes. A controller re-sync will not touch
# the spare VAP, but this is NOT a production provisioning path — that requires
# the Campus OS controller enhancement in docs/PPSK_HARDWARE_FINDINGS.md.
#
# It exists because the mechanism was proven by hand on an AP5020 (fw 10.20.1):
# two keys on one WPA2-Personal SSID, identity from the key, revocation via
# reload. This makes that repeatable.
#
# Usage:
#   Provision:  ppsk-provision-lab.sh --ap 192.168.100.141 --pass Admin123 \
#                 --ssid Aura-PPSK-Lab --keyfile ./aura.psk [--iface wl0.4]
#   From AURA:  curl -s "$AURA/api/v1/ppsk/keyfile?ssid=Aura-PPSK-Lab" \
#                 -H "Authorization: Bearer $TOK" -H "X-Controller-URL: $CTRL" \
#                 | python3 -c 'import sys,json;print(json.load(sys.stdin)["content"])' \
#                 > aura.psk   # then pass --keyfile aura.psk
#   Teardown:   ppsk-provision-lab.sh --ap 192.168.100.141 --pass Admin123 --teardown
#
# Watch matches:  ssh admin@<ap> 'grep AP-STA-CONNECTED /tmp/aura_ppsk.log'
set -euo pipefail

AP=""; PW=""; SSID=""; KEYFILE=""; IFACE="wl0.4"; CHAN="1"; TEARDOWN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --ap) AP="$2"; shift 2;;
    --pass) PW="$2"; shift 2;;
    --ssid) SSID="$2"; shift 2;;
    --keyfile) KEYFILE="$2"; shift 2;;
    --iface) IFACE="$2"; shift 2;;
    --chan) CHAN="$2"; shift 2;;
    --teardown) TEARDOWN=1; shift;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done
[ -n "$AP" ] && [ -n "$PW" ] || { echo "need --ap and --pass" >&2; exit 2; }

# Multiplex all calls over ONE authenticated SSH session. Repeated fresh logins
# trip the AP's retry limiter ("Permission denied" even with the right password);
# a shared ControlMaster connection authenticates once and reuses the socket.
CTLSOCK="/tmp/.ppsk-ssh-$AP-$$"
SSH_OPTS=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null
  -o PubkeyAuthentication=no -o PreferredAuthentications=password,keyboard-interactive
  -o ConnectTimeout=12 -o ControlMaster=auto -o "ControlPath=$CTLSOCK" -o ControlPersist=30)
cleanup_ssh() { ssh -o "ControlPath=$CTLSOCK" -O exit "admin@$AP" 2>/dev/null || true; rm -f "$CTLSOCK"; }
trap cleanup_ssh EXIT
S() { sshpass -p "$PW" ssh "${SSH_OPTS[@]}" "admin@$AP" "$1"; }

if [ "$TEARDOWN" = 1 ]; then
  echo "[ppsk] tearing down on $AP/$IFACE"
  # Kill every aura_ppsk hostapd, wait for reaping, then recount so the report
  # reflects the settled state (an immediate count races the kill).
  S 'for p in $(ps w | grep "aura_ppsk.cfg" | grep -v grep | awk "{print \$1}"); do kill "$p" 2>/dev/null; done; sleep 1; for p in $(ps w | grep "aura_ppsk.cfg" | grep -v grep | awk "{print \$1}"); do kill -9 "$p" 2>/dev/null; done; sleep 1; wl -i '"$IFACE"' bss down 2>/dev/null; ifconfig '"$IFACE"' down 2>/dev/null; rm -f /tmp/aura_ppsk.cfg /tmp/aura_ppsk.psk /tmp/aura_ppsk.log; echo "  clean: $(ps w | grep aura_ppsk | grep -v grep | wc -l) procs, '"$IFACE"' bss=$(wl -i '"$IFACE"' bss 2>/dev/null), live radio '"${IFACE%.*}"'.0 sta=$(wl -i '"${IFACE%.*}"'.0 assoclist 2>/dev/null | wc -l)"'
  exit 0
fi

[ -n "$SSID" ] && [ -n "$KEYFILE" ] || { echo "provision needs --ssid and --keyfile" >&2; exit 2; }
[ -f "$KEYFILE" ] || { echo "no such keyfile: $KEYFILE" >&2; exit 2; }

# Guard: refuse a VAP the controller is actively using (must be a spare, down).
STATE=$(S "wl -i $IFACE bss 2>/dev/null" || true)
if [ "$STATE" != "down" ]; then
  echo "[ppsk] refusing: $IFACE is '$STATE', not a spare 'down' VAP. Pick an unused one (wl0.4–wl0.8)." >&2
  exit 3
fi

echo "[ppsk] pushing key file ($(grep -vc '^#' "$KEYFILE") keys) to $AP:$IFACE, SSID '$SSID'"
# Upload the AURA-rendered key file and a minimal hostapd config verbatim.
S "cat > /tmp/aura_ppsk.psk" < "$KEYFILE"
S "cat > /tmp/aura_ppsk.cfg" <<CFG
interface=$IFACE
driver=nl80211
ssid=$SSID
hw_mode=g
channel=$CHAN
ieee80211n=1
wmm_enabled=1
auth_algs=1
wpa=2
wpa_key_mgmt=WPA-PSK
wpa_pairwise=CCMP
rsn_pairwise=CCMP
wpa_psk_file=/tmp/aura_ppsk.psk
CFG

# Snapshot the shared radio so we can assert we didn't disturb the live BSSes.
RADIO="${IFACE%.*}.0"
PRE=$(S "echo isup=\$(wl -i $RADIO isup) sta=\$(wl -i $RADIO assoclist 2>/dev/null | wc -l)")
S 'setsid sh -c "hostapd -dd -t /tmp/aura_ppsk.cfg > /tmp/aura_ppsk.log 2>&1 &"'
sleep 4
S "wl -i $IFACE bss up 2>/dev/null" || true
sleep 1
POST=$(S "echo isup=\$(wl -i $RADIO isup) sta=\$(wl -i $RADIO assoclist 2>/dev/null | wc -l)")
UP=$(S "wl -i $IFACE isup 2>/dev/null"); BSSID=$(S "wl -i $IFACE bssid 2>/dev/null")

echo "[ppsk] live radio $RADIO before:[$PRE] after:[$POST]  (must be unchanged)"
echo "[ppsk] test BSS $IFACE isup=$UP bssid=$BSSID ssid='$SSID' chan=$CHAN"
echo "[ppsk] beaconing. Join with a key from the file; then read matches:"
echo "        ssh admin@$AP 'grep AP-STA-CONNECTED /tmp/aura_ppsk.log'"
echo "[ppsk] revoke a key: edit the file, re-push, then: ssh admin@$AP 'kill -HUP \$(pgrep -f aura_ppsk.cfg)'"
echo "[ppsk] when done: $0 --ap $AP --pass '<pw>' --teardown --iface $IFACE"
