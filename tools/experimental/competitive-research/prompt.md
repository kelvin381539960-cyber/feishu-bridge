# Competitive Research Prompt Template

Use this structure when asking for a full dossier:

## Inputs

- Targets:
  - `Product A | https://example-a.com`
  - `Product B | https://example-b.com`
  - `Product C | https://example-c.com`
- Goal:
  - `Why are we researching these competitors?`
- Priority angles:
  - `Positioning`
  - `Core features`
  - `AI capabilities`
  - `Collaboration`
  - `Pricing`
  - `Growth channels`
  - `Tech stack hints`
- Deliverable:
  - `Short memo`
  - `Full report`
  - `Feature matrix`
  - `Opportunity summary`

## Ready-To-Use Example

```text
调研 Figma、Canva、Mockplus。
目标：判断我们做设计协作工具时该打哪些空位。
重点：定位、协作能力、AI 能力、模板生态、企业权限、定价。
输出：一份完整竞品报告，先给结论，再给对比，再给建议。
```

## CLI Equivalent

```bash
./tools/experimental/competitive-research/run.sh \
  --target "Figma|https://www.figma.com" \
  --target "Canva|https://www.canva.com" \
  --target "Mockplus|https://www.mockplus.com" \
  --task "重点比较定位、协作能力、AI 能力、模板生态、企业权限、定价，并给出机会判断"
```
