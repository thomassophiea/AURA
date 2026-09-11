#!/usr/bin/env bash
# Install and start the lightguard ambient-light agent on one or more Extreme APs.
#
#   scripts/deploy-lightguard.sh <aura-url> <ap-ip> [<ap-ip> ...]
#   AP_PASSWORD=Admin123 scripts/deploy-lightguard.sh https://integration.up.railway.app 192.168.100.141
#
# Options via environment:
#   AP_USER            default admin
#   AP_PASSWORD        required (no key auth on stock APs)
#   LIGHT_SENSOR_TOKEN sent as X-Light-Token if the server requires one
#   LIGHTGUARD_INTERVAL seconds between reports (default 15)
#   ACTION             install (default) | stop | status
#
# The agent lives in /tmp, which the AP clears on reboot. That is deliberate for
# a POC: nothing persistent is installed on customer hardware, and a reboot is a
# clean uninstall. Re-run this script after an AP reboots.
#
# Verifies rather than assumes: after starting, it polls AURA's own
# /api/light-sensor/states and fails loudly if no reading from that AP arrives.

set -uo pipefail

AURA_URL="${1:?usage: deploy-lightguard.sh <aura-url> <ap-ip> [...]}"; shift
AP_USER="${AP_USER:-admin}"
AP_PASSWORD="${AP_PASSWORD:?AP_PASSWORD is required}"
ACTION="${ACTION:-install}"
INTERVAL="${LIGHTGUARD_INTERVAL:-15}"
TOKEN="${LIGHT_SENSOR_TOKEN:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT="$SCRIPT_DIR/lightguard.sh"

SSH_OPTS=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null
          -o PubkeyAuthentication=no -o PreferredAuthentications=password,keyboard-interactive
          -o ConnectTimeout=12 -o LogLevel=ERROR)

# APs rate-limit repeated logins: several in quick succession start returning
# "Permission denied" even with the correct password. Pace every call.
AP_SSH_PACE_SECONDS="${AP_SSH_PACE_SECONDS:-3}"
ap() {
  sleep "$AP_SSH_PACE_SECONDS"
  sshpass -p "$AP_PASSWORD" ssh "${SSH_OPTS[@]}" -n "$AP_USER@$1" "$2"
}

fail=0
serials=()

for IP in "$@"; do
  echo "=== $IP ==="

  case "$ACTION" in
    stop)
      ap "$IP" 'kill $(cat /tmp/lightguard.pid 2>/dev/null) 2>/dev/null; rm -f /tmp/lightguard.pid; echo stopped'
      continue
      ;;
    status)
      ap "$IP" 'if [ -f /tmp/lightguard.pid ] && kill -0 $(cat /tmp/lightguard.pid) 2>/dev/null; then echo "running pid=$(cat /tmp/lightguard.pid)"; else echo "not running"; fi; tail -3 /tmp/lightguard.log 2>/dev/null'
      continue
      ;;
  esac

  # Confirm the sensor is actually there BEFORE installing anything. An AP model
  # without a JSA-1141 must fail here, not silently report nothing forever.
  probe=$(ap "$IP" 'i2cset -y 0 0x38 0x04 0x82 >/dev/null 2>&1 && echo present || echo absent')
  if [ "$probe" != "present" ]; then
    echo "  SKIP: no ambient-light sensor responding at I2C 0x38 on $IP"
    fail=$((fail+1))
    continue
  fi

  serial=$(ap "$IP" '/usr/sbin/rdwr_boot_cfg read_all 2>/dev/null | sed -n "s/^SERIAL#=//p" | head -1')
  model=$(ap "$IP" '/usr/sbin/rdwr_boot_cfg read_all 2>/dev/null | sed -n "s/^MODEL=//p" | head -1')
  echo "  $model  $serial"
  serials+=("$serial")

  sleep "$AP_SSH_PACE_SECONDS"
  sshpass -p "$AP_PASSWORD" ssh "${SSH_OPTS[@]}" "$AP_USER@$IP" 'cat > /tmp/lightguard.sh && chmod +x /tmp/lightguard.sh' < "$AGENT"

  ap "$IP" "kill \$(cat /tmp/lightguard.pid 2>/dev/null) 2>/dev/null; \
    LIGHTGUARD_URL='$AURA_URL/api/light-sensor/report' \
    LIGHTGUARD_TOKEN='$TOKEN' \
    LIGHTGUARD_INTERVAL='$INTERVAL' \
    nohup /tmp/lightguard.sh >> /tmp/lightguard.log 2>&1 & echo \$! > /tmp/lightguard.pid; sleep 1; cat /tmp/lightguard.pid"
done

[ "$ACTION" != "install" ] && exit 0

echo
echo "Waiting up to 60s for readings to reach AURA ..."
for _ in $(seq 1 12); do
  sleep 5
  states=$(curl -sk -m 10 "$AURA_URL/api/light-sensor/states" 2>/dev/null)
  missing=0
  for s in "${serials[@]}"; do
    echo "$states" | grep -q "\"$s\"" || missing=$((missing+1))
  done
  if [ "$missing" -eq 0 ] && [ "${#serials[@]}" -gt 0 ]; then
    echo "All ${#serials[@]} AP(s) reporting:"
    echo "$states" | python3 -m json.tool 2>/dev/null || echo "$states"
    exit "$fail"
  fi
done

echo "TIMED OUT: not every AP reached AURA. Check /tmp/lightguard.log on the AP and"
echo "confirm the AP can reach $AURA_URL outbound."
exit 1
