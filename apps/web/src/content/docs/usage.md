## Overview

Usage metering is built into every Nebula operator: each model turn produces a usage event, and those events roll up into personal and organization dashboards automatically. During the beta this is measurement only — no billing integration is enabled yet.

## What gets recorded

Every event captures one model turn:

- provider and model,
- the session and agent profile that ran it,
- token counts: input, output, cached input, and reasoning tokens,
- duration,
- outcome: success, error, or cancelled.

Events are reconciled automatically from each ready runtime, so dashboards stay current without manual exports.

## Cost estimates

Dollar figures are **estimates**, computed at public list prices for known model families (a periodically updated pricing snapshot). When a provider reports its own cost figure, that wins. Cache savings are tracked separately from spend. Treat monetary values as directional guidance, never invoices — the label in the UI says estimated for a reason.

## Dashboards

- The dashboard home summarizes the last 30 days from persisted state: ready
  operators, sessions, model turns, tokens, estimated cost, provisioning
  failures, and the health of workers assigned to those operators.
- Owners and admins see organization scope. Members see only their own operator,
  usage, provisioning, and assigned-worker health.
- Entitled-user counts come from the local Operator entitlement ledger. Expiring
  beta grants and future Stripe projections use this same persisted boundary;
  enabled organization membership is tracked separately.
- **Personal view**: totals for your own operators over the selected range.
- **Organization view** (admins): the same metrics across every member's operators.
- A totals strip shows processed tokens, cached versus uncached input, output including reasoning tokens, and cache savings.
- A daily stacked chart breaks activity down by model; switch between token counts and estimated cost.
- Breakdown tabs: by model, by day, or by session.

## Ranges

Dashboards cover 7, 30, or 90-day windows.

## Beta notes

- Plan tiers described on the Plans page are intended packaging; billing and
  plan quotas are not connected yet.
- Real limits today come from workspace resource profiles (see [Cloud workspaces](/docs?topic=cloud)), not subscriptions.
- Estimated-cost labels will remain until provider billing data flows end-to-end.
