# Forum Reputation Scales (Reference)

This document defines two forum reputation scales:

1. **Public scale** (member-facing): transparency around progression and unlocks.
2. **Admin-only scale** (internal): moderation handling, risk weighting, and escalation defaults.

## 1) Public Reputation Scale

| Reputation | Tier Name | Member-Facing Capabilities |
| ---: | --- | --- |
| `< 0` | Restricted | Posting cooldowns and manual review may apply. |
| `0–24` | Newcomer | Basic posting, commenting, and reactions. |
| `25–99` | Contributor | Can post links/media with standard limits. |
| `100–249` | Regular | Higher daily limits and content flags. |
| `250–499` | Trusted | Category edit suggestions and higher signal weight. |
| `500–999` | Senior | Eligible for helper workflows. |
| `1000+` | Steward | Eligible for moderator nomination review. |

## 2) Admin-Only Reputation Scale

| Reputation | Risk Profile | Moderation Defaults |
| ---: | --- | --- |
| `< 0` | High risk | Auto-review queue, tighter cooldowns, manual link/media approval. |
| `0–24` | Early trust | Education prompts and anti-spam monitoring. |
| `25–99` | Baseline trust | Standard limits with sampled moderation checks. |
| `100–249` | Reliable | Prioritize accurate flags; reduce false-positive friction. |
| `250–499` | Trusted | Prioritize reports and run weekly quality audits. |
| `500–999` | Senior | Eligible for pilot moderation workflows with audit logs. |
| `1000+` | Steward | Eligible for moderator nominations and policy council review. |

## Shared Scoring Inputs

- **+10**: Thread posted.
- **+4**: Reply posted.
- **+5**: Helpful community action (e.g., quality upvote signal).
- **-10**: Confirmed rule violation.
- **-25**: Severe abuse event (spam, harassment, hate content).

## Admin Workflow States

- **Open:** review under normal SLA.
- **In review:** assign moderator and capture internal note.
- **Actioned:** apply lock/delete/suspension and set canned response.
- **Resolved:** close with a traceable reason.

## Suggested Review Cadence

- **Weekly:** false-positive review, assignee balancing, abuse cluster triage.
- **Monthly:** score-weight tuning against moderation outcomes.
- **Quarterly:** threshold and burden review for community health.
