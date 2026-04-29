import re
from pathlib import Path

content = Path("docs/aix-phase2/solution-design/chapters/05-money-flows.md").read_text()
blocks = re.findall(r'```mermaid\nflowchart.*?\n(.*?)```', content, re.DOTALL)

for i, block in enumerate(blocks):
    print(f"=== Flowchart {i+1} ===")
    
    # Extract subgraphs
    subgraphs = re.findall(r'subgraph\s+(.*?)\n', block)
    print("Subgraphs:", [s.strip().replace('["', ' ["').replace('"]', '"]') for s in subgraphs])
    
    # Extract nodes
    nodes = re.findall(r'^\s*([a-zA-Z0-9_]+)\["(.*?)"\]', block, re.MULTILINE)
    print("Nodes:")
    for n_id, n_label in nodes:
        print(f"  {n_id}: {n_label.replace('<br/>', ' ')}")
    print()
