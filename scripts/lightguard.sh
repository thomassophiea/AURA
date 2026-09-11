#!/bin/sh
# lightguard — ambient-light agent for Extreme Wi-Fi 7 access points.
#
# Reads the onboard JSA-1141 ambient-light sensor over I2C and POSTs the reading
# to AURA's /api/light-sensor/report. Runs on the AP's BusyBox userland; no
# bashisms, no coreutils, no /usr/bin/timeout.
#
# VERIFIED ON HARDWARE (2026-09-11, AP_VERSION 10.20.1.0-020R):
#   AP5020  (BOARD_TYPE=mapleleaf)  bus 0, addr 0x38 — present, reads 7 and 47-52
#                                   on two APs in differently lit rooms
#   AP4020X                         bus 0, addr 0x38 — present, reads 6
#
# Register map (same on both models):
#   0x04  gain          write 0x82
#   0x05  integration   write 0xff
#   0x00  control       write 0x01 to trigger a conversion
#   0x1E  data low      read
#   0x1F  data high     read
#
# The value is an UNCALIBRATED 16-bit count, not lux. Do not relabel it. A lit
# lab reads 6-52; a covered radome reads 2. The first conversion after a cold
# start returns 0x00 — the sensor needs one throwaway trigger — which is why
# this script primes before its first report and never sends the priming read.
#
# Install with scripts/deploy-lightguard.sh, which also verifies that reports
# are actually landing in Postgres rather than assuming they are.

BUS=0
ADDR=0x38
INTERVAL="${LIGHTGUARD_INTERVAL:-15}"
URL="${LIGHTGUARD_URL:?LIGHTGUARD_URL is required}"
TOKEN="${LIGHTGUARD_TOKEN:-}"
# Below this raw count the agent reports state=dark. AURA re-derives its own
# verdict from the raw value against the experiment's configured threshold, so
# this only affects the coarse label, never the decision.
DARK_AT="${LIGHTGUARD_DARK_AT:-3}"

SERIAL=$(/usr/sbin/rdwr_boot_cfg read_all 2>/dev/null | sed -n 's/^SERIAL#=//p' | head -1)
[ -z "$SERIAL" ] && SERIAL=$(/usr/sbin/rdwr_boot_cfg read_all 2>/dev/null | sed -n 's/^mfg_serial_number=//p' | head -1)
[ -z "$SERIAL" ] && { echo "lightguard: cannot determine serial number"; exit 1; }

log() { echo "$(date '+%Y-%m-%dT%H:%M:%S') lightguard[$SERIAL] $*"; }

# Configure gain and integration time once. These survive until the AP reboots.
i2cset -y $BUS $ADDR 0x04 0x82 2>/dev/null || { log "I2C write failed — no sensor at $ADDR"; exit 2; }
i2cset -y $BUS $ADDR 0x05 0xff 2>/dev/null

hex2dec() { printf '%d' "$1" 2>/dev/null || echo ""; }

read_raw() {
  i2cset -y $BUS $ADDR 0x00 0x01 2>/dev/null
  sleep 1
  dl=$(i2cget -y $BUS $ADDR 0x1e 2>/dev/null)
  dh=$(i2cget -y $BUS $ADDR 0x1f 2>/dev/null)
  [ -z "$dl" ] && { echo ""; return; }
  l=$(hex2dec "$dl"); h=$(hex2dec "$dh")
  [ -z "$l" ] && { echo ""; return; }
  [ -z "$h" ] && h=0
  echo $(( h * 256 + l ))
}

# Prime: the first conversion after configuration reads 0 on every AP tested.
read_raw > /dev/null

log "started; posting to $URL every ${INTERVAL}s (dark at <= $DARK_AT)"

while :; do
  RAW=$(read_raw)
  if [ -z "$RAW" ]; then
    # A failed I2C read is NOT darkness. Skip the report entirely so AURA sees
    # a silent sensor — which it treats as "cannot trigger" — rather than a
    # fabricated dark reading that would shut radios down.
    log "sensor read failed; no report sent"
    sleep "$INTERVAL"
    continue
  fi

  if [ "$RAW" -le "$DARK_AT" ]; then STATE=dark; else STATE=light; fi
  BODY="{\"serial\":\"$SERIAL\",\"state\":\"$STATE\",\"data\":$RAW}"

  if [ -n "$TOKEN" ]; then
    curl -sk -m 10 -X POST "$URL" -H 'Content-Type: application/json' \
      -H "X-Light-Token: $TOKEN" -d "$BODY" > /dev/null 2>&1
  else
    curl -sk -m 10 -X POST "$URL" -H 'Content-Type: application/json' \
      -d "$BODY" > /dev/null 2>&1
  fi
  RC=$?
  [ $RC -ne 0 ] && log "post failed rc=$RC raw=$RAW"

  sleep "$INTERVAL"
done
