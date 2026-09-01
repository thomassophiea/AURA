# SAE Password Identifiers: Protocol Mechanics and Real-World Client Support

Research date: **2026-08-31**. All URLs accessed 2026-08-31 unless noted.
Purpose: product decision on per-user WPA3-Personal (SAE) credentials.

Primary-source anchors used throughout:

- **hostapd/wpa_supplicant upstream git** — shallow-cloned `https://w1.fi/hostap.git` on 2026-08-31; HEAD = `168f975 Thu Aug 27 2026` (i.e., the repository is current to four days before this research). The w1.fi cgit web UI is behind an anti-bot wall, so quotes below come from the cloned files and from the byte-identical AOSP mirror (`android.googlesource.com/platform/external/wpa_supplicant_8`).
- **Wi-Fi CERTIFIED WPA3 Technology Overview, January 2021 (Wi-Fi Alliance)** — full PDF retrieved and read: https://www.wi-fi.org/system/files/Wi-Fi_CERTIFIED_WPA3_Technology_Overview_202101.pdf
- The **WPA3 Specification v3.x PDF itself is login-gated** on wi-fi.org (redirects to a Salesforce SAML login), so statements about its exact text are labeled accordingly.

Labels: **DOCUMENTED** (verified against a fetched primary/credible source), **INFERRED** (strongly implied by documented evidence but exact normative text not retrieved), **UNKNOWN** (could not verify).

---

## PART 1 — SAE Password Identifier protocol mechanics

### 1.1 How the identifier is signaled; over-the-air visibility

**DOCUMENTED — the identifier travels in the SAE Commit, inside an unencrypted 802.11 Authentication frame, and is visible to a passive observer.**

- The SAE exchange is four 802.11 **Authentication frames** (two Commit, two Confirm) exchanged *before* association and before any encryption keys exist; they are plainly visible in packet captures. mrncciew's WPA3-SAE capture walkthrough shows the Commit carrying Group ID, Scalar, and Finite Field Element in cleartext Authentication frames: https://mrncciew.com/2019/11/29/wpa3-sae-mode/ (accessed 2026-08-31).
- When a password identifier is used, a **Password Identifier element** (Element ID Extension) is appended to the STA's Commit; hostapd's AP-side code writes it via `sae_write_commit(..., rx_id)` and sizes the buffer `SAE_COMMIT_MAX_LEN + (rx_id ? 3 + os_strlen(rx_id) : 0)` — i.e., 2-byte element header + 1-byte extension ID + the identifier string, uncencrypted (hostap `src/ap/ieee802_11.c`, `auth_build_sae_commit()`; AOSP mirror: https://android.googlesource.com/platform/external/wpa_supplicant_8/+/refs/heads/main/src/ap/ieee802_11.c).
- Corroboration that "the value of the password ID itself ... is included as information in the SAE Commit to be transmitted": USPTO patent 12294857 describing the 802.11 mechanism (https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/12294857) and search-level confirmation that "the password identifier is sent in cleartext in the station SAE Commit message."
- If the AP has no password for the received identifier, it answers with status code **123 `WLAN_STATUS_UNKNOWN_PASSWORD_IDENTIFIER`** (`src/common/ieee802_11_defs.h:231` in the hostap clone) — itself an unencrypted, observable signal.
- Privacy consequence is acknowledged inside IEEE: 802.11bi task-group document **11-25/0155 "SAE password identifier update"** (https://mentor.ieee.org/802.11/dcn/25/11-25-0155-07-00bi-sae-password-identifier-update.docx) exists to rework the identifier's privacy; the docx itself could not be fetched (server returned HTTP 418), so its exact proposal is **UNKNOWN**, but its title/scope corroborates the cleartext concern.

**Product takeaway (DOCUMENTED):** a per-user identifier (e.g., a username) becomes a persistent cleartext beacon of *who is authenticating* to any passive sniffer. Do not put usernames or MACs in identifiers; treat them as pseudonymous handles.

### 1.2 Password Identifier and H2E

**DOCUMENTED (implementation) / INFERRED (IEEE normative text):** hostapd/wpa_supplicant enforce hash-to-element whenever an identifier is used. Both `hostapd.conf` and `wpa_supplicant.conf` upstream state, verbatim:

> "SAE mechanism for PWE derivation
>  0 = hunting-and-pecking loop only (default without password identifier)
>  1 = hash-to-element only (default with password identifier)
>  ...
>  **When using SAE password identifier, the hash-to-element mechanism is used regardless of the sae_pwe parameter value.**"

(hostap clone `hostapd/hostapd.conf`; AOSP mirror identical: https://android.googlesource.com/platform/external/wpa_supplicant_8/+/refs/heads/main/hostapd/hostapd.conf, accessed 2026-08-31.)

The AP-side code matches: in `auth_build_sae_commit()`, `if (rx_id && hapd->conf->sae_pwe != SAE_PWE_FORCE_HUNT_AND_PECK) use_pt = 1;` — an identifier forces the PT/H2E path.

That this mirrors an IEEE 802.11 (REVmd/802.11-2020 onward) requirement — identifier ⇒ H2E-derived PWE — is **INFERRED**: consistent across hostapd, Cisco H2E documentation (https://www.cisco.com/c/en/us/td/docs/wireless/controller/ewc/17-12/config-guide/ewc_cg_17_12/m_hash-to-element_for_password_element_in_sae_authentication.pdf) and Fortinet H2E/SAE-PK notes (https://docs.fortinet.com/document/fortigate/7.2.0/new-features/645349/wpa3-enhancements-to-support-h2e-only-and-sae-pk-7-2-1), but the IEEE clause text itself was not retrievable. Practical consequence either way: **an identifier-using deployment is H2E-only, so clients must support H2E** (H2E landed in clients roughly: Android 12+, wpa_supplicant 2.10+, Windows 10 21H2+, recent Apple OSes — secondary claim via search results, **INFERRED**, not individually verified).

Also DOCUMENTED from the Wi-Fi Alliance Technology Overview (p.3): "Hash-to-Element is always used when both the AP and client device indicate support for it" — H2E itself is negotiated via a status code (126 `SAE_HASH_TO_ELEMENT`) in the Commit.

### 1.3 Wi-Fi Alliance WPA3 spec treatment / certification

- **DOCUMENTED (absence):** The Wi-Fi Alliance's own 8-page **Wi-Fi CERTIFIED WPA3 Technology Overview (Jan 2021)** — which enumerates SAE, H2E, transition mode, SAE-PK, Transition Disable, FT, OCV, Beacon Protection, Privacy Extensions, and the Wi-Fi QR-code URI — **never mentions SAE Password Identifiers at all** (full PDF read 2026-08-31: https://www.wi-fi.org/system/files/Wi-Fi_CERTIFIED_WPA3_Technology_Overview_202101.pdf). Password identifiers are not a promoted, certified WPA3 capability.
- **DOCUMENTED (via search excerpts of the spec):** the WPA3 Specification (v3.1/v3.3) does *acknowledge* identifiers — its WIFI URI definition includes an `id` field "present only if the password has an SAE password identifier" (WPA3 Specification v3.1: https://www.wi-fi.org/system/files/WPA3%20Specification%20v3.1.pdf — login-gated; v3.3 overview mirror: https://www.scribd.com/document/860418315/WPA3-Specification-v3-3). Treatment is **optional**.
- **UNKNOWN:** whether the WPA3 certification test plan contains any password-identifier test cases. No public evidence of testing was found; combined with its complete absence from the Technology Overview and from every client OS (Part 2), the reasonable reading is **INFERRED: not exercised by the certification program**, which is exactly why client vendors have not shipped it.

### 1.4 hostapd support

**DOCUMENTED.** Upstream `hostapd/hostapd.conf` (HEAD 2026-08-27), quoted verbatim:

```
# sae_password uses the following encoding:
#<password/credential>[|mac=<peer mac>][|vlanid=<VLAN ID>]
#[|pk=<m:ECPrivateKey-base64>][|id=<identifier>]
# Examples:
#sae_password=secret
#sae_password=really secret|mac=ff:ff:ff:ff:ff:ff
#sae_password=example secret|mac=02:03:04:05:06:07|id=pw identifier
#sae_password=example secret|vlanid=3|id=pw identifier
```

- Multiple entries: "Each sae_password entry is added to a list of available passwords. This corresponds to the dot11RSNAConfigPasswordValueEntry." Entries may be scoped by peer MAC and/or identifier; "If the password identifier (with non-zero length) is included, the entry is limited to be used only with that specified identifier." "The last matching (based on peer MAC address and identifier) entry is used."
- **Per-password VLAN: yes.** `|vlanid=<VLAN ID>` binds "the station to the specified VLAN whenever the specific SAE password entry is used" (requires `dynamic_vlan`). Code: `auth_build_sae_commit()` stores `pw->vlan_id` into `sta->sae->tmp->vlan_id`. Real-world caveat: OpenWrt has an open bug where the VLAN assignment intermittently lands in the wrong bridge (https://github.com/openwrt/packages/issues/15362, https://forum.openwrt.org/t/wifi-vlan-assignment-with-sae-password/163620 — DOCUMENTED as reported, not independently reproduced).
- `sae_password_file=` supports bulk entries in the same format (one per line) — relevant for scale.
- Canonical doc location: https://w1.fi/cgit/hostap/plain/hostapd/hostapd.conf (anti-bot-gated; verified via git clone of https://w1.fi/hostap.git and the AOSP mirror).

### 1.5 wpa_supplicant support

**DOCUMENTED.** `wpa_supplicant/wpa_supplicant.conf` network-block parameters:

> "sae_password: SAE password ... sae_password_id: SAE password identifier — This parameter can be used to set an identifier for the SAE password. By default, no such identifier is used. If set, the specified identifier value is used by the other peer to select which password to use for authentication."

(AOSP mirror lines ~1111–1121: https://android.googlesource.com/platform/external/wpa_supplicant_8/+/refs/heads/main/wpa_supplicant/wpa_supplicant.conf; same text in upstream clone.)

---

## PART 2 — Native client OS support (the decisive question)

### Windows 11 — **NO**

- **DOCUMENTED (schema absence):** The WLAN profile XML schema's `authEncryption` element supports `authentication=WPA3SAE` plus `encryption`, `useOneX`, `FIPSMode`, `transitionMode` — and the `sharedKey` element carries only `keyType/protected/keyMaterial`. **No element or attribute anywhere in the profile schema carries an SAE password identifier.** (https://github.com/MicrosoftDocs/win32/blob/docs/desktop-src/NativeWiFi/wlan-profileschema-authencryption-security-element.md; WPA3 profile sample: https://learn.microsoft.com/en-us/windows/win32/nativewifi/wpa3-personal-transition-profile-sample.)
- **DOCUMENTED (user-facing absence):** Microsoft Q&A "No WPA3 Password Identifier field in the Wi-Fi manager" — open since 2021, no Microsoft answer and no field in the native UI (https://learn.microsoft.com/en-us/answers/questions/3807227/no-wpa3-password-identifier-field-in-the-wi-fi-man).

### macOS / iOS / iPadOS — **NO**

- **DOCUMENTED (MDM payload absence):** the `com.apple.wifi.managed` payload (62 keys enumerated via the Apple Device Policy Explorer rendering of Apple's device-management schema) has `EncryptionType` values `WPA / WPA2 / WPA3 / Any / None` plus `Password`, EAP, Hotspot 2.0, proxy and QoS keys — **no SAE password identifier or per-user WPA3 key of any kind** (https://appledevicepolicy.tools/policy-explorer/detail?type=com.apple.wifi.managed&branch=release; Apple's own listing: https://support.apple.com/guide/deployment/wi-fi-settings-dep168e876c9/web; canonical: https://developer.apple.com/documentation/devicemanagement/wifi — JS-rendered, key list cross-checked via the explorer).
- Native join UI: no identifier field is offered when joining a WPA3 network. **INFERRED from the payload absence** (Apple exposes strictly less in the join sheet than in MDM); no Apple document claims otherwise.

### Android — **NO (public API), dead plumbing below**

- **DOCUMENTED (source-level):** `WifiConfiguration.java` (4,770 lines, AOSP main) contains **zero** occurrences of any password-identifier field (https://android.googlesource.com/platform/packages/modules/Wifi/+/refs/heads/main/framework/java/android/net/wifi/WifiConfiguration.java). `WifiNetworkSuggestion` exposes `setWpa3Passphrase()` etc., with no identifier parameter.
- **DOCUMENTED (the smoking gun):** the vendor HAL *does* define it — `ISupplicantStaNetwork.aidl` has `setSaePasswordId(in String saePasswordId)` / `getSaePasswordId()` (https://android.googlesource.com/platform/hardware/interfaces/+/refs/heads/main/wifi/supplicant/aidl/android/hardware/wifi/supplicant/ISupplicantStaNetwork.aidl, lines 452/1028) — but in the framework's `SupplicantStaNetworkHalAidlImpl.java`, `mSaePasswordId` is **declared once (line 134) and never written or read anywhere else in the 3,819-line file** (https://android.googlesource.com/platform/packages/modules/Wifi/+/refs/heads/main/service/java/com/android/server/wifi/SupplicantStaNetworkHalAidlImpl.java). The plumbing exists down to wpa_supplicant, and nothing above it ever supplies a value.
- **DOCUMENTED (user-facing absence):** XDA: "No Password Identifiers option for WPA3(SAE) in the Wi-Fi manager, Android 11" (https://xdaforums.com/t/no-password-identifiers-option-for-wpa3-sae-in-the-wi-fi-manager-android-11.4254983/).

### ChromeOS — **NO**

- **DOCUMENTED:** the ONC (Open Network Configuration) spec's WiFi type fields are `AutoConnect, BSSIDAllowlist, BSSIDRequested, EAP, HexSSID, HiddenSSID, Passphrase, Security, SSID, SignalStrength, TetheringState`; Security values run through `WPA3`/`WPA2-WPA3` but there is **no SAE password identifier field** — one generic `Passphrase` (https://chromium.googlesource.com/chromium/src/+/main/components/onc/docs/onc_spec.md).

### Linux — **YES with raw wpa_supplicant; NO with NetworkManager**

- **DOCUMENTED:** wpa_supplicant `sae_password_id` (Part 1.5) — the only shipping client implementation.
- **DOCUMENTED (absence):** NetworkManager's `802-11-wireless-security` setting supports `key-mgmt=sae` but its full property list (`auth-alg, fils, group, key-mgmt, leap-*, pairwise, pmf, proto, psk, psk-flags, wep-*, wps-method`) has **no sae-password-id property**; SAE reuses `psk` (https://networkmanager.dev/docs/api/latest/settings-802-11-wireless-security.html). So even most Linux desktops can't use identifiers without hand-written wpa_supplicant configs.
- iwd: **UNKNOWN** (not checked).

### Verdict

**DOCUMENTED across five ecosystems: SAE Password Identifiers are effectively a hostapd↔wpa_supplicant-only feature.** No mainstream OS — Windows 11, macOS/iOS/iPadOS, Android, ChromeOS, or NetworkManager-based Linux — lets a user or an MDM profile supply an identifier. hostapd's own upstream documentation treats client absence as the operative fact: the `sae_track_password` workaround is described as "**meant as a workaround until SAE with password identifiers is deployed on STAs**" (hostapd.conf, HEAD 2026-08-27). A per-user-credential product built on password identifiers would today authenticate exactly one class of client: Linux boxes running hand-configured wpa_supplicant.

---

## PART 3 — Related mechanisms

### 3.1 SAE-PK

**DOCUMENTED (purpose):** SAE-PK is an optional WPA3-Personal extension for *shared*-password public networks (café signage passwords): the password encodes a fingerprint of the AP's public key, and the AP signs the SAE transcript, so "even if the attacker knows the password, it does not know the private key to generate a valid signature, and therefore the client device is protected against an evil twin attack" (Wi-Fi Alliance Technology Overview pp. 4–5, https://www.wi-fi.org/system/files/Wi-Fi_CERTIFIED_WPA3_Technology_Overview_202101.pdf; Wi-Fi Alliance Beacon post: https://www.wi-fi.org/beacon/thomas-derham-nehru-bhandaru/wi-fi-certified-wpa3-december-2020-update-brings-new-0).

**Relevance to per-user credentials: none.** SAE-PK authenticates the *AP* to clients on a *single shared* password; it does not add multi-password/per-user capability. hostapd supports it per password entry (`|pk=`); wpa_supplicant/AOSP builds carry `CONFIG_SAE_PK` (https://android.googlesource.com/platform/external/wpa_supplicant_8/+/master/wpa_supplicant/Android.mk), but **native OS-level client exposure is UNKNOWN/limited** — no Windows/Apple/ChromeOS surface for SAE-PK passwords was found either.

### 3.2 Wi-Fi Easy Connect / DPP

- **DOCUMENTED:** DPP is a *provisioning* layer: a Configurator authenticates an Enrollee (QR code bootstrapping) and pushes it a network profile. It can provision DPP-AKM Connectors **or legacy credentials — including an SAE passphrase**: hostap's README-DPP shows `conf=sta-psk pass=<hex>` "for legacy (PSK/SAE) provisioning of a station Enrollee" (https://android.googlesource.com/platform/external/wpa_supplicant_8/+/master/wpa_supplicant/README-DPP); Android's Easy Connect docs state Android 10+ supports provisioning "the pre-shared key (PSK) protocol for WPA2 and the simultaneous authentication of equals (SAE) protocol for WPA3" (https://source.android.com/docs/core/connect/wifi-easy-connect).
- So DPP **could** deliver a per-device SAE password to a device — but the delivered credential still has to be *selectable at the AP*, which brings back the identifier/MAC problem below. Whether the DPP Configuration Object can carry an SAE **password identifier** alongside the passphrase: **UNKNOWN** (Easy Connect spec PDF at https://www.wi-fi.org/system/files/Wi-Fi_Easy_Connect_Specification_v3.0.pdf not parsed; no identifier plumbing exists in the Android enrollee path regardless).
- **Client support: Android 10+ as enrollee (DOCUMENTED, source.android.com above). iOS: no DPP support — Apple uses its own sharing/QR mechanisms (DOCUMENTED-secondary: https://esp32.com/viewtopic.php?t=34409, https://github.com/LucarinoF16/Wi-Fi-Easy-Connect-DPP-Testbed). Windows: no evidence of support found (UNKNOWN, presumed absent).** DPP does not rescue a per-user-SAE design for iPhone/Windows fleets.

### 3.3 The core protocol constraint: AP must pick the password at Commit time

**DOCUMENTED.** Three mutually reinforcing sources:

1. **Dragonfly/SAE zero-knowledge property.** RFC 7664: "resistance to offline dictionary attack means that any advantage an adversary can gain must be directly related to the number of interactions she makes with an honest protocol participant and not through computation"; both peers must hold "an identical view of the shared password" *before* the exchange (https://www.rfc-editor.org/rfc/rfc7664.html). Wi-Fi Alliance Technology Overview p.2: "It is not possible for an adversary to passively observe a WPA3-Personal exchange ... and then try all possible passwords ... The only method ... is through repeated active attacks in which the adversary gets only one guess at the password per attack." **The AP is in exactly the adversary's position with respect to any password the client didn't use: the client's Commit (scalar + element) cryptographically does not reveal which of N passwords produced it, and the AP gets evidence only at Confirm — one password per full exchange.**
2. **hostapd selection logic (source-verified).** `sae_get_password()` walks the configured list and takes the **first list entry** matching (a) peer MAC or wildcard, (b) identifier presence — an entry *with* an `id=` is skipped when the STA sent none, and vice versa — and (c) identifier string equality; then `break`. Config parsing **prepends** each new `sae_password` line (`pw->next = bss->sae_passwords; bss->sae_passwords = pw;` in `hostapd/config_file.c` `parse_sae_password()`), which is why the docs say "the **last matching** entry is used." Net behavior with multiple wildcard, identifier-less entries: **exactly one (the last-configured matching) password is ever used for a given STA; the others are dead. There is no automatic trial-and-error in the default path.** No match at all with a received identifier ⇒ status 123 UNKNOWN_PASSWORD_IDENTIFIER.
3. **hostapd's explicit trial-and-error escape hatch, `sae_track_password` (upstream, present at HEAD 2026-08-27):** "While SAE design does not allow the AP to determine the used password robustly if multiple passwords are configured without use of password identifiers, a small number of such passwords might be usable with minimal impact to STAs. ... Configured passwords are then tried one by one until success. **This shows up as a potential attack to the STA, though, and as such, may result in the AP getting rejected after a couple of attempts. Only one password can be tested per attempt, so this limits this mechanism to only a small number (e.g., 2-3) passwords** without showing significant usability issues with some STAs. This is meant as a workaround until SAE with password identifiers is deployed on STAs." (hostapd.conf; the option tracks per-STA MAC which passwords failed.) A client-side mirror of the failure is visible in the AP code path: on UNKNOWN_PASSWORD_IDENTIFIER wpa_supplicant "Clear[s] stored password identifier" (`src/ap/ieee802_11.c` log strings).

**Therefore, multi-password selection on one SAE BSS reduces to exactly the three options in the question, DOCUMENTED end-to-end:**
- (a) **Password identifier** — protocol-clean, VLAN-capable, but unsupported by every mainstream client (Part 2) and cleartext on air (Part 1.1);
- (b) **MAC-based lookup** (`sae_password=...|mac=`) — what shipping multi-PSK-WPA3 products actually do: SPR binds per-device SAE passwords by MAC, with a wildcard entry to catch/enroll new devices ("HostAP finds the passphrase to use by MAC address," https://www.supernetworks.org/pages/blog/multipsk%20and%20wpa3); breaks against MAC randomization unless the device's per-network MAC is captured at enrollment;
- (c) **Trial-and-error full SAE exchanges** (`sae_track_password`) — works for 2–3 passwords, looks like an active attack to clients, does not scale per-user.

### 3.4 PMKSA caching and roaming (FT) with per-user SAE

- **DOCUMENTED:** FT (802.11r) is "optionally available with WPA3-Personal" (Wi-Fi Alliance Technology Overview p.6). With FT-SAE, the initial mobility-domain association runs full SAE once; subsequent transitions use the FT key hierarchy without re-running SAE — so per-user password selection cost is paid once per mobility domain, and the derived hierarchy is inherently per-user. Vendor interop caveats exist (early Samsung/Pixel FT+WPA3 issues: https://community.ruckuswireless.com/t5/Unleashed/Unleashed-WPA3-FT-SAE-Client-Interoperability-question/m-p/47702).
- **DOCUMENTED:** SAE PMKSA caching lets a returning/roaming STA present a PMKID and skip SAE straight to the 4-way handshake; on PMKID mismatch the STA is bounced to full SAE (Cisco/Meraki behavior write-ups: https://documentation.meraki.com/MR/Wi-Fi_Basics_and_Best_Practices/Pairwise_Master_Key_and_Opportunistic_Key_Caching_-_PMK_and_OKC; NCC Group on PMKID in SAE vs the WPA2 PMKID attack: https://www.nccgroup.com/research/pmkid-attacks-debunking-the-80211r-myth/). SAE PMKs are per-STA-pairing, so caches are per-AP unless the controller distributes them; **per-user SAE adds no new caching problem beyond ordinary SAE** — the identifier/password selection only matters on the full-SAE path. SAE-PK PMKs cache identically (Wi-Fi Alliance Beacon, Dec 2020 update page).
- **INFERRED:** on a controller architecture (one authenticator across APs), PMKSA/FT behaves the same for per-user SAE as for single-password SAE; the per-user lookup executes only at initial auth.

### 3.5 Anti-clogging tokens / SAE DoS

**DOCUMENTED:** SAE Commits are unauthenticated and computationally expensive by design, so 802.11 provides an anti-clogging (cookie) mechanism: past a threshold of concurrent unfinished handshakes, the AP rejects Commits with `ANTI_CLOGGING_TOKEN_REQUIRED`, returning a token the STA must echo in a new Commit — proving reachability before the AP does group math. hostapd exposes `anti_clogging_threshold=5` (default; `sae_anti_clogging_threshold` deprecated alias) "how many open SAE instances can be in progress at the same time before the anti-clogging mechanism is taken into use," plus `sae_sync=3` maximum synchronization errors before disconnect (hostapd.conf, upstream HEAD 2026-08-27). RFC 7664 §anti-clogging describes the same cookie construction for Dragonfly (https://www.rfc-editor.org/rfc/rfc7664.html). Note for per-user designs: `sae_track_password` trial-and-error *multiplies* open SAE instances per legitimate client, interacting badly with the anti-clogging threshold under load (**INFERRED** from the two documented mechanisms).

---

## Bottom line for the product decision

1. **Per-user WPA3 credentials via SAE Password Identifiers are not deployable to ordinary devices in 2026.** Zero native support on Windows 11, Apple OSes, Android, ChromeOS; NetworkManager-Linux also lacks it. Only raw wpa_supplicant speaks it. (Part 2, all DOCUMENTED.)
2. **The AP-side machinery is mature and free** — hostapd does identifiers, per-password VLANs, and bulk password files today — so an AP-side implementation risks building a feature only IoT/Linux fleets can consume.
3. **The workable near-term pattern for per-user WPA3-SAE is MAC-bound password entries** (hostapd `|mac=`, SPR-style, with wildcard-entry enrollment), accepting the MAC-randomization enrollment dance — which matches the PPSK-hardware-verdict memory note: the gap is config-generation, not the dataplane.
4. **Trial-and-error (`sae_track_password`) is upstream-supported but explicitly capped at ~2–3 passwords** and looks like an attack to clients — a bridge, not a product.
5. If identifiers are ever adopted by clients, remember: **identifier strings are cleartext on air** (802.11bi is actively reworking this) — design them as opaque per-user handles, never usernames.
