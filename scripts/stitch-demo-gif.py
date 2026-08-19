"""Stitch docs/demo-frames/*.png into a looping GIF with a name watermark."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

frames_dir = Path("docs/demo-frames")
files = sorted(frames_dir.glob("frame-*.png"))
if not files:
    raise SystemExit("no frames in docs/demo-frames")

watermark = "agent-think-map"
images: list[Image.Image] = []
for path in files:
    rgb = Image.open(path).convert("RGB")
    draw = ImageDraw.Draw(rgb)
    font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), watermark, font=font)
    pad = 8
    x = rgb.width - (bbox[2] - bbox[0]) - pad * 2
    y = rgb.height - (bbox[3] - bbox[1]) - pad * 2
    draw.rectangle((x - pad, y - pad, rgb.width - 4, rgb.height - 4), fill=(28, 25, 21))
    draw.text((x, y), watermark, fill=(228, 217, 197), font=font)
    images.append(rgb.convert("P", palette=Image.Palette.ADAPTIVE, colors=128))

out = Path("docs/demo.gif")
images[0].save(
    out,
    save_all=True,
    append_images=images[1:],
    duration=280,
    loop=0,
    optimize=True,
    disposal=2,
)
print(f"wrote {out} ({out.stat().st_size / 1_000_000:.2f} MB)")
