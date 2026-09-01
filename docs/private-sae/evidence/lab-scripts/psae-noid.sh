#!/bin/bash
sudo pkill -f "hostapd.*psae.conf" 2>/dev/null; sleep 1
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
sae_password=Aura-Alpha-7291|mac=b2:41:08:ca:20:f0
sae_password=Aura-Bravo-8462|mac=00:11:22:33:44:55
EOF
sudo ip link set wlan0 down 2>/dev/null; sleep 1
sudo setsid bash -c '/tmp/hostapd-2.11/hostapd/hostapd -dd -t /tmp/psae.conf > /tmp/psae.log 2>&1 & echo $! > /tmp/psae.pid'
sleep 4
sudo ip addr add 192.168.90.1/24 dev wlan0 2>/dev/null
