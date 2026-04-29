# Context Gate

Purpose: verify that the Context Pack is sufficient and not polluted before an executor runs.

## Inputs

- task goal
- must_read
- may_read
- skip
- constraints
- forecast assumptions
- known risks
- allowed_scope
- disallowed_scope

## Checks

1. `must_read` covers the minimum files needed for the task.
2. Generated files, images, docx exports, backup, historical, and archived material are excluded unless explicitly required.
3. `allowed_scope` matches the task objective.
4. `disallowed_scope` protects core runtime or unrelated areas.
5. Forecast assumptions are present for medium/high-risk tasks.
6. Stop conditions are clear.

## Fail Conditions

- Executor is allowed to read the full repository without reason.
- Context Pack includes known noisy generated assets by default.
- Code task lacks related source or test files.
- Cleanup task lacks file classification.

## Minimum Output

```json
{
  "status": "passed",
  "reasons": [],
  "context_scope": "bounded"
}
```
