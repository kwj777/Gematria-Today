# Work Hours Estimate (from Git commit activity)

Generated on 2026-03-27 UTC.

## Data pulled from Git

- Total commits: **727**
- Human commits by Kevin/Kevin Jones: **707**
- Bot commits (copilot/netlify): **20**
- First commit date: **2026-02-17**
- Latest commit date: **2026-03-27**
- Active calendar days with human commits: **13**

## Estimation method

Because commit timestamps do not capture exact start/end work time, this estimate uses sessionization:

1. Sort human commits chronologically.
2. Group adjacent commits into one work session when gaps are <= N minutes.
3. Session duration = (last commit - first commit), with a minimum floor of 10 minutes/session.
4. Total estimate = sum of all session durations.

## Estimated total hours (sensitivity range)

- 30-minute session gap: **51.20 hours**
- 45-minute session gap: **57.62 hours**
- 60-minute session gap: **61.29 hours**
- 90-minute session gap: **63.42 hours**

## Practical takeaway

A reasonable planning estimate is **~58 to 63 hours** of total project work so far,
with a central estimate around **~60 hours**.

## Notes

- This is likely conservative when work happened without committing.
- This may overcount if long idle periods occurred inside sessions.
- The estimate reflects repository activity, not all possible planning/research done outside Git.
