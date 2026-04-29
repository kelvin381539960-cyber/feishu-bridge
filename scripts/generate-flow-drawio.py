import re
import html
import os

md_path = "/opt/feishu-bridge/docs/aix-phase2/solution-design/solution-design.md"
out_dir = "/opt/feishu-bridge/docs/aix-phase2/solution-design/diagrams/flows"
os.makedirs(out_dir, exist_ok=True)

content = open(md_path, "r", encoding="utf-8").read()

# 匹配 #### Flow X：... 和随后的 ```mermaid ... ```
pattern = re.compile(r'#### (Flow \d+：.*?)\n.*?```mermaid\n(.*?)\n```', re.DOTALL)
matches = pattern.findall(content)

template = """<mxfile host="Electron" agent="Cursor" version="22.0.4" type="device">
  <diagram id="diagram" name="Page-1">
    <mxGraphModel dx="1000" dy="1000" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1200" pageHeight="1600" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="2" value="{mermaid_escaped}" style="shape=mermaid;whiteSpace=wrap;html=1;" vertex="1" parent="1">
          <mxGeometry x="40" y="40" width="1000" height="800" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>"""

count = 0
for title, mermaid_code in matches:
    # 生成安全的文件名，如 flow-1-account-opening--kyc
    safe_title = title.split('（')[0].replace(' ', '-').replace('：', '-').lower()
    safe_title = re.sub(r'[^a-z0-9\-]', '', safe_title)
    
    # Draw.io 识别 mermaid 需要 HTML 转义
    mermaid_escaped = html.escape(mermaid_code)
    xml = template.format(mermaid_escaped=mermaid_escaped)
    
    out_path = os.path.join(out_dir, f"{safe_title}.drawio")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(xml)
    print(f"Generated {out_path}")
    count += 1

print(f"Total generated: {count}")
