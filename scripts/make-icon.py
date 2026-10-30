"""Regenerate the project's original cursor icon (requires Pillow)."""
from PIL import Image, ImageDraw
from pathlib import Path
image = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((5, 5, 251, 251), radius=62, fill='#F0EBFC')
draw.polygon([(62, 39), (209, 164), (142, 173), (116, 236)], fill='#B8A0E8', outline='#8E70C0', width=5)
draw.line((108, 116, 111, 129), fill='#5E477F', width=7)
draw.line((135, 131, 138, 144), fill='#5E477F', width=7)
draw.polygon([(192, 28), (197, 43), (213, 49), (197, 54), (192, 71), (186, 54), (170, 49), (186, 43)], fill='#A68BD7')
root = Path(__file__).resolve().parent.parent / 'assets'
root.mkdir(exist_ok=True)
image.save(root / 'icon.png')
image.save(root / 'icon.ico', sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
