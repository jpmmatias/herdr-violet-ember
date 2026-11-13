#!/usr/bin/env python3
"""Capture a short Herdr-only preview and embed it in the README."""

import argparse
from pathlib import Path
import shutil
import subprocess
import tempfile
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seconds', type=int, default=8)
    parser.add_argument('--fps', type=int, default=5)
    args = parser.parse_args()
    if not 1 <= args.seconds <= 30 or not 1 <= args.fps <= 15:
        parser.error('Use 1–30 seconds and 1–15 frames per second.')
    for command in ('herdr-app', 'ffmpeg'):
        if not shutil.which(command):
            parser.error(f'{command} must be on PATH.')
    root = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix='violet-ember-preview-') as temp:
        frames = Path(temp)
        # Check connectivity before the countdown or changing existing previews.
        subprocess.run(['herdr-app', 'shot', str(frames / 'check.png')],
                       check=True, stdout=subprocess.DEVNULL)
        print('Select Violet Ember and hide private content. Capture starts in 3 seconds.', flush=True)
        time.sleep(3)
        count = args.seconds * args.fps
        print(f'Recording {args.seconds} seconds. Interact with the Herdr window now.', flush=True)
        start = time.monotonic()
        for index in range(count):
            time.sleep(max(0, start + index / args.fps - time.monotonic()))
            subprocess.run(['herdr-app', 'shot', str(frames / f'{index:04d}.png')],
                           check=True, stdout=subprocess.DEVNULL)
        elapsed = time.monotonic() - start
        if elapsed > args.seconds * 1.25:
            print('Capture was slower than requested; GIF playback will be sped up.')
        output = frames / 'preview.gif'
        subprocess.run([
            'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
            '-framerate', str(args.fps), '-i', str(frames / '%04d.png'),
            '-filter_complex',
            'scale=min(1200\\,iw):-2:flags=lanczos,split[a][b];'
            '[a]palettegen[p];[b][p]paletteuse=dither=sierra2_4a',
            '-loop', '0', str(output),
        ], check=True)
        shutil.copyfile(output, root / 'preview.gif')
        shutil.copyfile(frames / '0000.png', root / 'preview.png')
    readme = root / 'README.md'
    text = readme.read_text().replace(
        '![Violet Ember preview](preview.svg)',
        '![Violet Ember preview](preview.gif)',
    ).replace(
        '*Illustrative palette preview; not a live Herdr capture.*',
        '*Recorded in Herdr desktop.*',
    )
    readme.write_text(text)
    print('Saved preview.gif and preview.png; updated README. Review before publishing.')


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as error:
        raise SystemExit(f'Capture failed (exit {error.returncode}). Check Herdr is running and accessible.')
