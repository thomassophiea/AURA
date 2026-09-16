/**
 * Render a configuration turn as something an operator reads.
 *
 * The server returns structured workflow state; this turns it into the message
 * body. Kept out of the context so it can be tested on its own, and so the
 * wording is in one place rather than scattered through JSX.
 *
 * PROGRESSIVE DISCLOSURE
 * ----------------------
 * The operator is not a wireless expert. They get the decision and the reason
 * for it, never a dump of every field the Gateway wanted. Anything Cortex chose
 * on their behalf is stated plainly, because that is the last moment they can
 * veto it.
 */

import type { CortexWorkflowEvent, CortexPlanField } from '../services/cortexApiClient';

/** "VLAN 30", "Guest", "4 access points" — a value as prose, not JSON. */
function renderValue(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length <= 2) return value.join(' and ');
    return `${value.length} items`;
  }
  if (value === null || value === undefined) return 'not set';
  return String(value);
}

/** Field names the operator never chose to learn. */
const FIELD_LABELS: Record<string, string> = {
  wlanName: 'Network name',
  ssid: 'Broadcast name',
  siteId: 'Site',
  siteName: 'Site',
  'security.mode': 'Security',
  vlanId: 'Network (VLAN)',
  apScope: 'Access points',
};

function label(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function renderPlan(fields: CortexPlanField[]): string {
  return fields
    .filter((f) => f.field !== 'rawInstruction' && f.field !== 'requestedBy' && f.field !== 'source')
    .map((f) => {
      const chosen =
        f.source === 'default'
          ? '  (I chose this)'
          : f.source === 'system'
            ? '  (found on the Gateway)'
            : '';
      return `- ${label(f.field)}: ${renderValue(f.value)}${chosen}`;
    })
    .join('\n');
}

/**
 * @returns the message body, or null when the event carries nothing to show.
 */
export function renderWorkflowMessage(event: CortexWorkflowEvent): string | null {
  switch (event.emit) {
    case 'question': {
      const decisions = event.question?.decisions ?? [];
      if (!decisions.length) return null;

      const opener =
        decisions.length === 1
          ? 'I can build that. One decision first:'
          : `I can build that. I need ${decisions.length} decisions:`;

      const body = decisions
        .map((d) => {
          const options = d.options.length ? `\n  Options: ${d.options.join(' · ')}` : '';
          const why = d.why.length ? `\n  ${d.why.join('. ')}` : '';
          const recommended =
            d.recommended != null ? `\n  I'd suggest ${renderValue(d.recommended)}.` : '';
          return `**${d.ask}**${options}${recommended}${why}`;
        })
        .join('\n\n');

      const warning =
        event.durable === false
          ? '\n\n_This task is being held in memory only, so it will not survive a restart._'
          : '';

      return `${opener}\n\n${body}${warning}`;
    }

    case 'preview': {
      const preview = event.preview;
      if (!preview) return null;
      const assumed = preview.assumptions.length
        ? `\n\nI filled in ${preview.assumptions
            .map((a) => label(a.field))
            .join(', ')} for you — change anything that looks wrong.`
        : '';
      const warnings = preview.warnings.length ? `\n\n⚠ ${preview.warnings.join('\n⚠ ')}` : '';
      return `Here is what I'll do:\n\n${renderPlan(preview.fields)}${assumed}${warnings}\n\nSay **deploy** to go ahead, or tell me what to change.`;
    }

    case 'explanation': {
      const decisions = event.decisions ?? [];
      if (!decisions.length) return 'There is nothing outstanding on this task.';
      return decisions
        .map((d) => {
          const why = d.why.length ? `\n\n${d.why.join('. ')}` : '';
          return `I asked because I still need this: **${d.ask}**${why}`;
        })
        .join('\n\n');
    }

    case 'recommendation': {
      const recs = event.recommendations ?? [];
      if (!recs.length) return 'There is nothing outstanding on this task.';
      return recs
        .map((r) => {
          if (!r.hasDefault) {
            // Honest: some questions genuinely have no defensible default, and
            // pretending otherwise is how a guest network ends up Open.
            return `**${label(r.field ?? '')}** is yours to decide — I won't pick for you.${
              r.options.length ? ` The options are ${r.options.join(' · ')}.` : ''
            }`;
          }
          return `For **${label(r.field ?? '')}** I'd use ${renderValue(r.recommended)}.${
            r.why.length ? ` ${r.why.join('. ')}` : ''
          }`;
        })
        .join('\n\n');
    }

    case 'blocked': {
      const reasons = (event.deadEnds ?? []).map((d) => d.reason);
      return `I can't complete this:\n\n${reasons.map((r) => `- ${r}`).join('\n')}\n\nThis isn't something you can answer — it needs a change on the network first.`;
    }

    case 'confirmed':
      return 'Confirmed — applying the change now.';

    case 'cancelled':
      return "Cancelled. Nothing was changed, and I've dropped the task.";

    case 'error':
      return 'That could not be applied to the current task.';

    default:
      return null;
  }
}
