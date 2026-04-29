# Cleanup Gate

Purpose: prevent accidental deletion of source documents, runtime code, deployment files, or governance baselines.

## Inputs

- candidate file list
- file classification
- backup status
- user approval status
- rollback plan

## Classification

| Class | Default Action |
|---|---|
| generated artifact | may delete after approval |
| temporary output | may delete after approval |
| test scratch file | may delete after approval |
| historical / backup / archived | archive or delete only after explicit approval |
| current source document | do not delete without explicit named approval |
| runtime source code | do not delete in cleanup workflow |
| deployment / credentials / env templates | do not delete in cleanup workflow |
| governance baseline | do not delete unless replacing with a new authoritative document |

## Required Checks

1. User explicitly approves deletion scope.
2. Core source files are not included.
3. The rollback plan is clear.
4. Deleted files are summarized by path and reason.
5. No cleanup task deletes files outside its approved scope.

## Minimum Output

```json
{
  "status": "passed",
  "reasons": [],
  "approved_scope": []
}
```
