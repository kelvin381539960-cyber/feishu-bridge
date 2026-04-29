# Learning Gate

Purpose: turn execution results into durable learning signals without letting the system self-modify blindly.

## Inputs

- run trace
- forecast
- gate result
- output result
- learning signals

## Checks

1. Every complex task should produce learning signals.
2. Learning records must separate observed facts from recommendations.
3. Failed or blocked tasks should record why they failed or blocked.
4. Learning output must not directly change policy without review.
5. Repeated failures should become recommendations for future policy adjustment.

## Outcomes

| Outcome | Meaning |
|---|---|
| success | Task completed and learning signals were recorded. |
| failed | Task failed and failure signals were recorded. |
| blocked | Forecast or gate stopped execution and the reason was recorded. |
| warning | Task completed with cautionary signals. |

## Self-Optimization Rule

The system may collect learning records automatically, but policy changes require review.

Allowed automatically:

```text
record learning signals
summarize failure patterns
recommend gate/context/forecast adjustments
```

Not allowed automatically:

```text
change gate strictness
change harness allowlist
change runtime execution policy
remove safety checks
```

## Minimum Output

```json
{
  "status": "passed",
  "learning_record_created": true,
  "recommendations": []
}
```
