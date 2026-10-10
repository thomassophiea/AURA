/**
 * Propose-and-approve: the MCP drafts, a person approves in AURA, AURA applies
 * and proves it. See server/cortex/changeProposals.js for the contract.
 *
 * `propose_change` is the one MCP tool that is not read-only, and it is marked
 * so (`proposes: true` → readOnlyHint false). It still changes nothing on the
 * Gateway: its only write is a draft row in AURA's workflow store.
 */

import { CHANGE_CATALOG } from '../cortex/changeCatalog.js';

const unavailable = (reason) => ({ basis: 'unknown', unavailable: true, reason });
const NOT_WIRED = 'Change proposals are not enabled on this deployment.';

export const CHANGE_TOOLS = [
  {
    name: 'propose_change',
    title: 'Propose a WLAN change (needs human approval)',
    proposes: true,
    description: `Draft a configuration change for a person to approve in AURA. Nothing changes on the Gateway until someone with the operator role approves it in the Cortex panel; AURA then applies it and re-reads the WLAN to prove the Gateway kept it. Only changes in AURA's verified catalogue are accepted (run list_available_changes first): ${CHANGE_CATALOG.map((c) => c.id).join(', ')}. Returns a workflowId; poll get_change_status for the outcome.`,
    inputSchema: {
      type: 'object',
      properties: {
        wlanName: { type: 'string', description: 'The WLAN (SSID or service name)' },
        changeId: {
          type: 'string',
          enum: CHANGE_CATALOG.map((c) => c.id),
          description: 'Catalogue id of the change',
        },
        desired: { description: 'The new value (boolean or number, per the catalogue entry)' },
        rationale: {
          type: 'string',
          description: 'Why: the evidence that motivated the change (shown to the approver)',
        },
      },
      required: ['wlanName', 'changeId', 'desired'],
      additionalProperties: false,
    },
    handler: async ({ wlanName, changeId, desired, rationale }, ctx) => {
      if (!ctx.changes) return unavailable(NOT_WIRED);
      const tools = ctx.createTools({
        session: ctx.session,
        controllerUrl: ctx.controllerUrl,
        scope: { controllerUrl: ctx.controllerUrl },
      });
      return ctx.changes.propose({
        tools,
        session: ctx.session,
        controllerUrl: ctx.controllerUrl,
        gatewayName: ctx.gateway?.name ?? null,
        wlanName,
        changeId,
        desired,
        rationale,
      });
    },
  },
  {
    name: 'get_change_status',
    title: 'Change status',
    description:
      "Where a proposed change stands: awaiting_approval, declined, applied_and_verified, applied_unverified (sent but the read-back did not confirm it), or failed — with the Gateway's actual before/after when applied.",
    inputSchema: {
      type: 'object',
      properties: { workflowId: { type: 'string' } },
      required: ['workflowId'],
      additionalProperties: false,
    },
    handler: async ({ workflowId }, ctx) =>
      ctx.changes ? ctx.changes.status(workflowId) : unavailable(NOT_WIRED),
  },
  {
    name: 'list_pending_changes',
    title: 'Pending changes',
    description:
      'Changes waiting for a person to approve or decline in AURA, from MCP or from the Cortex panel.',
    inputSchema: {
      type: 'object',
      properties: {
        origin: { type: 'string', enum: ['mcp', 'cortex'], description: 'Optional filter' },
      },
      additionalProperties: false,
    },
    handler: async ({ origin }, ctx) => {
      if (!ctx.changes) return unavailable(NOT_WIRED);
      const pending = await ctx.changes.listPending({ origin: origin ?? null });
      return { basis: 'observed', count: pending.length, pending };
    },
  },
];
