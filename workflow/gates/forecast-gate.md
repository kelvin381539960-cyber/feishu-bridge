# Forecast Gate

Purpose: check whether a task has enough future simulation before execution.

## Inputs

- expected_outcome
- next_step_prediction
- failure_modes
- risk_forecast
- rollback_plan
- execute_decision

## Required for Medium / High Risk

1. `expected_outcome` is present.
2. `failure_modes` contains at least one plausible failure.
3. `risk_forecast` is `medium` or `high` when the task touches code, deployment, cleanup, or runtime governance.
4. `rollback_plan` is present for code, deployment, cleanup, and workflow changes.
5. `execute_decision` is one of:
   - `execute`
   - `pause`
   - `needs_user_confirmation`
   - `blocked`

## Fail Conditions

- High-risk task has no rollback plan.
- Cleanup task has no explicit approval path.
- Runtime or deployment task skips risk forecast.
- Forecast says `blocked` but execution continues.

## Minimum Output

```json
{
  "status": "passed",
  "reasons": [],
  "execute_decision": "execute"
}
```

## Principle

A task should not only be planned. It should be forecasted before execution.
