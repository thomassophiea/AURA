#!/bin/bash
cd /tmp
rm -rf hostapd-2.11
curl -s --max-time 60 -O https://w1.fi/releases/hostapd-2.11.tar.gz || { echo DOWNLOAD_FAIL; exit 1; }
tar xzf hostapd-2.11.tar.gz
cd hostapd-2.11/hostapd
cp defconfig .config
# ensure SAE + H2E + nl80211 + MFP
grep -q '^CONFIG_SAE=y' .config || echo 'CONFIG_SAE=y' >> .config
sed -i 's/^#CONFIG_SAE=y/CONFIG_SAE=y/' .config
echo 'CONFIG_SAE=y' >> .config
echo 'CONFIG_DRIVER_NL80211=y' >> .config
echo 'CONFIG_IEEE80211W=y' >> .config
echo 'CONFIG_IEEE80211AC=y' >> .config
echo 'CONFIG_IEEE80211AX=y' >> .config
make -j4 2>&1 | tail -4
echo "=== result ==="
ls -la ./hostapd 2>/dev/null && ./hostapd -v 2>&1 | head -1
strings ./hostapd 2>/dev/null | grep -icE 'sae_pwe|sae_password'
