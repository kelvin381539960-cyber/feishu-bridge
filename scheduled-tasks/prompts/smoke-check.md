Run a read-only smoke check (no file writes).

Requirements:
- Do not modify any files.
- Use shell only for read-only commands.
- Keep the reply under 12 lines.
- Include:
  - `Status:` with either `ok` or `warning`
  - `Time:` with the current server time
  - `WorkingDir:` with the current directory
  - `Notes:` with one short sentence about whether the Feishu bot service and OpenClaw URL are plausible

Suggested checks:
- `pwd`
- `date`
- `systemctl is-active feishu-ws-cursor-bot 2>/dev/null || true`
- `test -n "$OPENCLAW_GATEWAY_URL" && echo openclaw-url-set || echo openclaw-url-missing`（在加载了 env 的 shell 中）
