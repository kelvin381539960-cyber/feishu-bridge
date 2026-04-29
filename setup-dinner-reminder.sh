#!/usr/bin/env bash
set -euo pipefail

REMINDER_MSG="Kelvin，该吃饭了！🍚"
CRON_ENTRY='15 21 * * * echo "Kelvin，该吃饭了！🍚" | wall 2>/dev/null; echo "[$(date)] 吃饭提醒已发送" >> /tmp/dinner-reminder.log'

# Check if the reminder already exists
if crontab -l 2>/dev/null | grep -q "该吃饭了"; then
    echo "⚠️  吃饭提醒已存在，无需重复添加："
    crontab -l | grep "该吃饭了"
    exit 0
fi

# Add to crontab (preserve existing entries)
(crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -

echo "✅ 已设置每天 21:15 吃饭提醒"
echo ""
echo "当前 crontab："
crontab -l
echo ""
echo "验证："
echo "  查看: crontab -l | grep 吃饭"
echo "  删除: crontab -l | grep -v 吃饭 | crontab -"
echo "  日志: tail -f /tmp/dinner-reminder.log"
