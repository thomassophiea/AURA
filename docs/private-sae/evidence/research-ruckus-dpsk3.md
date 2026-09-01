# RUCKUS DPSK3 — Competitive Architecture Research

**Prepared:** 2026-08-31 · All URLs accessed 2026-08-31 unless noted.
**Evidence labels:** `DOCUMENTED` = official RUCKUS/CommScope doc or datasheet · `INFERRED` = secondary source or deduction · `UNKNOWN` = no reliable source found.

## Source-access note (read first)

The two seed URLs on `docs.commscope.com` now **301-redirect to `docs.vistancenetworks.com`**, and the SmartZone bundles there redirect again to a gated "Technical Content Portal" (`https://www.vistancenetworks.com/technical-content-portal/`) — i.e., the SmartZone 7.x HTML doc set is effectively paywalled/moved as of 2026-08-31. The **RUCKUS One doc set remains fully public at `docs.cloud.ruckuswireless.com`**, and the RUCKUS One page that mirrors the first seed URL (same GUID) was retrieved verbatim. The Alcadis PDF mirror of SmartZone release notes (7.0.0/7.1.0) is also dead (redirects to alcadis.nl); SmartZone release-note claims below rest on search-index snippets of those PDFs and are labeled accordingly.

Primary sources actually retrieved in full:

- **[R1-DPSK]** RUCKUS One User Guide, "Creating a Network That Uses a Dynamic Pre-Shared Key" — https://docs.cloud.ruckuswireless.com/ruckusone/userguide/GUID-45CA3127-0AC3-45D8-BD45-1E2CD65C84FD.html (full raw HTML captured; same GUID as the docs.commscope seed URL)
- **[R1-PASS]** "Managing DPSK Passphrase" — https://docs.cloud.ruckuswireless.com/ruckusone/userguide/GUID-23D2CBB0-8C02-4818-94F9-4C79AF4D1E01.html
- **[R1-ADDPASS]** "Adding a Passphrase for a DPSK User" — https://docs.cloud.ruckuswireless.com/ruckusone/userguide/GUID-411433D9-F85D-46CB-A24F-828295FB1FCE.html
- **[R1-SVC]** "Adding a DPSK Service" — https://docs.cloud.ruckuswireless.com/ruckusone/userguide/GUID-BA6FCADB-B405-45BC-A11A-8CCF644098D8.html (via search snippet of the same official page)
- **[R1-RN]** RUCKUS One Release Notes, "New Features" — https://docs.cloud.ruckuswireless.com/ruckusone/releasenotes/GUID-DE876DEB-A93F-4294-B13A-6330F2B7B477.html and GUID-06EA39C9-FD51-4A6F-B7F2-DB17BEF64614.html
- **[MDU-BLOG]** RUCKUS blog (official), "Managed Wi-Fi Solution for MDU using WPA3 on 6 GHz? Yes, we can!" (2025) — https://www.ruckusnetworks.com/blog/2025/ruckus-one-the-all-in-one-managed-wi-fi-solution-for-mdu/
- **[DPSK-TECH]** RUCKUS technology page, "Dynamic PSK (Pre-Shared Keys)" — https://www.ruckusnetworks.com/technologies/RUCKUS-Security-Innovations/Dynamic-Pre-Shared-Key-PSK/
- **[SZ51-GEN]** SmartZone 5.1 Administrator Guide, "Generating Dynamic PSKs" — https://docs.ruckuswireless.com/smartzone/5.1/sz100-vsze-administrator-guide/GUID-1A5752B1-CAEC-467B-8BE8-F058DA93EE4A.html
- **[REDWAY]** Third-party whitepaper: Lee Wright (Senior Network Engineer, Redway Networks), *"Analysis of Multiple PSK in the context of WPA3"* — https://144943261.fs1.hubspotusercontent-eu1.net/hubfs/144943261/Analysis%20of%20Multiple%20PSK%20in%20the%20context%20of%20WPA3.pdf (full PDF read, 15 pp.)
- **[RGNETS]** rgnets blog, "Evolution and Cryptographic Challenges of Multi-Pre-Shared Key" — https://www.rgnets.com/blog/3
- **[PURPLE]** Purple.ai vendor comparison, "Per-Device PSK by Vendor: iPSK, DPSK, MPSK and PPSK…" — https://www.purple.ai/en-gb/guides/per-device-psk-by-vendor-wpa3-support

---

## Q1. Does DPSK3 support WPA3-SAE with unique per-user/per-device passphrases on ONE WLAN?

**Verdict: Yes with a load-bearing asterisk — DPSK3 is DPSK under WPA2/WPA3 *mixed mode* on one SSID, never a pure WPA3-only WLAN.** — `DOCUMENTED`

[R1-DPSK], verbatim:

> "DPSK leverages WPA2 security protocols. DPSK3 is the next-generation evolution of DPSK and uses WPA2/WPA3 mixed mode to enhance security and maintain compatibility with supported devices."

> "When you select **WPA2/WPA3 mixed mode**, the network operates as a DPSK3 network."

The security-protocol picker for a DPSK network offers exactly three options: `WPA2 (Recommended)` (default), `WPA` (legacy), and `WPA2/WPA3 mixed mode`. **There is no WPA3-only option for DPSK.** So a WPA3-SAE client with its own unique passphrase on one SSID is genuinely supported — but the SSID is always simultaneously a WPA2 transition-mode SSID, and (see Q2) the WPA2 side is not optional decoration: it is how the binding works.

Marketing framing [DPSK-TECH], verbatim: "For advanced networks using WPA3-SAE, RUCKUS offers Dynamic PSK3™, combining the flexibility of Dynamic PSK with the strength of next-gen encryption." — `DOCUMENTED` (marketing page; the mixed-mode caveat above is what the configuration doc actually enforces).

## Q2. How does it work at the protocol level — how does the AP pick the SAE password?

**Verdict: in-band enrollment over WPA2, then per-device binding for SAE.** The zero-knowledge problem is not solved cryptographically; it is side-stepped by requiring every device's *first* connection to ride the WPA2 leg (where the classic try-each-key MIC match on 4-way-handshake message 2 identifies the passphrase), after which the passphrase is "bound" to the device and SAE connections are permitted.

- `DOCUMENTED` — [R1-DPSK], verbatim: "**Wi-Fi 6E clients must first connect by using the 2.4 GHz or 5 GHz band to bind the passphrase** and then connect to the DPSK service network by using the 6 GHz radio."
- `DOCUMENTED` — [R1-DPSK], verbatim: "For DPSK3 networks, **a service network and an associated onboard network are created with the same SSID**. You can modify only the service network; the onboard network is managed automatically." (The auto-managed "onboard network" is the enrollment leg.)
- `INFERRED` (well-sourced secondary) — [REDWAY] p.11, verbatim: "Ruckus Networks, part of CommScope, offers another solution. **The DPSK3 solution uses WPA2 to 'Bound' the client to the DPSK Service, then WPA3 is used. DPSK3 requires the client device to first connect to 2.4 or 5GHz, and subsequent 6GHz connections are permitted.** … This solution does not require MAC Addresses to be known in advance."
- `INFERRED` — how the AP then selects the SAE password: after the WPA2 bind, the infrastructure holds a device→passphrase mapping and can present the correct single password to SAE for that station. [RGNETS] states the industry-wide shape: "If the WAP selects the wrong password to derive its Commit message, the handshake will fail immediately," and notes all major vendors (Cisco, Aruba, Ruckus, Mist) converged on identifying the client *before* SAE — "an architectural inversion — in WPA2, the key identified the user; in WPA3, the MAC address does." The most economical reading is a **MAC-keyed lookup of the bound passphrase**; RUCKUS does not publish the lookup key. No RUCKUS source mentions use of the 802.11 **SAE Password Identifier** element (client-OS support for it is effectively nil), and no source describes SAE-commit iteration.
- `DOCUMENTED` (mechanism branding) — [MDU-BLOG]: RUCKUS calls the underlying innovation "**Dynamic SAE (DSAE)**," a patented mechanism from "early 2023," and claims to be "the first vendor in the industry to offer a multiple password solution on the new 6 GHz band **without RADIUS**." The blog does not disclose the protocol internals.
- `DOCUMENTED` (external-auth variant) — [R1-DPSK]: when DPSK3 uses an external server, it must be Cloudpath: "**Cloudpath is required when WPA2/WPA3 mixed mode is selected**" and "DPSK networks using WPA2/WPA3 mixed mode support only a Cloudpath RADIUS Server configured in proxy mode…". [PURPLE] paraphrases the same: "DPSK3 allows WPA3-capable devices to use SAE while the system manages per-device key binding through the Cloudpath integration."
- `UNKNOWN` — whether the WPA2 onboard leg and WPA3 service leg are separate BSSIDs, how the AP steers an unbound WPA3-capable client to complete the WPA2 handshake (mixed-mode clients prefer SAE via the transition-mode AKM), and the exact patent number for DSAE.

## Q3. Randomized / private MAC clients

- `DOCUMENTED` (positioning, classic DPSK) — RUCKUS's public position is that DPSK is MAC-independent: "RUCKUS DPSK is a unique key that identifies the device user, not the MAC address, to the network" (RUCKUS-authored article reproduced at net-ctrl.com, "So, What's the Big Deal about MAC Randomization? Part 2," https://www.net-ctrl.com/so-whats-the-big-deal-about-mac-randomization-part-2/). Unbound/Group DPSKs exist precisely so multiple (or changing) MACs can share one passphrase; Cloudpath eDPSK "can handle multiple MAC addresses associated with one DPSK."
- `DOCUMENTED` (DPSK3 marketing) — [MDU-BLOG]: the DSAE/DPSK3 solution "defeats MAC Randomization" because "segmentation is achieved through the uniqueness of the password, independent of the MAC address."
- **No RUCKUS document found that requires disabling MAC randomization for DPSK3.** — `DOCUMENTED` absence across the retrieved doc set.
- `INFERRED` tension worth exploiting competitively: if SAE password selection is keyed on the station identity established at bind time (Q2), then **every new randomized MAC is an unbound device again** and must redo the WPA2 2.4/5 GHz bind before SAE/6 GHz works. Per-network ("stable") randomization is fine after one bind; per-connection rotating MACs (iOS "rotating" mode, some Android 13+ configs) would force repeated re-binds through the WPA2 leg. No RUCKUS doc addresses the rotating-MAC case for DPSK3. — `UNKNOWN` at the official-doc level.

## Q4. 6 GHz operation

- `DOCUMENTED` — supported, but never alone. [R1-DPSK], verbatim: "**Radio Band Limitation: Do not configure 6 GHz–only operation; use the 6 GHz band together with 2.4 GHz or 5 GHz.**" And the bind rule: "Wi-Fi 6E clients must first connect by using the 2.4 GHz or 5 GHz band to bind the passphrase and then connect to the DPSK service network by using the 6 GHz radio."
- `DOCUMENTED` (marketing) — [MDU-BLOG]: DSAE/DPSK3 is "fully compatible with the 6 GHz band," per-user PSK on 6 GHz "without RADIUS."
- `INFERRED` (secondary, consistent) — [REDWAY] p.11: "**6GHz-only clients are not compatible with DPSK3.** … 6GHz capable clients may experience issues connecting, as the client device controls the decision to connect to 2.4, 5 or 6GHz, not the WLAN infrastructure or the user. In addition, **using WPA2 for the initial authentication reduces the overall security of this solution.**"
- Context: [REDWAY] p.8: "The Wi-Fi Alliance mandates WPA3 for all 6GHz connections," which is why WPA2-based multi-PSK cannot exist on 6 GHz at all — DPSK3's bind-then-SAE dance is the workaround.

## Q5. Scale limits

- **Classic DPSK (SmartZone)** — `DOCUMENTED`: [SZ51-GEN] "You can generate up to a maximum of 500 Unbound or Group DPSKs" per batch; SZ 5.1+ supports 25,000 DPSKs per zone (earlier 3.4–3.6 releases: 10,000/zone; SZ100 datasheet: 20,000 system / 10,000 per zone; community thread "How to increase DPSK per zone limit?" https://community.ruckuswireless.com/t5/SmartZone-and-Virtual-SmartZone/How-to-increase-DPSK-per-zone-limit/m-p/46032 corroborates the version matrix).
- **RUCKUS One DPSK service** — `DOCUMENTED`: per-pool "Devices allowed per passphrase: Unlimited or Limited … 1 through 50" [R1-SVC]; per-passphrase override "Set number (1-512)" with pool-inheritance rule: "You can increase this value for an individual passphrase, but you cannot set a lower value than the one defined in the pool" [R1-ADDPASS]. (The 50 vs 512 spread is what the two official pages say; RUCKUS's own pages are inconsistent — flag when citing.)
- **DPSK3-specific maximum key counts (per WLAN/zone/AP when WPA3 is enabled)** — `UNKNOWN`. No retrieved official source states a reduced (or any) DPSK cap specific to DPSK3. This is a prime probe question for a competitive bake-off, since MAC-bound SAE state per AP is the natural bottleneck.

## Q6. Where passphrases live and how they reach APs

- `DOCUMENTED` — three homes depending on deployment: (a) **controller-resident** ("internal") DPSK on SmartZone/ZoneDirector — "Ruckus Legacy DPSK creates dynamic pre-shared keys on the Ruckus WLAN controller" (Cloudpath Legacy DPSK Configuration Guide, https://support.ruckuswireless.com/documents/4263-cp_es-5-11-ga-ruckus-legacy-dpsk-configuration-guide); (b) **cloud-resident** DPSK service in RUCKUS One [R1-DPSK: "Use the DPSK Service"]; (c) **external** on Cloudpath, consulted via RADIUS ("eDPSK") — [R1-DPSK] and Best Practices Design Guide: Cloudpath External DPSK and SmartZone DPSK (PDF, gated: https://support.ruckuswireless.com/documents/3976-best-practices-design-guide-cloudpath-external-dpsk-and-smartzone-dpsk).
- `DOCUMENTED` (indirect) — [MDU-BLOG]'s "without RADIUS" claim for DSAE means the SAE-capable key material must be resolvable at AP/controller level without an external lookup in the RUCKUS One native case.
- `INFERRED` — SmartZone marketing describes authentication/association surviving at the AP when the controller is unreachable, implying DPSK material (or derived state) is pushed to APs for internal DPSK; RUCKUS publishes no explicit key-distribution mechanics for DPSK3. — distribution details `UNKNOWN`.

## Q7. Per-DPSK VLAN / policy / identity under WPA3

- `DOCUMENTED` (DPSK generally): per-key VLAN — [SZ51-GEN] "Type a VLAN ID within the range 1-4094"; per-key User Role assignment (SZ); RUCKUS One per-passphrase VLAN: "The device is placed on this VLAN after authenticating to the Wi-Fi network. If this field is left empty, the network's default VLAN is used" [R1-ADDPASS]; passphrases attach to **Identities** with per-identity views [R1 "Managing DPSK User Details", GUID-E9E6972D].
- `DOCUMENTED` (under DPSK3 specifically, marketing-level): [MDU-BLOG] describes per-tenant private VLANs riding DSAE on 6 GHz: "All devices belonging to a single tenant can communicate with each other, while preventing access to other tenants' devices," plus per-tenant public IP.
- `INFERRED`: the R1 DPSK-network doc [R1-DPSK] applies its VLAN/identity machinery to the DPSK network type regardless of the security-protocol selection, and nothing in it carves out an exception for mixed mode — so per-passphrase VLAN under DPSK3 appears to carry over; no page states it explicitly for the SAE leg.

## Q8. Revocation and expiration

`DOCUMENTED` — [R1-PASS]: "Click **Revoke or Unrevoke** to block or restore network access for devices using the selected passphrase." Expiration at pool level: "Never expires, By date… or After (…Hours, Days, Weeks, Months, or Years)" [R1-SVC]; per-passphrase override "Same as pool (default)" or "By date" [R1-ADDPASS]; passphrase list shows "Expires: … Displays Unlimited if no expiration date is configured" [R1-PASS]. CSV export/import of passphrases supported [R1-PASS]. Nothing DPSK3-specific found on revocation latency (e.g., whether an in-session SAE client is deauthed on revoke) — `UNKNOWN`.

## Q9. The "WPA2/WPA3 mixed mode" claim — exactly what is claimed, and the caveats

**Claim (verbatim, [R1-DPSK]):** "DPSK3 … uses WPA2/WPA3 mixed mode to enhance security and maintain compatibility with supported devices. DPSK3 provides seamless user and device management and maintains backward compatibility with WPA2 devices."

**Documented caveats, all from [R1-DPSK] unless noted:**

1. **No WPA3-only DPSK.** Mixed mode *is* DPSK3; there is no stricter option.
2. **IPv4 only:** "For DPSK3 networks, only IPv4 is supported." / "External DPSK3 (Cloudpath) supports IPv4 format only."
3. **Cloudpath-only external auth:** "WPA or WPA2 can use a standard RADIUS Server or Cloudpath, but **Cloudpath is required when WPA2/WPA3 mixed mode is selected**."
4. **RadSec contradiction in the same doc:** one note says "DPSK networks using WPA2/WPA3 mixed mode support only a Cloudpath RADIUS Server configured in proxy mode **with RadSec enabled**"; another says "only a Cloudpath RADIUS Server configured in proxy mode with the Enable RadSec (over TLS) option **disabled** is supported." The published page carries both statements — quote-checkable inconsistency.
5. **AP floor:** "Use access points that support Wi-Fi 6, 6E, or 7 and are running firmware version 7.0.0.103.292 or later"; "This mode applies only to supported AP models. The configuration does not apply to unsupported AP models" (silent non-deployment on older APs).
6. **No band balancing:** "DPSK3 networks do not support band balancing."
7. **Hidden twin network:** service + auto-managed onboard network share the SSID; only the service network is editable.
8. **First-connection band rule** (Q2/Q4) and **no 6-GHz-only operation**.
9. `INFERRED` ([REDWAY]): transition mode means "using WPA2 for the initial authentication reduces the overall security of this solution" — the WPA3 guarantees (offline-dictionary resistance, forward secrecy) do not cover the mandatory WPA2 bind leg.

**Platform availability timeline** — `INFERRED` (community/search snippets; PDFs now unreachable): DPSK3 shipped first on RUCKUS One (release notes, April 2024 era: "RUCKUS One now supports WPA3 for DPSK networks" [R1-RN]); RUCKUS staff in the community said "DPSK3 (WPA3+DPSK) is currently only supported on RUCKUS One" and "will be supported on an upcoming SmartZone version" (not 6.1.2) (threads: https://community.ruckuswireless.com/t5/Access-Points-Indoor-and-Outdoor/WPA3-amp-DPSK/m-p/53619 and …/R560-DPSK3/m-p/73417 — JS-rendered, content via search index). SmartZone 7.0.0 release notes list DPSK3 as a feature ("allocates a unique Wi-Fi password to every device within a network, employing WPA3 security") with "a limitation in the deployment of DPSK3" noted in Patch 1; SmartZone 7.1.0 release notes list a "Dynamic Pre-Shared Key version 3 (DPSK3) enhancement" and an MLO-tag-in-beacon fix on DPSK3 WLANs (RUCKUS-SZ-7.0.0/7.1.0 Release Notes PDFs, formerly at support.alcadis.nl mirror, now 301; canonical copy gated at https://support.ruckuswireless.com/documents/4945).

## Q10. Client onboarding — how users get their DPSK

`DOCUMENTED` (RUCKUS One): admin creates Identities and passphrases (auto-generated or manual; "Most Secured" format = all printable ASCII) [R1-SVC]; bulk CSV import/export [R1-PASS]; delivery by **email/SMS** ("Click **Send DPSK Info** to manually send an SMS or email containing network and credential information"; auto-send on creation supported) and **QR code**; a **resident/self-service portal** lets end users "quickly onboard devices using the passphrase or QR code provided, view devices that have used the passphrase, delete devices, reset the residences passphrase, reset the onboarding URL, and change email and mobile number" (RUCKUS One release notes GUID-06EA39C9; "Accessing the Resident Portal" GUID-1157C2F6). `DOCUMENTED` (Cloudpath): self-service enrollment workflows issue per-user DPSKs, incl. QR generation (community how-to: https://community.ruckuswireless.com/t5/RUCKUS-Self-Help/Cloudpath-How-to-generate-QR-code-for-DPSK-SSID-in-the-workflow/m-p/69958). Legacy SmartZone/ZoneDirector: Zero-IT onboarding portal (https://support.ruckuswireless.com/articles/000002009).

---

## Competitive read (synthesis, `INFERRED`)

DPSK3 is best characterized as **WPA2-anchored enrollment with a WPA3-SAE steady state**: unique-per-device SAE passwords are real, but only after a WPA2 4-way-handshake key-identification pass on 2.4/5 GHz establishes the device→passphrase binding — hence no WPA3-only SSID, no 6-GHz-only radios, no 6-GHz-only clients, and a permanent WPA2 attack surface on the transition SSID. The "no RADIUS, defeats MAC randomization" DSAE marketing is true of the *identity model* (the passphrase is the identity) but silent on the *SAE selection path*, which per all available protocol analysis must key on a station identifier learned at bind time; rotating-MAC clients therefore degrade to repeated re-binds. Cloudpath lock-in applies whenever external authentication is wanted under mixed mode. Published hard numbers (25k DPSK/zone, 500/batch, 1–50/512 devices per passphrase) all predate or ignore DPSK3; no DPSK3-specific scale figure exists publicly.
