/**
 * A suggested prompt is a promise the product makes before the operator has
 * typed anything. If clicking one produces "I can't read that", the panel has
 * taught them not to trust the next answer either.
 *
 * These prompts drifted once already: they were written against
 * `server/cortex/toolCatalog.js` — the FALLBACK loop — and advertised SLE
 * thresholds, Smart RF history and drift alerts. The primary path
 * (`/api/cortex/investigate` → investigationAgent → diagnosticTools) has none
 * of those tools, so three of the shipped suggestions could not be answered at
 * all. Nothing caught it, because nothing checked.
 *
 * This suite is that check. It asserts against the live tool surface rather
 * than a transcription of it, so deleting a tool fails the suite too.
 */
import { describe, it, expect } from 'vitest';
import { CORTEX_SUGGESTED_PROMPTS, CORTEX_PAGE_TYPES } from './cortex';
import { SUGGESTED } from '../components/AgentCoworker/panels/ConversationStream';
// The label map in diagnosticTools.js is the authoritative roster: the
// "adding a tool" checklist requires an entry, so a tool cannot exist without
// appearing here.
import { TOOL_ACTIVITY } from '../../server/cortex/diagnosticTools.js';

const LIVE_TOOLS = Object.keys(TOOL_ACTIVITY as Record<string, string>);

/**
 * Concepts the primary tool surface cannot produce. Each entry names the
 * absence, so a failure explains itself instead of just rejecting a word.
 *
 * Every pattern here was verified against diagnosticTools.js, not assumed.
 */
const UNANSWERABLE: { pattern: RegExp; because: string; unless?: RegExp }[] = [
  {
    pattern: /\bSLE\b/i,
    // SLE is reachable ONLY as getMetricHistory({ metricFamily: 'sle' }), which
    // compares two stored windows. There is no current-SLE read, no threshold
    // read (those live in server/sle/thresholdsRouter.js and per-browser
    // localStorage) and no category breakdown — so an SLE prompt is honest only
    // when it asks for a comparison against an earlier window.
    unless: /compare|yesterday|earlier|last (week|month)|same window/i,
    because:
      'the only SLE tool is getMetricHistory, which compares two stored windows — there is no current SLE value, no threshold to compare against, and no category breakdown',
  },
  {
    pattern: /\bbelow (SLE|threshold)/i,
    because: 'Cortex cannot read the operator-configured thresholds to compare against',
  },
  {
    pattern: /smart ?rf/i,
    because:
      'there is no Smart RF tool on the primary path; getApSmartRf/getSiteSmartRf exist only in the fallback toolCatalog',
  },
  {
    pattern: /\bDFS\b/i,
    because: 'no tool returns DFS events',
  },
  {
    pattern: /drift alert/i,
    because: 'getDriftAlerts exists only in the fallback toolCatalog',
  },
  {
    pattern: /channel utilization/i,
    because:
      'getRfHealth returns a four-way airtime split per RADIO, and ChannelUtilizationAdjusted is only the co-channel component — "channel utilization" invites the model to report a different measurement than the one asked for',
  },
  {
    pattern: /data rate/i,
    because: 'per-client data rate is not exposed; loss is the usable signal',
  },
  {
    pattern: /how long .*(been down|offline)/i,
    because:
      'AP inventory carries status but no downtime duration, and a removed AP vanishes rather than showing as down',
  },
  {
    // "how many clients are on each?" carries no noun after "each" — the first
    // draft required one and let the shipped prompt through. Per-BAND and
    // per-RADIO counts are fine: getRfHealth returns clients per radio with the
    // band attached. It is the per-WLAN count that no tool produces.
    pattern:
      /clients? (are )?on each(?! (band|radio))\b|client (count|load).*(SSID|WLAN)|(SSID|WLAN).*client (count|load)/i,
    because: 'getWlanConfig returns no per-WLAN client count',
  },
  {
    pattern: /\bwhy\b.*\b(reboot|deauth|reject|disconnect)/i,
    because: 'reason codes are not exposed over REST — only that the event happened',
  },
  {
    pattern: /\bcontroller\b|\bXIQ-?C\b/i,
    because: 'product vocabulary: this is a Gateway',
  },
];

/** The rule a prompt trips, or null when nothing objects to it. */
function unanswerableRule(prompt: string) {
  return (
    UNANSWERABLE.find(
      (rule) => rule.pattern.test(prompt) && !(rule.unless && rule.unless.test(prompt))
    ) ?? null
  );
}

/** Every prompt the panel can show, tagged with where it came from. */
const ALL_PROMPTS: { where: string; prompt: string }[] = [
  ...Object.entries(CORTEX_SUGGESTED_PROMPTS).flatMap(([pageType, prompts]) =>
    prompts.map((prompt) => ({ where: `CORTEX_SUGGESTED_PROMPTS.${pageType}`, prompt }))
  ),
  ...SUGGESTED.map((prompt) => ({ where: 'ConversationStream.SUGGESTED', prompt })),
];

describe('Cortex suggested prompts — every suggestion is answerable', () => {
  it('the tool roster it is written against is the live one', () => {
    // Guards the premise of the whole suite. If these vanish, the prompts that
    // lean on them are unanswerable and the reviewer needs to know here.
    expect(LIVE_TOOLS).toEqual(
      expect.arrayContaining([
        'getSiteOverview',
        'getRfHealth',
        'getApHealth',
        'getWlanConfig',
        'getRecentChanges',
        'getClientTimeline',
        'diagnoseClient',
        'compareClientToPeers',
        'correlateProblem',
        'listSites',
        'getMetricHistory',
        'findVanishedDevices',
        'getCapabilities',
      ])
    );
  });

  it.each(ALL_PROMPTS)('$where: "$prompt"', ({ prompt }) => {
    const hit = unanswerableRule(prompt);
    expect(
      hit ? `"${prompt}" cannot be answered: ${hit.because}` : null
    ).toBeNull();
  });

  it('rejects the prompts that actually shipped broken', () => {
    // The detector has to be shown failing, or a green run proves nothing.
    // These are verbatim from the table this suite replaced.
    const shippedBroken = [
      'Which sites are below SLE threshold right now? Rank them worst to best.',
      'Which AP in this network has the highest channel utilization? Show me the top 5.',
      'Which APs triggered smart RF channel changes in the last 24 hours and why?',
      "Show this AP's smart RF history -- channel changes, power adjustments, DFS events.",
      'Are there any active drift alerts or config changes I should know about?',
      'Which SSIDs are live right now and how many clients are on each?',
      'Which site has the worst SLE performance over the last 7 days? Break down by category.',
      'Which APs are offline right now? Show serial, site, and how long they have been down.',
      "What is this client's current signal strength, data rate, and which radio it is on?",
    ];
    for (const prompt of shippedBroken) {
      expect(
        unanswerableRule(prompt) !== null,
        `detector missed a known-broken prompt: "${prompt}"`
      ).toBe(true);
    }
  });

  it('does not flag the replacements', () => {
    // The other half of the grader test: a rule that rejects everything is as
    // useless as one that rejects nothing.
    const good = [
      'Which sites have clients with problems right now? Rank them worst first, and flag any site with no telemetry at all.',
      'Rank radios by least available airtime -- top 10, and name the co-channel offenders.',
      'What configuration changed in the last hour, and did anything degrade with it?',
      'What can this Gateway actually report, and what can it not?',
    ];
    for (const prompt of good) {
      const hit = unanswerableRule(prompt);
      expect(hit?.because ?? null, `over-broad rule rejected a valid prompt: "${prompt}"`).toBeNull();
    }
  });

  it('every classified page type has prompts, and none are duplicated within a page', () => {
    for (const [pageType, prompts] of Object.entries(CORTEX_SUGGESTED_PROMPTS)) {
      // roles/profiles are deliberately empty — no read-only tool covers them.
      if (pageType === 'roles' || pageType === 'profiles') {
        expect(prompts).toHaveLength(0);
        continue;
      }
      expect(prompts.length, `${pageType} has no suggestions`).toBeGreaterThan(0);
      expect(new Set(prompts).size, `${pageType} repeats a suggestion`).toBe(prompts.length);
    }
  });

  it('every page type a route maps to has an entry in the prompt table', () => {
    for (const pageType of new Set(Object.values(CORTEX_PAGE_TYPES))) {
      expect(
        Object.prototype.hasOwnProperty.call(CORTEX_SUGGESTED_PROMPTS, pageType),
        `route page type "${pageType}" has no prompt entry`
      ).toBe(true);
    }
  });
});
