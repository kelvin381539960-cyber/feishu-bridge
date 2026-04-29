# Scheduled tasks (historical)

本仓库曾附带 `scripts/run-scheduled-cursor-task.sh`，用于在本机 **Cursor CLI** 上跑定时 prompt；该脚本与 `/opt/cursor-bridge` 已移除。

若仍需定时任务，请用系统 **cron** / 自有调度器直接调用 **OpenClaw**（例如 `openclaw gateway call …`）或在本机运行其它自动化，勿再依赖已删除的包装脚本。

`scheduled-tasks/prompts/` 下的 Markdown 仅作文案参考，不再与仓库内可执行脚本绑定。
