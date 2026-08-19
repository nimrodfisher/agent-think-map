"""Light PNG optimize for hero/og captures. Never quantize to a palette."""

from pathlib import Path

from PIL import Image

hero_path = Path("docs/hero.png")
hero = Image.open(hero_path)
if hero.mode not in ("RGB", "RGBA"):
    hero = hero.convert("RGBA")
hero.save(hero_path, format="PNG", optimize=True)

og_path = Path("docs/og.png")
og = Image.open(og_path).convert("RGB")
if og.size != (1280, 640):
    og = og.resize((1280, 640), Image.Resampling.LANCZOS)
og.save(og_path, format="PNG", optimize=True)

print(f"hero {hero.size} {hero.mode} {hero_path.stat().st_size}")
print(f"og {og.size} {og.mode} {og_path.stat().st_size}")
