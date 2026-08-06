# Forum Reputation Scales (Reference)

This document defines two forum reputation scales:

1. **Public scale** (member-facing): what is actually implemented and published.
2. **Admin-only scale** (internal): moderation handling, risk weighting, and escalation defaults. **Policy intent, not code** — none of the automation below is implemented; it describes how moderators should weigh a member's history by hand.

## 1) Public Reputation Scale

This section mirrors `src/forum-reputation-scale.html`, which is cited as binding
by the Terms of Use. Keep the three in sync with `deriveBadges` in
`netlify/functions/member-forum.mjs` — it is the only thing that assigns a badge.

| Threshold | Badge | Source |
| ---: | --- | --- |
| ≥ 1 thread **and** ≥ 1 reply | Contributor | `deriveBadges` |
| 50 points | Trusted | `deriveBadges` |
| 200 points | Sage (replaces Trusted) | `deriveBadges` |
| premium / lifetime membership | Premium | `deriveBadges` |
| staff | Moderator | `deriveBadges` |

No badge grants a permission. There are no reputation-gated capabilities in the
codebase: every member posts under the same rate limits regardless of score.

An earlier version of this table published seven tiers (Restricted, Newcomer,
Contributor, Regular, Trusted, Senior, Steward) with per-tier unlocks such as
link/media permissions, content flags, category edit suggestions and moderator
nomination. None of it existed, and `< 0` was unreachable because nothing ever
subtracts points. Don't reintroduce a tier here before the code implements it.

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

`REPUTATION_POINTS` in `netlify/functions/member-forum.mjs` is the complete list:

- **+10**: Thread posted.
- **+4**: Reply posted.

There are no deductions, and no upvote mechanic exists anywhere in the codebase.
Rule violations are handled through the moderation actions in the admin forum
queue (hide, remove, warn, suspend), not by adjusting a score.

## Admin Workflow States

- **Open:** review under normal SLA.
- **In review:** assign moderator and capture internal note.
- **Actioned:** apply lock/delete/suspension and set canned response.
- **Resolved:** close with a traceable reason.

## Suggested Review Cadence

- **Weekly:** false-positive review, assignee balancing, abuse cluster triage.
- **Monthly:** score-weight tuning against moderation outcomes.
- **Quarterly:** threshold and burden review for community health.
