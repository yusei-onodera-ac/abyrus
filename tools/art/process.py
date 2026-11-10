"""Turns the raw pictures made by generate.mjs into the files the game loads.

  python tools/art/process.py                 write finished files to tools/art/out/ and a contact sheet per group
  python tools/art/process.py --install       write them straight into public/assets/ (what the game loads)
  python tools/art/process.py --only item_wood,bg_shop    --group village
  python tools/art/process.py --compare       all the tries of each picture side by side (several tries: generate.mjs --variants 3)
  tools/art/pick.json  { "village_castle_1": 2 }  chooses which try is finished and installed (the first by default)

Modes (see manifest.mjs): 'cutout' turns the white page transparent and crops to the figure (square icon or trimmed to the
figure for village pictures), 'tile' does the same for a framed tile, 'jpg' crops/resizes a background.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
RAW = HERE / 'raw'
OUT = HERE / 'out'
ASSETS = ROOT / 'public' / 'assets'

args = sys.argv[1:]


def opt(name):
    return args[args.index(f'--{name}') + 1] if f'--{name}' in args else None


INSTALL = '--install' in args
ONLY = opt('only').split(',') if opt('only') else None
GROUP = opt('group').split(',') if opt('group') else None


def load_manifest():
    out = subprocess.run(['node', str(HERE / 'manifest-json.mjs')], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', check=True)
    return json.loads(out.stdout)


def raw_variants(entry_id):
    """Every raw try of a picture, as {number: path}: <id>.png is try 1, <id>.v2.png try 2..."""
    found = {}
    for p in RAW.glob(f'{entry_id}*.*'):
        stem = p.stem
        if stem == entry_id:
            found[1] = p
        elif stem.startswith(f'{entry_id}.v') and stem[len(entry_id) + 2:].isdigit():
            found[int(stem[len(entry_id) + 2:])] = p
    return found


def picks():
    """tools/art/pick.json: { "<id>": <try number> } - which try to use (the first by default)."""
    f = HERE / 'pick.json'
    return json.loads(f.read_text(encoding='utf-8')) if f.exists() else {}


def find_raw(entry_id):
    found = raw_variants(entry_id)
    if not found:
        return None
    return found.get(picks().get(entry_id, 1)) or found[min(found)]


def compare_sheet(group, rows):
    """All the tries of each picture side by side (raw, uncut) to choose from: _compare_<group>.png."""
    cell = 300
    width = max(len(v) for _, v in rows)
    img = Image.new('RGB', (width * cell, len(rows) * (cell + 22)), (70, 74, 84))
    draw = ImageDraw.Draw(img)
    for r, (entry_id, variants) in enumerate(rows):
        for c, (n, path) in enumerate(sorted(variants.items())):
            thumb = Image.open(path).convert('RGB')
            thumb.thumbnail((cell - 8, cell - 8))
            img.paste(thumb, (c * cell + 4, r * (cell + 22) + 4))
            draw.text((c * cell + 6, r * (cell + 22) + cell), f'{entry_id}  try {n}', fill=(255, 255, 255))
    path = OUT / f'_compare_{group}.png'
    img.save(path)
    return path


def page_mask(rgb, tolerance=26):
    """True for the plain page: pixels close to the border colour AND connected to the border."""
    h, w, _ = rgb.shape
    edge = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]).astype(np.float32)
    page = np.median(edge, axis=0)
    close = np.abs(rgb.astype(np.float32) - page).max(axis=2) <= tolerance
    labels, _ = ndimage.label(close)
    border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    border = border[border != 0]
    return np.isin(labels, border) & close


def hole_mask(rgb, bg, min_area_ratio=0.0003):
    """Big flat page-white areas that the figure encloses (the inside of a ring, a chain loop): the page shows through
    them. Only pure page white counts, so silver and shaded white parts of the art itself are kept."""
    edge = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]).astype(np.float32)
    page = np.median(edge, axis=0)
    flat = np.abs(rgb.astype(np.float32) - page).max(axis=2) <= 7
    labels, n = ndimage.label(flat & ~bg)
    if n == 0:
        return np.zeros_like(bg)
    sizes = ndimage.sum(flat & ~bg, labels, index=np.arange(1, n + 1))
    big = 1 + np.where(sizes >= min_area_ratio * rgb.shape[0] * rgb.shape[1])[0]
    luminance = rgb.astype(np.float32) @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    holes = np.zeros_like(bg)
    for label in big:
        region = labels == label
        # The page seen through a ring or a chain loop is bordered by the figure's dark outline; a white highlight on
        # silver is bordered by bright metal. Only the first is a hole.
        ring = ndimage.binary_dilation(region, iterations=4) & ~region
        if ring.any() and luminance[ring].mean() < 120:
            holes |= region
    return holes


def cut_out(img, min_speck=40, holes=False):
    rgb = np.asarray(img.convert('RGB'))
    bg = page_mask(rgb)
    if holes:
        bg = bg | hole_mask(rgb, bg)
    keep = ~bg
    # Drop specks of leftover page-coloured noise: tiny islands.
    labels, n = ndimage.label(keep)
    if n > 1:
        sizes = ndimage.sum(keep, labels, index=np.arange(1, n + 1))
        small = np.isin(labels, 1 + np.where(sizes < min_speck)[0])
        keep &= ~small
    # Shave the pale fringe by one pixel, then soften the edge.
    keep = ndimage.binary_erosion(keep, iterations=1)
    alpha = ndimage.gaussian_filter(keep.astype(np.float32), 0.8)
    alpha = np.clip((alpha - 0.15) / 0.7, 0, 1)
    out = np.dstack([rgb, (alpha * 255).astype(np.uint8)])
    return Image.fromarray(out, 'RGBA')


def bbox_of(img, threshold=12):
    a = np.asarray(img.getchannel('A'))
    ys, xs = np.where(a > threshold)
    if len(xs) == 0:
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def finish_cutout(raw, entry):
    img = cut_out(raw, holes=True)
    box = bbox_of(img)
    if box is None:
        raise ValueError('nothing left after the cut-out (is the page really white?)')
    img = img.crop(box)
    w, h = img.size
    if entry.get('fit') == 'square':
        side = int(max(w, h) * 1.08)
        canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        canvas.paste(img, ((side - w) // 2, (side - h) // 2), img)
        return canvas.resize(tuple(entry['size']), Image.LANCZOS)
    # 'trim': keep the crop exactly (the ground diamond touches the sides and the bottom); only limit the width.
    max_w = entry['size'][0]
    if w > max_w:
        img = img.resize((max_w, round(h * max_w / w)), Image.LANCZOS)
    return img


def finish_tile(raw, entry):
    img = cut_out(raw, min_speck=200)
    box = bbox_of(img)
    if box is None:
        raise ValueError('nothing left after the cut-out')
    img = img.crop(box)
    w, h = img.size
    side = max(w, h)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2), img)
    return canvas.resize(tuple(entry['size']), Image.LANCZOS)


def finish_jpg(raw, entry):
    tw, th = entry['size']
    img = raw.convert('RGB')
    scale = max(tw / img.width, th / img.height)
    resized = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    left = (resized.width - tw) // 2
    top = (resized.height - th) // 2
    return resized.crop((left, top, left + tw, top + th))


def sheet(group, items):
    cell = 260
    cols = 5
    rows = (len(items) + cols - 1) // cols
    img = Image.new('RGB', (cols * cell, rows * (cell + 20)), (70, 74, 84))
    draw = ImageDraw.Draw(img)
    for i, (entry, im) in enumerate(items):
        x, y = (i % cols) * cell, (i // cols) * (cell + 20)
        thumb = im.copy()
        thumb.thumbnail((cell - 8, cell - 8))
        if thumb.mode == 'RGBA':
            img.paste(thumb, (x + 4, y + 4), thumb)
        else:
            img.paste(thumb, (x + 4, y + 4))
        draw.text((x + 6, y + cell), entry['id'], fill=(255, 255, 255))
    path = OUT / f'_sheet_{group}.png'
    img.save(path)
    return path


def main():
    manifest = load_manifest()
    OUT.mkdir(parents=True, exist_ok=True)
    if '--compare' in args:
        by_group = {}
        for entry in manifest:
            if (ONLY and entry['id'] not in ONLY) or (GROUP and entry['group'] not in GROUP):
                continue
            variants = raw_variants(entry['id'])
            if len(variants) > 1:
                by_group.setdefault(entry['group'], []).append((entry['id'], variants))
        for group, rows in by_group.items():
            print('compare:', compare_sheet(group, rows[:8]).relative_to(ROOT), f'({len(rows[:8])} of {len(rows)} pictures)')
        if not by_group:
            print('no picture has more than one try (make them with --variants 3)')
        return
    done = {}
    for entry in manifest:
        if ONLY and entry['id'] not in ONLY:
            continue
        if GROUP and entry['group'] not in GROUP:
            continue
        raw_path = find_raw(entry['id'])
        if raw_path is None:
            continue
        try:
            raw = Image.open(raw_path)
            raw.load()
            if entry['mode'] == 'cutout':
                result = finish_cutout(raw, entry)
            elif entry['mode'] == 'tile':
                result = finish_tile(raw, entry)
            else:
                result = finish_jpg(raw, entry)
        except Exception as e:  # noqa: BLE001 - report and go on with the rest
            print(f"FAIL {entry['id']}: {e}")
            continue
        target = (ASSETS if INSTALL else OUT) / entry['out']
        target.parent.mkdir(parents=True, exist_ok=True)
        if entry['mode'] == 'jpg':
            result.save(target, quality=82, optimize=True, progressive=True)
        else:
            result.save(target, optimize=True)
        done.setdefault(entry['group'], []).append((entry, result))
        print(f"ok   {entry['id']} -> {target.relative_to(ROOT)}  {result.size[0]}x{result.size[1]}  {target.stat().st_size // 1024} KB")
    for group, items in done.items():
        print('sheet:', sheet(group, items).relative_to(ROOT))
    if not done:
        print('nothing to process (no raw pictures yet: run node tools/art/generate.mjs first)')


main()
