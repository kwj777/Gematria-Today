# Work Hours Estimate (from Git commit activity)

Generated on 2026-04-23 UTC.

## Data pulled from Git

- Total commits: **2,342**
- Human commits by Kevin/Kevin Jones: **2,244**
- Automation commits (copilot/netlify/Claude): **98**
- First commit date: **2026-02-17**
- Latest commit date: **2026-04-23**
- Active calendar days with human commits: **35**

## Estimation method

Because commit timestamps do not capture exact start/end work time, this estimate uses sessionization:

1. Sort human commits chronologically.
2. Group adjacent commits into one work session when gaps are <= N minutes.
3. Session duration = (last commit - first commit), with a minimum floor of 10 minutes/session.
4. Total estimate = sum of all session durations.

## Estimated total hours (sensitivity range)

- 30-minute session gap: **173.31 hours**
- 45-minute session gap: **190.76 hours**
- 60-minute session gap: **200.44 hours**
- 90-minute session gap: **217.47 hours**

## Practical takeaway

A reasonable planning estimate is **~191 to 217 hours** of total project work so far,
with a central estimate around **~200 hours**.

## Notes

- This is likely conservative when work happened without committing.
- This may overcount if long idle periods occurred inside sessions.
- The estimate reflects repository activity, not all possible planning/research done outside Git.
