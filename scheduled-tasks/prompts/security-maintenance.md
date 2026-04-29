Run a read-only security maintenance check for the feishu-bridge setup.

Requirements:
- Do not modify any files.
- Use shell only for read-only commands.
- Keep the reply under 15 lines.
- Include:
  - `Status:` with either `ok` or `warning`
  - `Time:` with the current server time
  - `Findings:` with the top 2 security or stability observations
  - `Action:` with one short sentence on whether manual follow-up is needed

Suggested checks:
- `node /opt/feishu-bridge/scripts/audit-feishu-channel-drift.mjs`
- `test -f /etc/feishu-ws-cursor-bot.env && stat -c '%a %n' /etc/feishu-ws-cursor-bot.env`
- `test -f /etc/feishu-ws-cursor-bot.secret && stat -c '%a %n' /etc/feishu-ws-cursor-bot.secret`
- `systemctl is-active feishu-ws-cursor-bot.service 2>/dev/null || true`
