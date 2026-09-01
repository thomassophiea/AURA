#!/bin/bash
# Drive wpa_supplicant on the Pi's wlan0 for a WPA3-SAE join, with SAE debug.
# arg1 = passphrase, arg2 = optional sae_password_id
PSK="$1"; PWID="$2"
STA=wlan0
sudo pkill -f "wpa_supplicant.*$STA" 2>/dev/null; sleep 1
sudo ip link set "$STA" up 2>/dev/null
CONF=/tmp/sae-join.conf
{
  echo "ctrl_interface=/run/wpa_supplicant"
  echo "country=US"
  echo "sae_pwe=1"
  echo "network={"
  echo "  ssid=\"Aura-SAE-Lab\""
  echo "  key_mgmt=SAE"
  echo "  ieee80211w=2"
  echo "  sae_password=\"$PSK\""
  [ -n "$PWID" ] && echo "  sae_password_id=\"$PWID\""
  echo "  scan_freq=2412"
  echo "}"
} | sudo tee "$CONF" >/dev/null
sudo timeout 25 wpa_supplicant -i "$STA" -c "$CONF" -d 2>&1 | \
  grep -iE "SAE|CTRL-EVENT-CONNECTED|CTRL-EVENT-ASSOC|4-Way|WPA: Key negotiation|reason|auth_failures|Trying to associate|Associated with|EAPOL" | head -40
echo "--- final state ---"
sudo wpa_cli -i "$STA" status 2>/dev/null | grep -E "wpa_state|bssid|sae|ssid" || true
sudo pkill -f "wpa_supplicant.*$STA" 2>/dev/null
