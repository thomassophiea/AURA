# Multi-PSK under WPA3-SAE — Vendor Capability Matrix

**Research date: 2026-08-31.** All URLs accessed 2026-08-31 unless noted.
Scope: for each vendor — unique per-user/per-device credentials under WPA3-SAE on ONE WLAN (yes/no/partial), mechanism, randomized-MAC behavior, 6 GHz, per-credential VLAN/policy, scale, evidence quality.

Evidence labels: **DOCUMENTED** (vendor doc/spec text located and quoted or reliably summarized), **INFERRED** (follows from documented facts but not stated verbatim), **UNKNOWN** (could not verify).

**Access-method note:** `arubanetworking.hpe.com/techdocs`, `cisco.com/c/en/us/td`, and `w1.fi` return HTTP 403 to direct automated fetch; where marked "(via reader proxy)" the same public URL was retrieved through a rendering proxy. Content should be spot-checked in a browser before external use.

---

## The physics of the problem (context for every section)

WPA2-PSK's 4-way handshake lets an AP/RADIUS server *derive which of N configured PSKs a client used* from the client's first handshake message (the "WPA2 PSK cracking" trick every MPSK/iPSK/DPSK/PPSK implementation relies on). WPA3-SAE is an interactive zero-knowledge proof: the AP must commit to **one** password before the exchange, and a wrong guess costs a full new handshake. So every WPA3 multi-password scheme must pick the password *before* SAE runs, which leaves exactly four mechanisms:

1. **MAC → password binding** (lookup before commit) — Mist, Cisco 9800, Fortinet, hostapd `|mac=`.
2. **SAE Password Identifiers** (client sends an identifier in SAE Commit) — hostapd/wpa_supplicant; almost no mainstream client-OS or enterprise-vendor adoption.
3. **Enrollment/registration flows** that create the MAC binding automatically (portal/SSO/QR) — Arista AGNI, Cambium ePSK-WPA3.
4. **Trial-and-error/tracking across handshakes** — hostapd wildcard entries (with retry cost).

Arista states the underlying break plainly: "With WPA3, it is no longer possible to tie the PSK to a MAC address [via the WPA2 cracking technique,] hence breaking existing implementations." — DOCUMENTED, [Arista UPSK app note](https://www.arista.com/assets/data/pdf/Whitepapers/How-Arista-UPSK-Overcomes-Challenges-App-Note.pdf) (PDF read in full, dated 2024-03-14).

---

## 1. HPE Aruba (AOS 8 / AOS 10, Central) — MPSK, MPSK Local, Cloud Auth

**Unique credentials under WPA3-SAE on one WLAN: NO.**

- **WPA2-only, stated verbatim:** "The MPSK passphrase works only with wpa2-psk-aes encryption and not with any other PSK-based encryption." — **DOCUMENTED**, [Aruba Central 2.5.8, "Support for MPSK in WLAN SSID" (aos10x wpa2_mpsk.htm)](https://arubanetworking.hpe.com/techdocs/central/2.5.8/content/aos10x/cfg/aps/wpa2_mpsk.htm) (via reader proxy). Note the doc's own filename is `wpa2_mpsk.htm`.
- The task's starting claim (Aruba's WPA3-Personal design page limits MPSK to WPA2-Personal): the page [wifi-design-deploy WPA3-Personal](https://arubanetworking.hpe.com/techdocs/aos/wifi-design-deploy/security/modes/wpa3-personal/) was fetched via proxy; it covers SAE/H2E and says WPA3-Personal is required "where WPA2-Personal is no longer allowed such as with 6 GHz operation and Wi-Fi 7," but the proxy-rendered copy contained no MPSK statement either way — the WPA2-only limitation is instead confirmed by the Central doc above. **DOCUMENTED (limitation), UNKNOWN (exact wording on that specific page).**
- **Variants (all WPA2):**
  - *MPSK Local:* "allows to configure 24 pre-shared keys per SSID without an external policy engine," per-key role → VLAN. — **DOCUMENTED**, [Configure MPSK Local, Central 2.5.7](https://arubanetworking.hpe.com/techdocs/central/2.5.7/content/aos10x/cfg/mb-deploy/mb_client_auth-mpsk.htm) (search snippet) and [solutiontechlab AOS10 MPSK part 1](https://solutiontechlab.com/2024/01/07/aruba-aos10-and-multiple-psks-mpsk-part1/) (fetched).
  - *Cloud Auth MPSK:* "Cloud Authentication requires AOS-10.4 and above software versions to support the MPSK feature"; "A maximum of 5000 MPSKs are supported in the foundation license"; user-managed vs admin-managed (named/registered) MPSK. — **DOCUMENTED**, [Central 2.5.8 MPSK Support](https://arubanetworking.hpe.com/techdocs/central/2.5.8/content/nms/access-points/cfg/networks/mpsk-support.htm) (via reader proxy).
  - *MPSK-AES with ClearPass:* RADIUS-driven (Aruba-MPSK-Passphrase VSA); "does not run into the 24 PSK per cluster limitation." — **DOCUMENTED** (search snippets of [ClearPass 6.12 Configuring MPSK](https://arubanetworking.hpe.com/techdocs/ClearPass/6.12/Guest/Content/AdministrationTasks1/Configuring-MPSK.htm) and Airheads threads).
- **Mechanism:** WPA2 4-way-handshake key deduction + MAC caching of the matched key across the cluster. **DOCUMENTED** (wpa2_mpsk.htm describes passphrase caching shared between cluster APs).
- **Randomized MAC:** named/user-managed Cloud Auth MPSK is not pre-bound to a MAC (any device presenting the key authenticates; MAC is cached after first use), so rotating MACs re-match on the next handshake — **INFERRED** from the WPA2 deduction mechanism.
- **6 GHz:** No — MPSK requires WPA2-PSK-AES and WPA2/PSK AKMs are prohibited on 6 GHz (see §10). **INFERRED** from two documented facts.
- **WPA3 MPSK roadmap:** community/blog references to "WPA3 MPSK in active development" ([Airheads: Should MPSK be its own SSID](https://community.arubanetworks.com/t5/Wireless-Access/Should-MPSK-be-its-own-SSID/td-p/530053), [Wi-Fi Vitae, 2024-07-31](https://wifivitae.com/2024/07/31/wi-fi-security-trends-from-aruba-central/)) — **INFERRED/weak**; no Aruba release note found announcing shipped WPA3 MPSK as of 2026-08-31.
- **Evidence quality: high** for the WPA2-only limitation (vendor doc, twice); medium for roadmap.

## 2. Juniper Mist — Multi PSK / PSK portal / Access Assurance

**Unique credentials under WPA3-SAE on one WLAN: YES (with hard preconditions).**

- **The exact statement:** Mist Access Assurance supports "WPA3 Multiple Passphrases (Multi-PSK)" on a single WPA3-Personal SSID. "WPA3 uses the Simultaneous Authentication of Equals (SAE) protocol, which enforces a mutual key exchange… For WPA3 Multi-PSK to function correctly, **the client's MAC address or MAC OUI must be pre-associated with the corresponding passphrase** to ensure a proper key match during authentication." — **DOCUMENTED**, [WPA3 RADIUS PSK Support in Juniper Mist Access Assurance](https://www.juniper.net/documentation/us/en/software/mist/mist-access/topics/task/access-assurance-wpa3-radius-psk.html) (fetched).
- **Mechanism:** SAE (not OWE); **RADIUS-based lookup only** ("WPA3-mPSK currently supports RADIUS-based lookup only" — [Configure and Manage Pre-Shared Keys](https://www.juniper.net/documentation/us/en/software/mist/mist-wireless/topics/concept/wireless-multi-psk.html), fetched: "With WPA2, there are two methods of MPSK lookup… Local and RADIUS. With WPA3, you can enable RADIUS PSK"). MAC/OUI → PSK binding must be pre-created; "Client onboarding is not currently supported with WPA3 Multi-PSK… All PSK entries must be manually created." Unregistered MACs fall back to the WLAN's default PSK and a default VLAN (999 if unspecified). Org-level WLAN + PSKs only. **DOCUMENTED.**
- **Requirements:** AP firmware **0.14.x or later**, **Access Assurance Standard (or higher)** subscription. Juniper lists WPA3 support across its AP line (AP12/32/33/41/43/61/63…); the WPA3-mPSK doc gates on firmware + subscription rather than naming AP models. **DOCUMENTED** (firmware/subscription), **UNKNOWN** (any per-model exclusions).
- **Randomized MAC:** Mist explicitly markets WPA2 Multi-PSK as randomization-proof (no MAC pre-binding needed — [Mist IoT Assurance Multi PSK](https://www.mist.com/documentation/mist-iot-assurance-multi-psk/)); WPA3 Multi-PSK reverses that: the mandatory MAC/OUI pre-association means a client that rotates its MAC lands on the default PSK/VLAN. **DOCUMENTED** (mechanism) / **INFERRED** (consequence — docs don't spell out the randomized-MAC failure mode for WPA3).
- **6 GHz:** not addressed in the WPA3-mPSK doc. Since the mechanism is pure SAE with pre-commit key selection, nothing in it is band-incompatible, but no vendor statement found. **UNKNOWN.**
- **Per-credential VLAN/policy:** yes — each PSK entry carries VLAN ID and role; "Dynamic VLANs" must be enabled. **DOCUMENTED.**
- **Scale:** WPA2 local lookup "up to 5000 PSKs per AP"; "more than 5000 PSKs at the organization level" with Access Assurance. No separate WPA3-mPSK figure published. **DOCUMENTED / UNKNOWN (WPA3-specific limit).**
- **Evidence quality: high** — the mechanism, preconditions and limitations are in current Juniper docs.

## 3. Cisco Meraki — iPSK (with and without RADIUS)

**Unique credentials under WPA3-SAE on one WLAN: NO.**

- **iPSK without RADIUS:** "IPSK without RADIUS does not support WPA3 encryption." Scale: "up to 50 IPSKs per SSID in… MR 27.X, 28.X, and 29.X… up to 5,000 IPSKs per SSID in… MR 30.1 and newer." Group policy per PSK via dashboard. — **DOCUMENTED**, [IPSK Authentication without RADIUS](https://documentation.meraki.com/Wireless/Design_and_Configure/Configuration_Guides/Encryption_and_Authentication/IPSK_Authentication_without_RADIUS) (search snippets; page itself 404'd at one alternate URL — verified via the canonical URL's snippets).
- **6 GHz:** dashboard behavior: selecting iPSK without RADIUS shows "This SSID will not be broadcast on the 6 GHz band. Use OWE to enable this band." Meraki staff/community explanation: trying multiple PSKs per connect "was prohibited by design in WPA3, where only one PSK can be checked on each connect." — **DOCUMENTED** (community thread with dashboard text), [Meraki community: iPSK without Radius not compatible with 6ghz?](https://community.meraki.com/t5/Wireless/iPSK-without-Radius-not-compatible-with-6ghz/m-p/180334).
- **iPSK with RADIUS:** "IPSK with Radius Authentication does not support WPA3." Classic mode = MAB: "If the PSK matches the RADIUS server's entry for the client's MAC address, the wireless client is authenticated," with RADIUS-returned VLAN override supported. — **DOCUMENTED**, [IPSK with RADIUS Authentication](https://documentation.meraki.com/Wireless/Design_and_Configure/Configuration_Guides/Encryption_and_Authentication/IPSK_with_RADIUS_Authentication) (fetched).
- **Randomized MAC / Easy PSK:** the same doc concedes "many wireless clients implement MAC randomization… further complicating this approach," and introduces **Easy PSK (MR 32.1.3+)**: the AP forwards Meraki vendor-specific attributes carrying EAPOL handshake parameters and the RADIUS server "performs a dictionary attack against the known number of configured iPSKs" — i.e., no MAC pre-registration needed. **DOCUMENTED.** Easy PSK is built on the WPA2 4-way-handshake derivation, so it cannot extend to SAE — **INFERRED**.
- **Meraki's own WPA3 guide** ([WPA3 Encryption and Configuration Guide](https://documentation.meraki.com/Wireless/Design_and_Configure/Configuration_Guides/Encryption_and_Authentication/WPA3_Encryption_and_Configuration_Guide), fetched) discusses SAE, H2E ("Wi-Fi 6E (6 GHz) and Wi-Fi 7 requires Hash-to-Element as mandatory") and never offers an iPSK+WPA3 combination. **DOCUMENTED (absence).**
- **Evidence quality: high** — both iPSK docs carry explicit "does not support WPA3" statements.

## 4. Cisco Catalyst 9800 + ISE — Identity PSK

**Unique credentials under WPA3-SAE on one WLAN: YES (since IOS-XE 17.9.2, RADIUS-bound, MAC-identity-based).**

- **Feature:** "WPA3 — SAE H2E with Identity PSK", introduced in **Cisco IOS XE 17.9.2**: "Support for Identity PSK (iPSK) passphrase for SAE H2E authentication in local mode… iPSK replaces WLAN passphrase during SAE H2E authentication when configured." Mechanism: "The iPSK passphrase is configured in the client authorization policy in the RADIUS server" (ISE authorization result carrying `cisco-av-pair` psk-mode/psk attributes); during **MAB** (MAC filtering / MAC Authentication Bypass) the policy pushes the per-client passphrase to the controller, which then runs SAE H2E against that passphrase. — **DOCUMENTED**, [Catalyst 9800 17.9 config guide, WPA3 chapter](https://www.cisco.com/c/en/us/td/docs/wireless/controller/9800/17-9/config-guide/b_wl_17_9_cg/m_wpa3.html) (via reader proxy) + [17.15 release notes](https://www.cisco.com/c/en/us/td/docs/wireless/controller/9800/17-15/release-notes/rn-17-15-9800.html) (search snippet).
- **Prereq context:** H2E support for SAE arrived in IOS-XE 17.7.1 (`sae pwe {h2e|hnp|both-h2e-hnp}`). Classic (WPA2) iPSK on 9800 is the long-standing ISE flow ([Configure Catalyst 9800 WLC iPSK with ISE](https://www.cisco.com/c/en/us/support/docs/wireless/catalyst-9800-series-wireless-controllers/216130-configure-catalyst-9800-wlc-ipsk-with-ci.html)) — Local mode and FlexConnect (central auth + local switching); "Local Authentication is not supported." The SAE-H2E-iPSK feature text says **local mode**. **DOCUMENTED** (local mode); **UNKNOWN** (whether later releases extended SAE-iPSK to FlexConnect).
- **Randomized MAC:** the entire flow keys off the client MAC (MAB before SAE). A client rotating its MAC gets whatever the ISE policy returns for an unknown MAC (typically reject or default PSK policy). Not addressed by Cisco in the iPSK-SAE text. **INFERRED.**
- **6 GHz:** 6 GHz WLANs on 9800 are WPA3/H2E-only ("the 6-GHz band supports only H2E SAE PWE method" — [Configure and Verify Wi-Fi 6E WLAN Layer 2 Security](https://www.cisco.com/c/en/us/support/docs/wireless/catalyst-9800-series-wireless-controllers/220712-configure-and-verify-wi-fi-6e-wlan-layer.html)). SAE-H2E iPSK is mechanically compatible, and MAC-filtering WLANs are configurable on 6 GHz, but **no Cisco statement explicitly blessing iPSK on a 6 GHz WLAN was found** — **UNKNOWN/INFERRED-compatible**.
- **Per-credential VLAN/policy:** yes — the ISE authorization result can carry VLAN/SGT/ACL alongside the psk av-pair (standard iPSK behavior). **DOCUMENTED** (classic iPSK doc).
- **Scale:** bounded by ISE endpoint DB, not a WLC key table; no published per-WLAN key limit found. **UNKNOWN.**
- **Evidence quality: high** for existence and release (named feature in config guide + release notes); medium on restrictions detail (cisco.com blocks direct fetch; guide read via proxy).

## 5. Extreme Networks ExtremeCloud IQ (IQ Engine APs) — PPSK / Private Client Groups

**Unique credentials under WPA3-SAE on one WLAN: NO.**

- **User guide:** "Private Pre-Shared Key requires users to authenticate by entering a PPSK unique to each user **(not available for 6 GHz)**." On 6 GHz only WPA3-Enterprise, WPA3-Personal (single passphrase) and Enhanced Open are offered. — **DOCUMENTED**, [ExtremeCloud IQ User Guide, SSID Authentication](https://documentation.extremenetworks.com/XIQ/user_guide/GUID-17C96C05-7DBA-46E8-BAE7-B83731DA5704.shtml) (fetched).
- **Why:** community answer (Extreme forum, PPSK and 6GHz thread): "PPSK relies on WPA2 Personal because WPA2 Personal allows the reverse-engineering of the passphrase based on it contributing to the master session key. WPA3 does not allow that." — **DOCUMENTED** (community, via search snippet; the thread page itself 403'd direct fetch), [PPSK and 6GHz](https://community.extremenetworks.com/t5/extremecloud-iq/ppsk-and-6ghz/m-p/96584).
- **Mechanism (WPA2):** classic Aerohive PPSK — per-user keys, derivation at the AP (local PPSK) or **Cloud Auth PPSK** (key check in XIQ cloud); optional MAC binding per key (limit devices per PPSK); **Private Client Groups** (IQ Engine 6.5r3+) give each PPSK user an isolated "personal network" segment on a shared SSID. — **DOCUMENTED** (XIQ UG + release notes referencing Local PPSK with Private Client Groups and Cloud PPSK, e.g. [XIQ Classic 25.5.1-15 release notes](https://documentation.extremenetworks.com/ExtremeCloud%20IQ%20Classic%20v25.5.1-15%20Release%20Notes/downloads/ExtremeCloud_IQ_Classic_25_5_1_15_Release_Notes.pdf)).
- **WPA3 status through 2025/2026 releases:** XIQ Classic 25.5.1-15 (Oct 2025) added WPA3-Personal **Transition Mode** across 2.4/5/6 GHz — for single-passphrase WPA3-Personal, not PPSK; no release note found announcing PPSK-over-SAE. **DOCUMENTED (absence as of 2026-08-31).**
- **Randomized MAC:** PPSK without MAC binding tolerates rotation (key re-derived per handshake, WPA2 trick); MAC-bound PPSKs and Private Client Groups depend on stable MACs. **INFERRED.**
- **Per-credential VLAN/policy:** yes — PPSK user groups map to user profiles/VLANs; Private Client Groups add per-key segmentation. **DOCUMENTED.**
- **Evidence quality: high** (vendor UG states the 6 GHz exclusion; staff statement explains the WPA2 dependency).

## 6. Arista (Mojo/Cognitive Wi-Fi, CloudVision CUE + AGNI) — UPSK

**Unique credentials under WPA3-SAE on one WLAN: YES (enrollment-created MAC binding via AGNI).**

- **Headline:** "In addition to increased security over PSK, Arista's UPSK solution works for **both WPA2 and WPA3**." — **DOCUMENTED**, [App note: How Arista's UPSK Overcomes the Challenges of WPA3](https://www.arista.com/assets/data/pdf/Whitepapers/How-Arista-UPSK-Overcomes-Challenges-App-Note.pdf) (PDF read in full; dated 2024-03-14).
- **Mechanism:** Arista concedes SAE kills the WPA2-cracking approach ("SAE is not susceptible to the WPA2 cracking method") and manual MAC registration "does not scale" — so AGNI (Arista Guardian Network Identity) keys device registration on the **user's SSO identity**, then ties client MACs to the user's UPSK Group via: (1) onboarding-PSK + self-service portal (IDP login → user shown their UPSK → device MAC registered), (2) QR-code onboarding, (3) admin/delegated import of MACs into Client Groups for headless/IoT. The result is still a MAC→PSK binding at SAE time — but the binding is *created by enrollment*, not by handshake cracking. **DOCUMENTED** (app note, all three flows quoted).
- **Segmentation:** MSS-G UPSK (AGNI only; "Third party NACs do NOT support MSS-G UPSK segmentation") — per-UPSK private networks on a single SSID and single VLAN; same-UPSK clients reach each other + a Shared Client Group (printers), others isolated. **DOCUMENTED.**
- **CUE SSID settings** list "WPA3 Personal, UPSK, or WPA3 Enterprise" as WPA3 options. — **DOCUMENTED**, [CV-CUE SSID Settings](https://www.arista.com/en/ug-cv-cue/cv-cue-ssid-settings) (search snippet).
- **Randomized MAC:** each new (randomized) MAC must pass the onboarding flow again to join the UPSK Group; the app note's whole premise is making per-MAC registration painless rather than avoiding it. **INFERRED** from documented flows.
- **6 GHz:** not addressed in the app note. Arista sells Wi-Fi 6E APs (C-360 line); no explicit "UPSK on 6 GHz" statement found. **UNKNOWN.**
- **Scale:** not published in the materials reviewed. **UNKNOWN.**
- **Evidence quality: high** for WPA3 support + mechanism (primary-source app note); low for 6 GHz/scale.

## 7. Cambium — ePSK

**Unique credentials under WPA3-SAE on one WLAN: YES (since Enterprise release 6.6.1, registration-flow based).**

- **Release evidence:** Enterprise Software Release **6.6.1** new-features list includes "**ePSK support for WPA3**"; firmware for XV2-2, XV2-2TX, XE3-4, XV2-21X, XV2-22H, XV2-23T, XV3-8, XE5-8 (Wi-Fi 6/6E APs). — **DOCUMENTED**, [Cambium community: Enterprise Software Release 6.6.1](https://community.cambiumnetworks.com/t/enterprise-software-release-6-6-1/101410) (fetched). Earlier staff commitment (Apr 2024): "yes we will have WPA3 support for ePSK with our Wi-Fi 6/6E and 7 APs. Launching beta in May timeframe." — [So what's the Plan for ePSK and WiFi7](https://community.cambiumnetworks.com/t/so-whats-the-plan-for-epsk-and-wifi7/98637) (fetched).
- **Mechanism:** a **registration flow**, per the same thread/guide: "For WPA3 clients to connect to the network using ePSK flow: First connect to the WLAN with the WLAN passphrase… [get redirected and] register themselves with the WPA3-ePSK unique passphrase," then reconnect with the personal ePSK. Cambium staff: "Mac Linking is not required" (the registration creates whatever binding the AP needs). — **DOCUMENTED** (community/staff), with the caveat that the underlying key-selection detail (post-registration MAC binding vs identifier) is **not published — UNKNOWN**.
- **Field maturity:** thread reports (through Mar 2026) of firmware issues and a clunky client experience (manual profile deletion/re-entry on some clients). **DOCUMENTED (community-reported), low weight.**
- **Randomized MAC:** a rotated MAC presents as an unregistered client → back through the WLAN-passphrase + registration flow. **INFERRED.**
- **6 GHz:** XE3-4/XE5-8 are 6 GHz APs and are in the 6.6.1 support list, but no explicit "ePSK-WPA3 on the 6 GHz radio" statement found. **UNKNOWN.**
- **Per-credential VLAN/policy & scale:** classic ePSK supports per-key VLAN and thousands of keys managed by cnMaestro at WLAN level ([ePSK community feature thread](https://community.cambiumnetworks.com/t/epsk-multiple-pre-shared-keys/62609)); WPA3-specific limits not published. **DOCUMENTED (WPA2 ePSK) / UNKNOWN (WPA3 figures).**
- **Evidence quality: medium** — release note names the feature; mechanism detail lives in community posts, not a config-guide page we could fetch.

## 8. Fortinet FortiAP / FortiOS — MPSK

**Unique credentials under WPA3-SAE on one WLAN: YES (FortiOS 7.4.4+/7.6.0, per-key MAC binding).**

- **The old position (verify of "MPSK incompatible with SAE"):** confirmed — Fortinet's Wi-Fi 6/7 design guide: "One downside to WPA3-SAE is if your network already uses Multiple Pre-Shared Key (MPSK) since **the SAE mechanism breaks what enables MPSK**," recommending WPA3-SAE Transition (WPA3 clients on the SAE password, WPA2 clients on MPSK) as the workaround. — **DOCUMENTED**, [Advantages of WPA3-SAE, FortiAP 7.4.0 Wi-Fi 6/7 design guide](https://docs.fortinet.com/document/fortiap/7.4.0/wifi-6-7-design-and-planning-guide/355840/advantages-of-wpa3-sae).
- **The new position:** "Support WPA3-SAE and WPA3-SAE Transition security modes in MPSK profiles" — **CLI in FortiOS 7.4.4, GUI in FortiOS 7.6.0**; "This feature requires FortiAP to run firmware 7.6.0 or later." Mechanism: per-key **MAC binding** plus per-key key-type — `config mpsk-key … set mac f8:e4:e3:d8:5e:af / set key-type [wpa2-personal|wpa3-sae]`; transition mode mixes both key types in one profile; `dynamic-vlan enable` referenced. — **DOCUMENTED**, [FortiOS 7.6.0 new features: WPA3-SAE in MPSK profiles](https://docs.fortinet.com/document/fortigate/7.6.0/new-features/756471/support-wpa3-sae-and-wpa3-sae-transition-security-modes-in-mpsk-profiles) (fetched).
- **RADIUS variant:** "Support RADIUS MAC Authentication for MPSK on WPA3 SAE SSID" added in **FortiOS 7.4.5** — RADIUS returns the per-client key after MAC auth. — **DOCUMENTED**, [FortiOS 7.4.5 new feature page](https://docs.fortinet.com/document/fortigate/7.4.0/new-features/488019/support-radius-mac-authentication-for-mpsk-on-wpa3-sae-ssid-7-4-5) (search result title/URL; page not deep-fetched).
- **Randomized MAC:** WPA3-SAE MPSK keys are MAC-bound (or RADIUS-MAC-resolved) → rotated MACs won't match their key. **INFERRED.**
- **6 GHz:** feature pages pitch this as "enabling the use of MPSK on Wi-Fi 6 and 7 SSIDs"; no explicit 6 GHz-radio statement captured. **UNKNOWN/INFERRED-compatible** (pure SAE + MAC binding has no band dependency).
- **Per-credential VLAN/policy:** MPSK groups/keys with dynamic VLAN support. **DOCUMENTED (referenced), detail not captured.**
- **Scale:** classic FortiOS MPSK supports large key counts via mpsk-profiles/groups; WPA3-specific limit not captured. **UNKNOWN.**
- **Evidence quality: high** — named new-feature pages with version gates and CLI.

## 9. hostapd / wpa_supplicant (open-source reference)

**Unique credentials under WPA3-SAE on one BSS: YES — the reference implementation, two native mechanisms.**

Source: `hostapd/hostapd.conf` documentation. Direct upstream (w1.fi) is behind an anti-bot wall (Anubis) as of 2026-08-31; the text below was extracted from two independent full mirrors of the file (Android `platform/external/wpa_supplicant_8` via googlesource, and the DGNum gitea mirror — both 3,444-line copies, hostap ~2.11 era). **DOCUMENTED**, with that provenance caveat.

- **Multiple `sae_password` entries** (verbatim): "Each sae_password entry is added to a list of available passwords. This corresponds to the dot11RSNAConfigPasswordValueEntry. sae_password value starts with the password… followed by optional peer MAC address (dot11RSNAConfigPasswordPeerMac) and by optional password identifier (dot11RSNAConfigPasswordIdentifier). In addition, an optional VLAN ID specification can be used to bind the station to the specified VLAN whenever the specific SAE password entry is used."
  - Encoding: `<password>[|mac=<peer mac>][|vlanid=<VLAN ID>][|pk=<m:ECPrivateKey-base64>][|id=<identifier>]`.
  - Wildcard: "If the peer MAC address is not included or is set to the wildcard address (ff:ff:ff:ff:ff:ff), the entry is available for any station to use."
  - Selection: "The last matching (based on peer MAC address and identifier) entry is used to select which password to use."
  - Bulk file: `sae_password_file=` — one entry per line, same format.
  - So: **per-device WPA3 passwords via `|mac=`**, and **per-password SAE Password Identifiers via `|id=`** (client signals the identifier in SAE Commit — wpa_supplicant supports `sae_password_id`; mainstream OS supplicants generally do not, cf. [Microsoft Q&A: no WPA3 Password Identifier field in Windows](https://learn.microsoft.com/en-us/answers/questions/3807227/no-wpa3-password-identifier-field-in-the-wi-fi-man)). Per-entry VLAN via `|vlanid=` with `dynamic_vlan`.
- **`wpa_psk_file` is WPA-PSK only** (verbatim): "Optionally, WPA PSKs can be read from a separate text file (containing list of (PSK,MAC address) pairs. This allows more than one PSK to be configured." It feeds the WPA2 4-way-handshake matching path; SAE uses the separate `sae_password` list ("If the BSS enabled both SAE and WPA-PSK and both values are set, SAE uses the sae_password values and WPA-PSK uses the wpa_passphrase value"). — **DOCUMENTED**.
- **RADIUS-based selection — WPA2 path only:** `wpa_psk_radius` (0/1/2 with `macaddr_acl=2`, Tunnel-Password in Access-Accept as passphrase or 64-hex PSK; mode "3 = ask RADIUS server during 4-way handshake if there is no locally configured PSK/passphrase for the STA"). Mode 3 is inherently a 4-way-handshake mechanism; **no RADIUS-based SAE password selection is documented** in the copies reviewed. — **DOCUMENTED (text) / DOCUMENTED-absence (SAE)**.
- **`sae_track_password`:** could **not** be verified — the parameter does not appear in either accessible mirror of hostapd.conf, and upstream w1.fi was unreachable to automation. Treat as **UNKNOWN** (if present upstream it is newer than the mirrored copies). Related upstream work that *is* verifiable: "SAE: Make H2E work with multiple passwords" patch series ([hostap list via spinics](https://www.spinics.net/lists/hostap/msg08588.html)) and a Jan-2025 hostap-list thread on mixed WPA2-PSK/WPA3-SAE access control ([infradead archive](https://lists.infradead.org/pipermail/hostap/2025-January/043243.html)).
- **Randomized MAC:** `|mac=`-bound entries break on rotation; wildcard entries work for any MAC (multiple wildcard SAE passwords are iterated across handshake attempts — a practical demo is [supernetworks.org SPR multi-PSK WPA3 write-up](https://www.supernetworks.org/pages/blog/multipsk%20and%20wpa3): "Authenticating a password requires an interactive zero knowledge proof, so a new handshake is required to try a different password"). **DOCUMENTED.**
- **6 GHz:** hostapd supports SAE/H2E (`sae_pwe=1|2`) as required for 6 GHz operation; sae_password mechanics are band-independent. **INFERRED.**
- **Evidence quality: high**, with the mirror-provenance caveat and one UNKNOWN (`sae_track_password`).

## 10. Wi-Fi Alliance — WPA3 Specification v3.5 (the rulebook)

Source: [WPA3 Specification v3.5 PDF](https://www.wi-fi.org/system/files/WPA3%20Specification%20v3.5.pdf) (© 2025 Wi-Fi Alliance; downloaded and text-extracted in full, 55 pp). All items **DOCUMENTED** with section numbers.

- **§11.2 Constraints in the 6 GHz band — AP:** shall not allow TKIP; "shall not be configured in WPA3-Personal Transition Mode"; shall not allow 802.1X SHA-1 AKM (⇒ no WPA3-Enterprise Transition Mode); "shall be PMF Required (MFPC=1, MFPR=1)"; "shall not allow the SAE Hunting and Pecking mechanism" (⇒ **H2E only**); no OWE Transition Mode element.
- **§11.2 — STA on 6 GHz:** "shall not allow: WEP, TKIP, **any PSK (or FT PSK) AKM**, 802.1X SHA-1 AKM, or the SAE Hunting and Pecking mechanism"; must negotiate PMF. ⇒ **Every WPA2-handshake-based multi-PSK scheme is structurally impossible on 6 GHz; only SAE-based schemes qualify.**
- **§11.3 (Wi-Fi 7/EHT/MLO):** no PSK AKM or 802.1X SHA-1 in any association that negotiates EHT or MLO, on **any** band — the same wall reaches 2.4/5 GHz for Wi-Fi 7 links.
- **§2.2 WPA3-Personal Only Mode:** SAE AKMs only (00-0F-AC:8/24), PSK AKMs prohibited, PMF Required. **§2.3 Transition Mode:** PSK+SAE coexist, PMF Capable — "an AP does not operate a BSS in WPA3-Personal Transition Mode in the 6 GHz band." **§2.4 Compatibility Mode (RSN Overriding):** advertises PSK in the RSNE on 2.4/5 GHz with SAE in RSNE Override; on 6 GHz advertises SAE only.
- **SAE Password Identifiers:** the spec builds on IEEE 802.11's `dot11RSNAConfigPasswordValueTable` (multiple passwords per BSS, each optionally with an identifier). v3.5 references identifiers in the SAE-PK context (§6: credentials optionally include "an SAE Password Identifier, which identifies the above credentials"; §6.5.1 "If the AP enables SAE Password Identifiers, this applies for each password identifier") and in the **WIFI URI** (§7): `id = "I:" *(printable / pct-encoded) ; UTF-8 encoded password identifier, present if the password has an SAE password identifier` — i.e., QR-code provisioning can carry a per-user password identifier. IEEE 802.11 (REVmd) requires **H2E whenever a Password Identifier is used** (noted in hostap development history; the v3.5 text itself governs identifiers mainly via SAE-PK and URI provisioning). Multi-password-per-BSS is thus *standardized*; what's missing industry-wide is client-side identifier support.
- **Wi-Fi Easy Connect / DPP:** the WPA3 v3.5 text contains **no DPP/Easy Connect references** (verified by full-text grep). Per-device provisioning is a separate WFA program: [Wi-Fi Easy Connect Specification v3.0](https://www.wi-fi.org/system/files/Wi-Fi_Easy_Connect_Specification_v3.0.pdf), whose DPP Configuration Object supports `akm: "sae"` with a per-device SAE passphrase — the standards-track way to hand each device its own WPA3 credential (or a per-device DPP Connector, AKM 00-0F-AC:22) without a shared onboarding secret. **DOCUMENTED** (spec exists and provisions SAE credentials; details from spec + search corroboration).

---

## Cross-vendor verdict table

| Vendor / stack | Unique creds under WPA3-SAE, one WLAN | Mechanism | Randomized MAC | 6 GHz | Per-cred VLAN/policy | Scale (documented) | Evidence |
|---|---|---|---|---|---|---|---|
| Aruba AOS 8/10 + Central | **No** (WPA2-PSK-AES only) | WPA2 handshake key-match + MAC caching | Tolerant (re-match per handshake) | No (needs WPA2) | Yes (role→VLAN per key) | 24/SSID local; 5,000 Cloud Auth | High |
| Juniper Mist | **Yes** (Access Assurance) | SAE + mandatory MAC/OUI→PSK pre-registration, RADIUS lookup only | Breaks → default PSK/VLAN | Not stated | Yes (VLAN+role per PSK) | 5,000/AP (WPA2 local); >5,000 org (AA) | High |
| Cisco Meraki | **No** | WPA2 only (both modes); Easy PSK = RADIUS-side dictionary attack (WPA2) | Easy PSK solves it (WPA2 only) | Refused (SSID not broadcast on 6 GHz) | Yes (group policy per PSK) | 50 → 5,000/SSID (MR 30.1+) | High |
| Cisco Catalyst 9800 + ISE | **Yes** (IOS-XE ≥17.9.2) | MAB → ISE returns per-client psk av-pair → SAE H2E with that key; local mode | Breaks (MAB is MAC identity) | Mechanically compatible; not explicitly documented | Yes (full ISE authz result) | ISE-bound; no WLC figure | High/medium |
| Extreme XIQ (IQ Engine) | **No** | WPA2 PPSK (local or cloud auth), Private Client Groups | Tolerant unless MAC-bound | No ("not available for 6 GHz") | Yes (user groups/profiles; PCG) | Thousands (platform-dependent) | High |
| Arista CV-CUE + AGNI | **Yes** | SSO-identity enrollment (portal/QR/import) auto-creates MAC→UPSK-group binding; SAE | New MAC re-onboards via portal | Not stated | Yes; MSS-G per-UPSK segmentation on one VLAN | Not published | High (mechanism) |
| Cambium | **Yes** (release 6.6.1) | Onboard-with-WLAN-passphrase → register personal ePSK; "MAC linking not required" | Re-registration flow | XE APs supported; radio not stated | Yes (classic ePSK per-key VLAN) | Not published for WPA3 | Medium |
| Fortinet | **Yes** (FortiOS 7.4.4 CLI / 7.6.0 GUI; FortiAP FW 7.6.0+) | Per-key MAC binding + per-key key-type (wpa2/wpa3-sae); RADIUS MAC variant 7.4.5 | Breaks (MAC-bound keys) | Pitched for Wi-Fi 6/7 SSIDs; radio not stated | Dynamic VLAN referenced | Not published | High |
| hostapd | **Yes** (reference impl.) | `sae_password` list: `\|mac=` binding, `\|id=` SAE Password Identifiers, wildcard iteration; `\|vlanid=` | mac= breaks; wildcard works | SAE/H2E supported; band-independent | Yes (`\|vlanid=` + dynamic_vlan) | No hard doc limit | High |
| WFA WPA3 v3.5 | (rulebook) | Multi-password per BSS standardized (802.11 password table + identifiers); DPP provisions per-device SAE creds | §10 privacy annex acknowledges randomization | SAE+H2E+PMF only; no PSK AKM, no transition modes | n/a | n/a | High |

## Bottom-line synthesis

1. **The WPA2 free lunch is over.** Every legacy MPSK/iPSK/DPSK/PPSK works by deriving the used key from the WPA2 4-way handshake — an approach the WFA has now walled off from 6 GHz entirely (no PSK AKM, §11.2) and from every Wi-Fi 7 EHT/MLO association on any band (§11.3).
2. **Every shipping WPA3 multi-credential product reduces to "pick the SAE password by MAC before the handshake."** They differ only in who owns the MAC→key table (Mist: cloud RADIUS; Cisco: ISE; Fortinet: FortiGate profile; hostapd: config file) and in how the table gets populated (manual — Mist/Fortinet; SSO-portal enrollment — Arista; passphrase-registration flow — Cambium; RADIUS policy — Cisco).
3. **MAC randomization is therefore the new central weakness**: the same rotation that WPA2-era schemes shrugged off (re-derive on the next handshake; Meraki even automated it with Easy PSK) now silently drops WPA3 multi-PSK clients to default keys/VLANs or rejects them, unless an enrollment loop (Arista, Cambium) or client-side "per-network fixed MAC" hygiene closes the gap.
4. **The standards-track exits — SAE Password Identifiers and Wi-Fi Easy Connect (DPP) per-device SAE provisioning — remain unimplemented by every enterprise vendor surveyed**; hostapd/wpa_supplicant is the only stack in this matrix that ships them today.
