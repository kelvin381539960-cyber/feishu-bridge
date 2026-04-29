# Competitive Research Workbench

This isolated tool package contains a local "heavy research" workbench for competitor analysis.
It is intentionally kept out of the top-level `scripts`, `docs`, and `templates` paths so it does
not mix with the main bridge runtime surface.

## Package Contents

- `competitive_research.py`: main CLI
- `run.sh`: shell wrapper
- `prompt.md`: reusable prompt template

## Default Output

Runs write to:

- `var/experimental/competitive-research/runs`

This keeps generated reports away from the main runtime areas unless you explicitly run the tool.

## Quick Start

```bash
./tools/experimental/competitive-research/run.sh \
  --target "Figma|https://www.figma.com" \
  --target "Canva|https://www.canva.com" \
  --target "Mockplus|https://www.mockplus.com"
```

## Custom Brief

```bash
./tools/experimental/competitive-research/run.sh \
  --target "Notion|https://www.notion.so" \
  --target "ClickUp|https://clickup.com" \
  --task "重点比较企业协作、AI 助手、权限能力、模板生态和定价线索"
```

## Notes

- This tool only runs when explicitly invoked.
- It depends on the existing `ai_crawler` browser and AI modules.
- It focuses on public pages and does not automatically log into SaaS products.
