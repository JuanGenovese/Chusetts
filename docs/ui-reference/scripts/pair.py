"""Side-by-side (reference | next) image for visual comparison. Usage: pair.py <shot-name> ; reads shots/ and compare/."""
import sys
from PIL import Image
ref_name, mine_name = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else sys.argv[1]
a = Image.open(f"shots/{ref_name}.png").convert("RGB"); b = Image.open(f"compare/{mine_name}.png").convert("RGB")
h = max(a.height, b.height)
out = Image.new("RGB", (a.width + b.width + 10, h), (255, 0, 255))
out.paste(a, (0, 0)); out.paste(b, (a.width + 10, 0))
out.save(f"compare/pair-{mine_name}.png"); print(out.size)
