"""Small copies of the finished character and enemy pictures (on white), used as style/subject references when asking
the model for new pictures (manifest.mjs: refs: ['ref:viara.jpg']). Run once:  python tools/art/make_refs.py"""
from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parent.parent.parent / 'public' / 'assets'
out = Path(__file__).resolve().parent / 'refs'
out.mkdir(exist_ok=True)


def save(src, dst, box):
    im = Image.open(src).convert('RGBA')
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
    bg.alpha_composite(im)
    im = bg.convert('RGB')
    im.thumbnail(box)
    im.save(out / dst, quality=86)


for n in ['viara', 'astra', 'dias', 'celes', 'noct', 'gauss', 'aria', 'zeno', 'shade', 'nova', 'sylva', 'ignis', 'seira', 'ren']:
    save(root / 'characters' / f'{n}.png', f'{n}.jpg', (640, 860))
for n in ['wolf', 'lion', 'necrodraco', 'garumudo', 'arachnea', 'kongo', 'snake', 'bear']:
    save(root / 'enemies' / f'{n}.png', f'e_{n}.jpg', (640, 640))
print('refs written to', out)
