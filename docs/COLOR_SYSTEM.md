# AURA color system

AURA's palette is built on the **Extreme Platform ONE (EP1)** brand colors. This document
covers where those colors come from, how to use them, and what has and has not been
verified.

## Where the colors come from

The source of truth is the **EP1 template values captured in `src/lib/themes.ts`** — the
`ep1` theme block, annotated *"Exact Extreme Platform ONE template values"*. Those were
lifted from a real EP1 template and are the only verified Extreme brand colors in this
repository.

`src/config/colorPalette.ts` builds everything from that root. Each color is marked:

- **`[captured]`** — verbatim from the EP1 template.
- **`[derived]`** — computed from the captured set, preserving hue and saturation while
  walking lightness until it clears a contrast target. Used for light-theme variants and
  for extra chart hues the template did not supply.

Nothing else is legitimate. If you cannot trace a color to one of those two categories,
it does not belong in the palette.

> **A note on history.** Prior to August 2026 this palette was Tailwind CSS's default
> colors (`green-500`, `amber-500`, `red-500`, `blue-500`, …) documented as though it
> were the Extreme Design System, complete with contrast figures that had never been
> computed — one pair was published at 14.85:1 when it measures 2.18:1. If you find a
> stray `#22c55e` or `#3b82f6`, it is a leftover from that period, not a brand value.
> `colorPalette.test.ts` guards against the palette regressing to those values.

## The EP1 brand primitives

| Token | Value | Role |
|---|---|---|
| `EP1_BRAND.purple` | `#8981e5` | Interactive purple — the brand accent |
| `EP1_BRAND.purpleLight` | `#aba3fb` | Hover / raised state |
| `EP1_BRAND.purpleActive` | `#7b74d4` | Pressed state |
| `EP1_BRAND.navy` | `#1e1a46` | Text on brand; info surface |
| `EP1_BRAND.green` | `#75bf63` | Success |
| `EP1_BRAND.amber` | `#E5B85C` | Warning |
| `EP1_BRAND.red` | `#ed5f56` | Error |

All `[captured]`.

## Light vs dark — the thing that trips people up

**EP1 is a dark design language.** Its colors are drawn for the `#1e1f2a` / `#2d2f3e`
surfaces and most of them fail contrast on white:

| Color | On `#1e1f2a` | On white |
|---|---|---|
| success `#75bf63` | 7.31:1 ✅ AAA | 2.24:1 ❌ fails even 3:1 |
| warning `#E5B85C` | 8.83:1 ✅ AAA | 1.85:1 ❌ fails even 3:1 |
| critical `#ed5f56` | 4.96:1 ✅ AA | 3.30:1 ⚠️ graphics only |
| info `#8981e5` | 4.93:1 ✅ AA | 3.31:1 ⚠️ graphics only |

So every light-sensitive token ships two values — the EP1 base, and a hue-matched
darkened variant for the light theme:

| Token | Light variant | On white |
|---|---|---|
| `STATUS_COLORS_LIGHT.success` | `#438035` | 4.80:1 ✅ AA |
| `STATUS_COLORS_LIGHT.warning` | `#946b18` | 4.80:1 ✅ AA |
| `STATUS_COLORS_LIGHT.critical` | `#d92317` | 5.00:1 ✅ AA |
| `STATUS_COLORS_LIGHT.info` | `#665cdd` | 5.07:1 ✅ AA |

**Do not pick between these by hand.** Use the resolvers.

## Using the palette

```ts
import { resolveStatusColor, resolveCategoricalColor } from '@/config/colorPalette';
import { usePaletteTheme } from '@/hooks/usePaletteTheme';

function HealthDot({ status }: { status: 'success' | 'warning' | 'critical' | 'info' }) {
  const theme = usePaletteTheme();
  return <span style={{ background: resolveStatusColor(status, theme) }} />;
}
```

`usePaletteTheme()` reads `data-theme` off `<html>` (owned by `App.applyTheme`) and
re-renders on change, so a leaf component gets the right value with no prop drilling.

Available resolvers, all `(token, theme) => string`:

- `resolveStatusColor(token, theme)` — success / warning / critical / info
- `resolveBandColor(band, theme)` — `'2.4'` / `'5'` / `'6'`
- `resolveProtocolColor(protocol, theme)` — `be` / `ax` / `ac` / `n` / `legacy` / `other`
- `resolveCategoricalColor(index, theme)` — chart series and category legends, wraps

Reading the raw token objects (`STATUS_COLORS.success`) is fine when the surface is known
to be dark — SLE views, for instance. It is a bug anywhere the light theme can render it.

## Semantic assignments

**Wi-Fi protocol** — newest standard carries the brand purple:

| Protocol | Color | |
|---|---|---|
| Wi-Fi 7 (`be`) | `#8981e5` | `[captured]` brand purple |
| Wi-Fi 6 (`ax`) | `#59c0c0` | `[derived]` teal |
| Wi-Fi 5 (`ac`) | `#75bf63` | `[captured]` green |
| Wi-Fi 4 (`n`) | `#E5B85C` | `[captured]` amber |
| Legacy a/b/g | `#babcce` | `[captured]` muted — de-emphasised |
| Other | `#7C8098` | `[captured]` disabled |

**Bands** — newest spectrum carries the brand purple. All `[captured]`:
2.4 GHz `#E5B85C` · 5 GHz `#75bf63` · 6 GHz `#8981e5`

**SNR quality** — monotonic good → bad. All `[captured]`:
excellent `#75bf63` · good `#8981e5` · fair `#E5B85C` · poor `#ed5f56`

## The categorical ramp

`EP1_CATEGORICAL` is a 14-color ordered list for pie slices, series lines and category
legends. `DONUT_COLORS` is its first ten.

The four captured semantic hues anchor the ramp; the rest fill gaps around the color
wheel at EP1's own saturation/lightness envelope (S 40–55%, L 55–66%) so they read as one
family. Ordering is brand-forward: a three-slice chart gets purple / green / amber, not
three derived colors.

**Separability is a ΔE question, not a contrast one.** Two colors can share a luminance
and still be obviously different hues — teal and lilac in this ramp differ by only 1.04:1
in contrast but sit ΔE 62 apart, and nobody would confuse them. Use `getDeltaE` from
`lib/colorValidator` for this, never `getContrastRatio`.

Verified: minimum pairwise distance ΔE 13.1, well above the ~2.3 just-noticeable
threshold; every entry clears 3:1 as a graphical object on the EP1 base surface.

A donut wraps, so the last slice sits against the first — both ends are checked. This is
why `purpleActive` is absent from the ramp: it sits ΔE 5.4 from the brand purple and read
as the same slice.

## Contrast: what is checked, and against what

WCAG 2.1 thresholds:

- **4.5:1** — AA, normal text
- **7:1** — AAA, normal text
- **3:1** — 1.4.11 non-text contrast; **this is the bar for chart fills and strokes**, not 4.5

Applying the text threshold to a chart mark is a common mistake and produces a palette
that is needlessly dark. Applying the graphical threshold to text is the more serious
mistake in the other direction.

Every claim in `colorPalette.ts` is enforced by `src/config/colorPalette.test.ts`. If you
change a value and it drops below its threshold, the test fails. **Do not update the
comment to match a regression** — that is how the previous documentation ended up
asserting numbers nobody had computed.

To measure something yourself:

```ts
import { getContrastRatio, getDeltaE, validateWCAGContrast } from '@/lib/colorValidator';

getContrastRatio('#75bf63', '#1e1f2a');              // 7.31
getDeltaE('#8981e5', '#7b74d4');                     // 5.4 — too close to be separate categories
validateWCAGContrast(fg, bg, 'graphic');             // { pass, ratio, required: 3, level }
```

## Themes

| Theme | Surface | Status colors |
|---|---|---|
| `default` (light) | white | EP1 hues darkened for white — `STATUS_COLORS_LIGHT` |
| `dark` | `#1e1f2a` | EP1 base |
| `ep1` | `#1e1f2a` / `#2d2f3e` | EP1 base (this is the source theme) |
| `dev` | `#121212` | **Material Design — deliberately not EP1** |

The `dev` theme replicates the OS-ONE gateway's Material look. It is intentionally a
different design language and should not be converted to EP1.

## Migration status

Done — these render EP1 colors today:

- `config/colorPalette.ts` and everything importing it (AP Insights, Client Insights,
  Client Protocol widget, RoamingTrail, AFC Planning)
- `types/sle.ts` → the Service Levels dashboard
- `lib/themes.ts` → `--status-*` CSS variables in the light and dark themes
- `AppInsights`, `PerformanceAnalytics`, `report/ReportWidgetRenderer`

Not done:

- Roughly 180 hardcoded hex values remain scattered across other components. Find them
  with `grep -rn "#[0-9a-fA-F]\{6\}" src --include="*.tsx"`, then use
  `getColorCompliance(hex)` to see whether a token already covers the value.
- Most components read the raw token objects rather than the resolvers, so their chart
  marks use dark-tuned colors in the light theme. This is not a regression — it matches
  the previous behaviour — but it is the next thing worth fixing. Migrate by adding
  `usePaletteTheme()` and switching to `resolve*Color`.
