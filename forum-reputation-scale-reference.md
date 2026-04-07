# Forum Reputation Scale (Reference)

This reference scale defines reputation tiers, expected behavior, and moderation signals for forum members.

## Reputation Bands

| Reputation | Tier Name | Typical Capabilities | Moderation Notes |
| ---: | --- | --- | --- |
| `< 0` | Restricted | Read-only access or temporary posting limits. | Auto-review all posts; repeated abuse may trigger suspension. |
| `0–24` | Newcomer | Basic posting, commenting, and reactions. | First-time user education prompts recommended. |
| `25–99` | Contributor | Can post links/media with standard rate limits. | Watch for low-quality burst posting. |
| `100–249` | Regular | Higher daily limits, can flag content, can upvote/downvote. | Prioritize their flags in queue scoring. |
| `250–499` | Trusted | Access to tag edits, wiki-style post edits, and topic recategorization. | Audit edit reversions for quality trends. |
| `500–999` | Senior | Can close duplicate threads and assist with basic moderation workflows. | Spot-check closure accuracy weekly. |
| `1000+` | Steward | Eligible for community moderator nomination and policy feedback councils. | Include in governance and release feedback loops. |

## Scoring Inputs

Use weighted, transparent scoring so users understand progress:

- **+10**: Post marked as helpful/solution.
- **+5**: Upvote on a post or comment.
- **+3**: Accurate content flag that leads to moderator action.
- **+2**: Daily login streak bonus (once per day).
- **-2**: Downvote received.
- **-10**: Confirmed rule violation.
- **-25**: Severe abuse event (spam, harassment, hate content).

## Operational Guardrails

- Apply **rate limits** per tier to reduce spam pressure.
- Require **account age + reputation** for sensitive capabilities.
- Use **decay only on inactivity** (optional), not on punitive cycles.
- Never grant irreversible moderation powers from score alone; require human approval.

## Suggested Review Cadence

- **Weekly:** evaluate false-positive flags, top contributors, and abuse clusters.
- **Monthly:** rebalance score weights to match community goals.
- **Quarterly:** review tier thresholds and moderation burden.

## Implementation Note

If your forum already stores trust levels, map tiers directly and keep reputation as the transparent, user-facing score.
