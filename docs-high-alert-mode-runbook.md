# High Alert Mode Runbook (Traffic Anomalies)

This runbook keeps the current DB-backed rate limiting in place and adds an operational playbook for sudden traffic spikes.

## Dashboard & alert focus

Monitor these API routes continuously in the admin reports `trafficAlerts` block:

- `/api/member-login`
- `/api/member-register`
- `/api/public-feeds`
- `/definition` (Wordnik definition endpoint)
- `/api/wordnikRelatedWords`

Alert logic is dual trigger per endpoint over rolling 5-minute windows:

1. **Absolute threshold** (endpoint-specific baseline in env vars).
2. **Baseline multiplier** (>=3x previous hourly baseline, when historical baseline is meaningful).

## Retention cleanup schedule

A scheduled function now handles log/cache retention:

- Function: `security-retention`
- Schedule: hourly (`0 * * * *`)
- Cleanup targets:
  - `request_audit_log` rows older than `REQUEST_AUDIT_LOG_RETENTION_DAYS` (default 30 days)
  - `function_response_cache` rows expired longer than `FUNCTION_RESPONSE_CACHE_GRACE_DAYS` (default 2 days)
  - stale `request_rate_limits` rows older than `REQUEST_RATE_LIMIT_RETENTION_DAYS` (default 7 days)

## Incident response checklist

### 1) Triage (0-5 minutes)

1. Open `admin-reports` and confirm which endpoint(s) are alerting.
2. Validate the spike is not a deployment/test event.
3. Confirm rates by checking `trafficAlerts.items` and recent `securityEvents`.

### 2) Contain (5-15 minutes)

1. If expensive public routes are the issue, set one or both:
   - `PROTECTION_HIGH_ALERT_MODE=true`
   - `DISABLE_EXPENSIVE_PUBLIC_ENDPOINTS=true`
2. Keep login/register routes online if possible; rely on existing DB-backed rate limits first.
3. If auth abuse is concentrated, tighten WAF rules on `/api/member-login` and `/api/member-register`.

### 3) Stabilize (15-45 minutes)

1. Tune spike thresholds (env vars) to reduce false positives and capture real anomalies.
2. Review blocked/invalid credential events by route and source fingerprints.
3. Verify cache-hit behavior on expensive endpoints after containment changes.

### 4) Recover (45+ minutes)

1. Revert `PROTECTION_HIGH_ALERT_MODE` and/or `DISABLE_EXPENSIVE_PUBLIC_ENDPOINTS` in stages.
2. Watch `trafficAlerts.hasActiveAlerts` until clear for at least two consecutive windows.
3. Record timeline, root cause hypothesis, and threshold changes.

## Rehearsal plan (monthly)

Run a tabletop or controlled synthetic traffic drill once per month:

1. Simulate login/register burst traffic and verify alert triggers.
2. Simulate expensive public endpoint bursts and enable high alert mode.
3. Verify customer-facing behavior (expected 503 for temporarily disabled expensive endpoints).
4. Run through recovery and rollback steps.
5. Capture lessons learned and update this runbook.

## Suggested env vars for alerting

- `ALERT_MEMBER_LOGIN_SPIKE_5M` (default `40`)
- `ALERT_MEMBER_REGISTER_SPIKE_5M` (default `20`)
- `ALERT_PUBLIC_FEEDS_SPIKE_5M` (default `60`)
- `ALERT_WORDNIK_DEFINITION_SPIKE_5M` (default `120`)
- `ALERT_WORDNIK_RELATED_WORDS_SPIKE_5M` (default `80`)
