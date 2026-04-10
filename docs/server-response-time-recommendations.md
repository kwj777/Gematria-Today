# Server Response Time Recommendations

This document captures the highest-impact changes to reduce avoidable latency across request handlers.

## Highest-impact opportunities

### 1) Stop running schema migrations on hot request paths
Many public and member-facing functions call `ensureAdminSchema(sql)` and/or `ensureSecuritySchema(sql)` on every request. Those functions execute many `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE`, `UPDATE`, and `CREATE INDEX IF NOT EXISTS` statements.

That migration work is safe, but it adds avoidable latency to normal traffic and increases database round trips.

**What to change**
- Move schema creation and backfill logic into an explicit migration workflow (deploy hook, CLI script, or scheduled maintenance function).
- Keep request handlers focused on request work only.
