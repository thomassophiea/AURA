#!/bin/bash
sudo pkill -f wpa_supplicant 2>/dev/null
sudo pkill -f hostapd 2>/dev/null
sudo nmcli dev set wlan0 managed no 2>/dev/null
sudo rfkill unblock wifi 2>/dev/null
sudo iw reg set US 2>/dev/null
sudo wlanpi-reg-domain set US 2>/dev/null
sleep 2
cat >/tmp/psae.conf <<'EOF'
interface=wlan0
driver=nl80211
ctrl_interface=/run/hostapd
ssid=Skynet_PSAE
country_code=US
ieee80211d=1
hw_mode=g
channel=6
ieee80211n=1
wmm_enabled=1
wpa=2
wpa_key_mgmt=SAE
rsn_pairwise=CCMP
group_cipher=CCMP
ieee80211w=2
sae_pwe=1
sae_require_mfp=1
sae_password=Aura-Enroll-0000
EOF
[ -f /tmp/psae_extra.conf ] && cat /tmp/psae_extra.conf >> /tmp/psae.conf
sudo ip link set wlan0 down 2>/dev/null
sleep 2
sudo setsid bash -c '/tmp/hostapd-2.11/hostapd/hostapd -dd -t /tmp/psae.conf > /tmp/psae.log 2>&1 & echo $! > /tmp/psae.pid'
