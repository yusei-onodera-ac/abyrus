"""Small pictures made from each character's finished illustration (public/assets/characters/<id>.png), so the game need not
keep the big illustrations of everybody in memory (an iPhone cannot): the lists, the 図鑑, the gacha rates, the party bars
and the battle use these, and a big illustration is loaded only when one is shown big (the hero's detail screen, the Home
showcase, a single gacha pull - src/game/characters/HeroArt.ts).

  characters/bust/<id>.png  256x256  the head-and-chest square a tile (ui/HeroSlot.ts) shows. Same crop as it makes itself:
                                     BUST_SIDE / BUST_TOP below must equal the ones in HeroSlot.ts.
  characters/fit/<id>.png   192x192  the whole figure fitted into a square, centred: what CharacterGenerator bakes at
                                     runtime (SIZE 96 x ILLUSTRATION_SCALE 2) for the small portraits.

The illustrations themselves are not touched (and are not made smaller): these are only the two views the small widgets
already drew from them, made once here instead of every start. Run:  python tools/art/make_thumbs.py  (all)  or  --only a,b
"""
import sys
from pathlib import Path

from PIL import Image

BUST_SIDE = 0.56
BUST_TOP = 0.03
BUST_SIZE = 256
FIT_SIZE = 192

root = Path(__file__).resolve().parent.parent.parent / 'public' / 'assets' / 'characters'
only = sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else None


def bust(im: Image.Image) -> Image.Image:
    w, h = im.size
    side = w * BUST_SIDE
    x0 = (w - side) / 2
    y0 = h * BUST_TOP
    return im.resize((BUST_SIZE, BUST_SIZE), Image.LANCZOS, box=(x0, y0, x0 + side, y0 + side))


def fit(im: Image.Image) -> Image.Image:
    w, h = im.size
    scale = min(FIT_SIZE / w, FIT_SIZE / h)
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    small = im.resize((nw, nh), Image.LANCZOS)
    out = Image.new('RGBA', (FIT_SIZE, FIT_SIZE), (0, 0, 0, 0))
    out.paste(small, ((FIT_SIZE - nw) // 2, (FIT_SIZE - nh) // 2))
    return out


(root / 'bust').mkdir(exist_ok=True)
(root / 'fit').mkdir(exist_ok=True)
count = 0
for src in sorted(root.glob('*.png')):
    if only and src.stem not in only:
        continue
    im = Image.open(src).convert('RGBA')
    bust(im).save(root / 'bust' / src.name, optimize=True)
    fit(im).save(root / 'fit' / src.name, optimize=True)
    count += 1
print(f'{count} characters -> bust/ ({BUST_SIZE}px) and fit/ ({FIT_SIZE}px)')
