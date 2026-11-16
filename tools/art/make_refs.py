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


HEROES = ['viara', 'astra', 'dias', 'celes', 'noct', 'gauss', 'aria', 'zeno', 'shade', 'nova', 'sylva', 'ignis', 'seira', 'ren',
          # the heroes of the year's pickup gachas and events (data/schedule.ts)
          'sieg', 'kurenai', 'thorne', 'ouka', 'quartz', 'brann', 'raijin', 'ivy', 'lilith', 'gale', 'suzuna', 'kohaku', 'baron',
          'noel', 'gen', 'jin', 'kaede', 'lune', 'miru', 'rosa', 'lena', 'taiga', 'toxar', 'nyx', 'haruka', 'sora', 'ines', 'felix',
          'tsubame', 'morrigan', 'orga', 'elrin', 'gustav', 'doris', 'bruno', 'mina', 'kai', 'fros', 'robin',
          # style references for the ★1 and ★2 characters added to double the roster (newCharacters.mjs)
          'mizuki', 'ald', 'momo', 'lumi', 'fern', 'enju']
for n in HEROES:
    save(root / 'characters' / f'{n}.png', f'{n}.jpg', (640, 860))
for n in ['wolf', 'lion', 'necrodraco', 'garumudo', 'arachnea', 'kongo', 'snake', 'bear']:
    save(root / 'enemies' / f'{n}.png', f'e_{n}.jpg', (640, 640))
print('refs written to', out)
