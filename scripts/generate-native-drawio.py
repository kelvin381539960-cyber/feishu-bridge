import re
import os
import html

def parse_mermaid(mermaid_text):
    participants = []
    messages = []
    
    lines = mermaid_text.strip().split('\n')
    for line in lines:
        line = line.strip()
        if not line or line.startswith('%%') or line == 'sequenceDiagram' or line == 'autonumber':
            continue
            
        # Match participant/actor
        m = re.match(r'(?:participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$', line)
        if m:
            pid = m.group(1).strip()
            label = m.group(2).strip() if m.group(2) else pid
            participants.append({"id": pid, "label": label})
            continue
            
        # Match message
        m = re.match(r'(.+?)(->>|-->>)(.+?):\s*(.+)$', line)
        if m:
            src = m.group(1).strip()
            arr = m.group(2).strip()
            dst = m.group(3).strip()
            msg = m.group(4).strip()
            messages.append({"type": "msg", "src": src, "dst": dst, "msg": msg, "dashed": (arr == '-->>')})
            continue
            
        # Match Note
        m = re.match(r'Note\s+(right of|left of|over)\s+(.+?):\s*(.+)$', line)
        if m:
            pos = m.group(1).strip()
            targets = [t.strip() for t in m.group(2).split(',')]
            msg = m.group(3).strip()
            messages.append({"type": "note", "targets": targets, "msg": msg})
            continue
            
        # Match alt/opt/end
        m = re.match(r'(alt|opt|else|end)(?:\s+(.+))?$', line)
        if m:
            block_type = m.group(1).strip()
            label = m.group(2).strip() if m.group(2) else ""
            messages.append({"type": "block", "block_type": block_type, "label": label})
            continue

    return participants, messages

def generate_drawio(participants, messages):
    xml = []
    xml.append('<mxfile host="Electron" agent="Cursor" version="22.0.4" type="device">')
    xml.append('  <diagram id="diagram" name="Page-1">')
    xml.append('    <mxGraphModel dx="1000" dy="1000" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1600" pageHeight="2000" math="0" shadow="0">')
    xml.append('      <root>')
    xml.append('        <mxCell id="0" />')
    xml.append('        <mxCell id="1" parent="0" />')
    
    # Layout constants
    START_X = 100
    SPACING_X = 250
    START_Y = 80
    SPACING_Y = 70
    LIFELINE_W = 140
    LIFELINE_H = 50
    
    p_map = {}
    for i, p in enumerate(participants):
        p_map[p['id']] = i
        x = START_X + i * SPACING_X
        # Lifeline header
        xml.append(f'        <mxCell id="p_{i}" value="{html.escape(p["label"])}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontStyle=1;fontSize=14;" vertex="1" parent="1">')
        xml.append(f'          <mxGeometry x="{x}" y="{START_Y}" width="{LIFELINE_W}" height="{LIFELINE_H}" as="geometry" />')
        xml.append(f'        </mxCell>')
        
        # Lifeline dashed line
        line_len = START_Y + 100 + len(messages) * SPACING_Y
        xml.append(f'        <mxCell id="l_{i}" value="" style="endArrow=none;dashed=1;html=1;strokeWidth=2;strokeColor=#999999;" edge="1" parent="1" source="p_{i}">')
        xml.append(f'          <mxGeometry width="50" height="50" relative="1" as="geometry">')
        xml.append(f'            <mxPoint x="{x + LIFELINE_W/2}" y="{START_Y + LIFELINE_H}" as="sourcePoint" />')
        xml.append(f'            <mxPoint x="{x + LIFELINE_W/2}" y="{line_len}" as="targetPoint" />')
        xml.append(f'          </mxGeometry>')
        xml.append(f'        </mxCell>')

    current_y = START_Y + LIFELINE_H + 40
    msg_idx = 0
    
    block_stack = []

    for msg in messages:
        if msg['type'] == 'msg':
            msg_idx += 1
            src_idx = p_map.get(msg['src'], 0)
            dst_idx = p_map.get(msg['dst'], 0)
            
            src_x = START_X + src_idx * SPACING_X + LIFELINE_W / 2
            dst_x = START_X + dst_idx * SPACING_X + LIFELINE_W / 2
            
            dashed_str = "dashed=1;" if msg['dashed'] else ""
            
            if src_idx == dst_idx:
                # Self arrow
                xml.append(f'        <mxCell id="m_{msg_idx}" value="{html.escape(msg["msg"])}" style="edgeStyle=orthogonalEdgeStyle;html=1;verticalAlign=bottom;endArrow=block;{dashed_str}strokeWidth=2;strokeColor=#333333;fontSize=13;labelBackgroundColor=#ffffff;" edge="1" parent="1">')
                xml.append(f'          <mxGeometry width="80" relative="1" as="geometry">')
                xml.append(f'            <mxPoint x="{src_x}" y="{current_y}" as="sourcePoint" />')
                xml.append(f'            <mxPoint x="{dst_x}" y="{current_y + 30}" as="targetPoint" />')
                xml.append(f'            <Array as="points">')
                xml.append(f'              <mxPoint x="{src_x + 60}" y="{current_y}" />')
                xml.append(f'              <mxPoint x="{src_x + 60}" y="{current_y + 30}" />')
                xml.append(f'            </Array>')
                xml.append(f'          </mxGeometry>')
                xml.append(f'        </mxCell>')
                current_y += SPACING_Y + 10
            else:
                # Normal arrow
                xml.append(f'        <mxCell id="m_{msg_idx}" value="{html.escape(msg["msg"])}" style="html=1;verticalAlign=bottom;endArrow=block;{dashed_str}strokeWidth=2;strokeColor=#333333;fontSize=13;labelBackgroundColor=#ffffff;" edge="1" parent="1">')
                xml.append(f'          <mxGeometry width="80" relative="1" as="geometry">')
                xml.append(f'            <mxPoint x="{src_x}" y="{current_y}" as="sourcePoint" />')
                xml.append(f'            <mxPoint x="{dst_x}" y="{current_y}" as="targetPoint" />')
                xml.append(f'          </mxGeometry>')
                xml.append(f'        </mxCell>')
                current_y += SPACING_Y
            
        elif msg['type'] == 'note':
            msg_idx += 1
            if len(msg['targets']) == 1:
                t_idx = p_map.get(msg['targets'][0], 0)
                x = START_X + t_idx * SPACING_X + LIFELINE_W / 2 - 100
                w = 200
            else:
                t1 = p_map.get(msg['targets'][0], 0)
                t2 = p_map.get(msg['targets'][-1], 0)
                min_idx = min(t1, t2)
                max_idx = max(t1, t2)
                x = START_X + min_idx * SPACING_X + LIFELINE_W / 2
                w = (max_idx - min_idx) * SPACING_X
                
            xml.append(f'        <mxCell id="n_{msg_idx}" value="{html.escape(msg["msg"])}" style="shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;darkOpacity=0.05;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=13;" vertex="1" parent="1">')
            xml.append(f'          <mxGeometry x="{x}" y="{current_y - 20}" width="{w}" height="40" as="geometry" />')
            xml.append(f'        </mxCell>')
            current_y += SPACING_Y
            
        elif msg['type'] == 'block':
            if msg['block_type'] in ['alt', 'opt', 'par']:
                block_stack.append({"type": msg['block_type'], "label": msg['label'], "start_y": current_y - 30})
                current_y += 20
            elif msg['block_type'] == 'else' or msg['block_type'] == 'and':
                if block_stack:
                    # Draw a dashed line separator
                    xml.append(f'        <mxCell id="sep_{msg_idx}" value="{html.escape(msg["label"])}" style="endArrow=none;dashed=1;html=1;strokeWidth=1;strokeColor=#666666;fontSize=12;verticalAlign=bottom;labelBackgroundColor=#ffffff;" edge="1" parent="1">')
                    xml.append(f'          <mxGeometry width="50" height="50" relative="1" as="geometry">')
                    xml.append(f'            <mxPoint x="{START_X}" y="{current_y}" as="sourcePoint" />')
                    xml.append(f'            <mxPoint x="{START_X + len(participants)*SPACING_X}" y="{current_y}" as="targetPoint" />')
                    xml.append(f'          </mxGeometry>')
                    xml.append(f'        </mxCell>')
                    current_y += 30
            elif msg['block_type'] == 'end':
                if block_stack:
                    b = block_stack.pop()
                    h = current_y - b['start_y'] + 10
                    w = len(participants) * SPACING_X
                    xml.append(f'        <mxCell id="b_{msg_idx}" value="{html.escape(b["type"])}: {html.escape(b["label"])}" style="shape=rect;html=1;whiteSpace=wrap;align=left;verticalAlign=top;fillColor=none;strokeColor=#000000;strokeWidth=1;dashed=1;fontSize=13;spacingLeft=5;spacingTop=5;" vertex="1" parent="1">')
                    xml.append(f'          <mxGeometry x="{START_X - 50}" y="{b["start_y"]}" width="{w}" height="{h}" as="geometry" />')
                    xml.append(f'        </mxCell>')
                    # Push block to back
                    xml.append(f'        <mxCell id="b_{msg_idx}_back" parent="1" source="b_{msg_idx}" target="b_{msg_idx}" edge="1">')
                    xml.append(f'          <mxGeometry relative="1" as="geometry" />')
                    xml.append(f'        </mxCell>')
                    current_y += 20

    xml.append('      </root>')
    xml.append('    </mxGraphModel>')
    xml.append('  </diagram>')
    xml.append('</mxfile>')
    
    return "\n".join(xml)

if __name__ == "__main__":
    md_path = "/opt/feishu-bridge/docs/aix-phase2/solution-design/solution-design.md"
    out_dir = "/opt/feishu-bridge/docs/aix-phase2/solution-design/diagrams/flows"
    os.makedirs(out_dir, exist_ok=True)

    content = open(md_path, "r", encoding="utf-8").read()
    pattern = re.compile(r'#### (Flow \d+：.*?)\n.*?```mermaid\n(.*?)\n```', re.DOTALL)
    matches = pattern.findall(content)

    for title, mermaid_code in matches:
        safe_title = title.split('（')[0].replace(' ', '-').replace('：', '-').lower()
        safe_title = re.sub(r'[^a-z0-9\-]', '', safe_title)
        
        participants, messages = parse_mermaid(mermaid_code)
        xml = generate_drawio(participants, messages)
        
        out_path = os.path.join(out_dir, f"{safe_title}.drawio")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(xml)
        print(f"Generated native drawio: {out_path}")
