# Intake Gate

Purpose: decide whether a user request can proceed directly, needs planning, needs confirmation, or should stop.

## Inputs

- user request summary
- workflowKey / taskType
- taskSize
- risk forecast
- expected outcome

## Checks

1. The user goal is identifiable.
2. The request has a suitable workflow path.
3. The task does not require unavailable credentials or inaccessible systems.
4. High-risk tasks do not proceed directly to execution.
5. Tasks that affect core runtime, deployment, credentials, or deletion require an explicit plan.

## Results

| Result | Meaning |
|---|---|
| passed | Proceed to Forecast Gate or execution planning. |
| warning | Proceed, but include the warning in task metadata. |
| failed | Stop and report the missing requirement. |

## Minimum Output

```json
{
  "status": "passed",
  "reasons": [],
  "required_next_gate": "forecast-gate"
}
```
