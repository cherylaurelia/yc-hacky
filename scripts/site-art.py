# Generates the marketing site's vector asset (fixed seeds, so every run gives the same files):
#   public/site/brush.svg  a sage dry-brush stroke that sits behind the hero text
# Run: python3 scripts/site-art.py
import math, random, pathlib

out = pathlib.Path(__file__).resolve().parent.parent / "public" / "site"
out.mkdir(parents=True, exist_ok=True)

def brush(seed=11, color="#e8edd2"):
    r = random.Random(seed)
    strokes = []
    for k in range(6):  # a few overlapping horizontal drags with ragged ends, like one loaded dry brush
        y = 22 + k * 10.5 + r.uniform(-2, 2)
        h = r.uniform(12, 17)
        x0 = r.uniform(0, 8)
        x1 = r.uniform(88, 100)
        top, bot = [], []
        n = 28
        for i in range(n + 1):
            x = x0 + (x1 - x0) * i / n
            wob = math.sin(i * 0.7 + k) * 0.8
            top.append((x, y - h / 2 + wob + r.uniform(-1.1, 1.1)))
            bot.append((x, y + h / 2 + wob + r.uniform(-1.1, 1.1)))
        tail = [(x1 + r.uniform(0, 3), y + r.uniform(-h / 3, h / 3))]
        head = [(x0 - r.uniform(0, 3), y + r.uniform(-h / 3, h / 3))]
        poly = top + tail + list(reversed(bot)) + head
        d = "M" + " L".join(f"{x:.2f},{yy:.2f}" for x, yy in poly) + "Z"
        strokes.append(f'<path d="{d}" fill="{color}" fill-opacity="{r.uniform(0.45, 0.75):.2f}"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">{"".join(strokes)}</svg>\n'

(out / "brush.svg").write_text(brush())
print("wrote", out / "brush.svg")
