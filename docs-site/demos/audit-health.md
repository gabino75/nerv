# Audit & Health

Continuous code quality monitoring. The Audit panel provides health checks, spec drift detection, and a full audit trail of all agent actions.

## 1. Health Metrics

The **Health** tab shows code quality metrics — test coverage, DRY violations, type errors, dead code, and complexity scores.

![Health Metrics](/screenshots/demos/audit-health/01-health-metrics.png)

## 2. Action Items

Below the metrics, health check results include actionable warnings for any violations that need attention.

![Health Actions](/screenshots/demos/audit-health/02-health-actions.png)

## 3. Spec Drift

The **Spec Drift** tab detects implementation gaps — tasks that have drifted from the original spec or have been stuck too long.

![Spec Drift](/screenshots/demos/audit-health/03-spec-drift.png)

## 4. Stale Task Warning

Tasks in progress for more than 14 days are flagged as stale, with a recommendation to investigate or split the task.

![Stale Task](/screenshots/demos/audit-health/04-stale-task.png)

## 5. Audit Logs

The **Logs** tab provides a complete audit trail — every task creation, status change, tool call, and approval event.

![Logs](/screenshots/demos/audit-health/05-logs.png)

## 6. Filtered Logs

Filter audit events by task to see the full lifecycle of a specific piece of work.

![Logs Filtered](/screenshots/demos/audit-health/06-logs-filtered.png)
