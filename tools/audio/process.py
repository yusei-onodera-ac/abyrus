"""Turns the raw audio made by generate.mjs into the mp3 files the game loads (needs: pip install --user imageio-ffmpeg).

  python tools/audio/process.py              write to tools/audio/out/ (a copy to listen to first)
  python tools/audio/process.py --install    write into public/assets/ (what the game loads)
  python tools/audio/process.py --only bgm_home,home_welcome
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
RAW = HERE / 'raw'
OUT = HERE / 'out'
ASSETS = ROOT / 'public' / 'assets'
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
args = sys.argv[1:]
INSTALL = '--install' in args
ONLY = args[args.index('--only') + 1].split(',') if '--only' in args else None


def load_jobs():
    out = subprocess.run(['node', str(HERE / 'manifest-json.mjs')], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', check=True)
    jobs = json.loads(out.stdout)
    lines = RAW / 'lines.json'
    if lines.exists():
        for line in json.loads(lines.read_text(encoding='utf-8')):
            jobs.append({'id': line['id'], 'kind': 'voice', 'out': f"voice/{line['id']}.mp3"})
    return jobs


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    return p.returncode, p.stderr


def duration_and_peak(path):
    _, err = run([FFMPEG, '-hide_banner', '-i', str(path), '-af', 'volumedetect', '-f', 'null', '-'])
    d = re.search(r'Duration: (\d+):(\d+):([\d.]+)', err)
    seconds = int(d.group(1)) * 3600 + int(d.group(2)) * 60 + float(d.group(3)) if d else 0
    mean = re.search(r'mean_volume: (-?[\d.]+) dB', err)
    peak = re.search(r'max_volume: (-?[\d.]+) dB', err)
    return seconds, float(mean.group(1)) if mean else None, float(peak.group(1)) if peak else None


def filters(job):
    kind = job['kind']
    if kind == 'voice':
        return ['-ac', '1', '-ar', '24000', '-b:a', '64k', '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:stop_periods=1:stop_threshold=-50dB:stop_duration=0.4,loudnorm=I=-16:TP=-1.5:LRA=11']
    if kind == 'jingle':
        s = job['seconds']
        return ['-t', str(s), '-ac', '2', '-ar', '44100', '-b:a', '128k', '-af', f'afade=t=out:st={s - 1.2}:d=1.2,loudnorm=I=-16:TP=-1.5:LRA=11']
    if kind == 'sfx':
        s = job['seconds']
        return ['-t', str(s), '-ac', '1', '-ar', '44100', '-b:a', '96k', '-af', f'afade=t=out:st={max(0, s - 0.08)}:d=0.08,loudnorm=I=-16:TP=-1.5:LRA=11']
    # music: a loop
    return ['-ac', '2', '-ar', '44100', '-b:a', '128k', '-af', 'afade=t=in:d=0.03,loudnorm=I=-20:TP=-1.5:LRA=11']


def main():
    for job in load_jobs():
        if ONLY and job['id'] not in ONLY:
            continue
        src = RAW / f"{job['id']}.wav"
        if not src.exists():
            continue
        target = (ASSETS if INSTALL else OUT) / job['out']
        target.parent.mkdir(parents=True, exist_ok=True)
        code, err = run([FFMPEG, '-y', '-hide_banner', '-i', str(src), *filters(job), '-codec:a', 'libmp3lame', str(target)])
        if code != 0:
            print(f"FAIL {job['id']}: {err[-200:]}")
            continue
        seconds, mean, peak = duration_and_peak(target)
        print(f"ok   {job['id']:<22} {seconds:5.1f}s  mean {mean} dB  peak {peak} dB  {target.stat().st_size // 1024} KB -> {target.relative_to(ROOT)}")


main()
