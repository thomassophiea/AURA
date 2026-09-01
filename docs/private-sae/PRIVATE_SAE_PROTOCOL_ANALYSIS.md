# Private SAE — protocol analysis

**Date:** 2026-09-01 · Sources: on-hardware evidence (`evidence/sae-hardware-evidence-2026-09-01.md`),
IEEE 802.11-2020 / RFC 7664, hostapd/wpa_supplicant source docs, WFA WPA3 spec, and the three
research reports in `evidence/`. Every external claim carries a label in those reports;
DOCUMENTED / INFERRED / UNKNOWN is used here for load-bearing points.

## The one constraint everything follows from

SAE (RFC 7664 / 802.11) is a **balanced PAKE**. Its whole security value is that a passive or
active observer learns nothing about the password, and neither peer proves knowledge until the
Confirm exchange. Concretely (DOCUMENTED, RFC 7664 + hostapd source):

1. Each side derives a password element (PWE, or with H2E a password token PT→PWE) **from the
   password** before the exchange.
2. The **AP must choose which password's PWE it will use before or at its own Commit.**
3. The client's Commit is a scalar+element over its chosen password and **reveals nothing about
   which password it is** — that is the anti-dictionary property.

Therefore, on a WLAN with more than one password, the AP **cannot infer from the Commit which
password the client used.** It must decide by some out-of-band key *before* it commits. The
only three ways that exist:

| Selector | How | Client support | Verdict |
|---|---|---|---|
| **(a) Password Identifier** | client puts a cleartext identifier element in its Commit; AP looks up the matching `sae_password\|id=` | **None on mainstream OSes** (see below) | Elegant, DEAD for a product |
| **(b) MAC-based lookup** | AP selects `sae_password\|mac=<STA>` by the station's MAC before committing | Native (client just needs the password) | **The only viable selector — and what every vendor ships** |
| **(c) Trial-and-error** | AP runs a full SAE per candidate (`sae_track_password`) | Native | ~2–3 passwords max, "looks like an attack" to the STA — not scalable |

This is the pivot of the entire investigation. Everything below is consequence.

## Why (a) Password Identifiers cannot be the product

- Signalled in the SAE **Commit** as a **cleartext** element (DOCUMENTED). A passive sniffer
  reads every user's identifier over the air; unknown identifiers get status 123 back, also in
  the clear. 802.11bi is reworking this privacy hole. So identifiers are not even confidential.
- Using an identifier **forces H2E** regardless of `sae_pwe` (DOCUMENTED, hostapd + supplicant
  docs) — an identifier deployment excludes non-H2E clients on top of everything else.
- **No mainstream client can enter or be provisioned with one** (DOCUMENTED, source-verified):
  absent from Windows 11 WLAN profile XML, Apple `com.apple.wifi.managed` MDM payload, Android
  `WifiConfiguration`/`WifiNetworkSuggestion` (the HAL has `setSaePasswordId`, but the framework
  field `mSaePasswordId` is declared and never written — dead plumbing), ChromeOS ONC, and
  NetworkManager. Only wpa_supplicant (`sae_password_id=`) speaks it.
- hostapd's own docs call trial-and-error a "workaround until SAE with password identifiers is
  deployed on STAs" — the maintainers treat client absence as the standing fact (DOCUMENTED).
- WFA WPA3 Technology Overview never mentions identifiers — optional, apparently uncertified.

On hardware we **confirmed the AP side works** (E2: `alpha`/`bravo` loaded, PT per password).
The AP is not the problem. The clients are, and Aura cannot ship a feature that needs a custom
supplicant on every phone and laptop.

## Why (b) MAC-based lookup is the industry answer — and its one cost

Every shipping WPA3 multi-password product selects the password **by MAC before the handshake**
(DOCUMENTED across vendors — see `COMPETITIVE_PRIVATE_SAE_MATRIX.md`). They differ only in who
owns the MAC→password table and how it gets populated:

- **RUCKUS DPSK3 ("Dynamic SAE"):** client first connects on a hidden WPA2 leg (2.4/5 GHz) that
  **binds the passphrase to it**, then the AP presents that bound passphrase to SAE. WPA2/WPA3
  **mixed mode only**; "Do not configure 6 GHz-only"; 6 GHz-only clients are not compatible.
- **Cisco 9800 + ISE:** MAB returns a per-client `psk` av-pair that replaces the WLAN passphrase
  *before* SAE runs (WPA3-SAE-H2E iPSK, IOS-XE 17.9.2+). MAC-keyed.
- **Juniper Mist:** Access Assurance "RADIUS PSK" — SAE with mandatory MAC/OUI→passphrase
  pre-registration; unregistered MACs fall to a default PSK.
- **Fortinet:** MPSK WPA3-SAE with per-key MAC binding.
- **Arista UPSK / Cambium ePSK:** an SSO/QR/registration enrollment flow creates the
  MAC→credential binding, so the "first connect" isn't a WPA2 crack but an explicit enrollment.

The cost is the same for all of them, and it is the exact thing the brief forbids ignoring:
**the selector is the MAC, so a randomized/rotating MAC has no binding until it (re-)enrolls.**
This is not an Extreme problem; it is a property of SAE. The mitigation is an **enrollment loop**
that (re)binds the *current* MAC to the credential — and the fact that Apple and Android default
to a **stable per-SSID** MAC (only re-randomized on "forget network") makes re-enrollment a rare
event, not a per-connection tax.

**Identity therefore lives in the credential + the enrollment record, never in the MAC.** The MAC
is a cache key for one selector lookup, refreshed by enrollment. That satisfies "identity survives
randomized MAC" the same way every competitor satisfies it.

## Where this leaves RADIUS

The working PPSK path uses **no RADIUS at all** (`CURRENT_PPSK_TRACE.md`): identity resolves
inside the 4-way handshake by candidate-PMK match against a local `wpa_psk_file`. That trick is
**WPA2-only** — it depends on being able to try every PMK against the handshake MIC after the
fact. SAE has no equivalent: the AP must pick before it commits. So:

- **The existing RADIUS-PPSK exchange cannot be reused for SAE** — because there *is* no RADIUS
  in the working PPSK path, and because the WPA2 candidate-match mechanism has no SAE analogue.
- If Aura adds RADIUS for SAE, it would be a **MAC-Auth (MAB) Access-Request before the
  handshake** returning the per-station SAE password (the Cisco/Mist shape). That is selector
  (b) with a RADIUS-hosted table. hostapd's `wpa_psk_radius` is the WPA2 form of this and is
  **MAC-keyed**; the SAE form needs the AP to consume a RADIUS-returned `sae_password` pre-Commit
  (a Campus OS enhancement — see requirements doc).

## H2E, PMF, 6 GHz, roaming — the mandatory envelope

- **6 GHz (DOCUMENTED, WFA WPA3 v3.x §11):** SAE + **H2E mandatory**, **PMF required**, **no PSK
  AKM**, **no transition mode**. Confirmed against the controller model: `WpaSaeElement.pmfMode`
  is readOnly `"required"`. On hardware both AP and client used H2E (Derive PT). So a 6 GHz WLAN
  is SAE-only by law — there is no WPA2 fallback leg *on 6 GHz*. (RUCKUS's WPA2 enrollment leg
  runs on 2.4/5 GHz precisely because it can't exist on 6 GHz.)
- **Wi-Fi 7 EHT/MLO (DOCUMENTED):** bans PSK AKMs on **all** bands — WPA2-era multi-PSK is
  structurally dying on new silicon, which makes the SAE path strategic, not optional.
- **PMF/anti-clogging:** AP binary carries anti-clogging tokens and `sae_require_mfp`. Multiple
  candidate passwords do **not** multiply SAE CPU when selector (b) is used — the AP derives one
  PWE for the selected password, not all of them. (Trial-and-error (c) is the only variant that
  multiplies CPU, another reason to reject it.)
- **Roaming (DOCUMENTED):** FT-SAE and PMKSA caching are in the AP binary; the per-user lookup is
  a once-per-mobility-domain cost, then cached. Not a scaling problem.

## The protocol verdict

- **True "one WPA3-SAE WLAN, many passwords, selected purely by the credential with no MAC and
  no client-side identifier" is impossible by the SAE construction.** Not hard — impossible. No
  vendor does it; none can.
- **"Private SAE" as the market actually ships it** = MAC-bound `sae_password` + an enrollment
  loop that binds the current MAC. **The Campus OS AP already has every primitive for this**
  (E1/E2, proven). The missing pieces are entirely **controller-side**: emit the
  `sae_password` set, select by MAC (or accept a RADIUS-returned password pre-Commit), reload on
  change, and report the matched identity — plus **Aura owning the enrollment + credential
  lifecycle.** That is the same shape as the PPSK gap, one protocol generation forward.
