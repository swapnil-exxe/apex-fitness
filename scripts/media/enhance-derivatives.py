#!/usr/bin/env python3
"""APEX Fitness — High-Fidelity Derivative Media Enhancement Pipeline

Generates Tier C (Enhanced Upscale) derivatives for exercises using high-order
Lanczos windowed-sinc resampling. Masters in catalogue/media/ are NEVER modified.

Usage:
    python3 scripts/media/enhance-derivatives.py [--all | --sample | --ids 0001,0002,4209]
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
CATALOGUE_DIR = os.path.join(ROOT, 'catalogue/media')
ENHANCED_DIR = os.path.join(CATALOGUE_DIR, 'enhanced')
STILL_OUT = os.path.join(ENHANCED_DIR, 'still')
CLIP_OUT = os.path.join(ENHANCED_DIR, 'clip')
MANIFEST_PATH = os.path.join(ENHANCED_DIR, 'manifest.json')

DEFAULT_SAMPLES = ['0001', '0002', '0007', '0027', '0032', '0043', '0293', '0499', '0634', '0861', '4209', '6554']
TARGET_RES = 720  # 4x upscale from 180x180 master


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def compute_reconstruction_psnr(orig_img, enh_img):
    """Downsamples the enhanced image back to original resolution and computes PSNR."""
    down = enh_img.resize(orig_img.size, Image.Resampling.LANCZOS)
    a = np.array(orig_img.convert('RGB'), dtype=np.float64)
    b = np.array(down.convert('RGB'), dtype=np.float64)
    mse = np.mean((a - b) ** 2)
    if mse == 0:
        return float('inf')
    return float(10 * np.log10(255.0 ** 2 / mse))


def enhance_still(ex_id):
    src = os.path.join(CATALOGUE_DIR, 'still', f'{ex_id}.webp')
    dst = os.path.join(STILL_OUT, f'{ex_id}.webp')
    if not os.path.exists(src):
        return None

    orig = Image.open(src)
    orig_w, orig_h = orig.size
    orig_hash = sha256_file(src)
    orig_size = os.path.getsize(src)

    # 4x Lanczos sharp resampling
    enhanced = orig.resize((TARGET_RES, TARGET_RES), Image.Resampling.LANCZOS)
    enhanced.save(dst, 'WEBP', lossless=True, quality=100, method=6)

    psnr = compute_reconstruction_psnr(orig, enhanced)
    enh_size = os.path.getsize(dst)
    enh_hash = sha256_file(dst)

    return {
        'id': ex_id,
        'type': 'still',
        'tier': 'Tier C (Enhanced Upscale)',
        'method': 'Lanczos-4 sinc windowed interpolation (lossless WebP)',
        'source': {
            'file': f'still/{ex_id}.webp',
            'resolution': f'{orig_w}x{orig_h}',
            'bytes': orig_size,
            'sha256': orig_hash,
            'native_status': 'Original Master'
        },
        'enhanced': {
            'file': f'enhanced/still/{ex_id}.webp',
            'resolution': f'{TARGET_RES}x{TARGET_RES}',
            'bytes': enh_size,
            'sha256': enh_hash,
            'reconstruction_psnr_db': round(psnr, 2)
        }
    }


def enhance_clip(ex_id):
    src = os.path.join(CATALOGUE_DIR, 'clip', f'{ex_id}.mp4')
    dst = os.path.join(CLIP_OUT, f'{ex_id}.mp4')
    if not os.path.exists(src):
        return None

    orig_hash = sha256_file(src)
    orig_size = os.path.getsize(src)

    # Probe original stream
    probe_cmd = [
        'ffprobe', '-v', 'error',
        '-show_entries', 'stream=width,height,r_frame_rate,duration,nb_frames,bit_rate',
        '-of', 'json', src
    ]
    probe = json.loads(subprocess.check_output(probe_cmd).decode('utf-8'))
    stream = probe.get('streams', [{}])[0]
    orig_w = int(stream.get('width', 180))
    orig_h = int(stream.get('height', 180))
    fps = stream.get('r_frame_rate', '10/1')
    nb_frames = stream.get('nb_frames', 'N/A')

    # ffmpeg Lanczos scaling with high quality CRF 16, animation tune
    vf = f'scale={TARGET_RES}:{TARGET_RES}:flags=lanczos'
    cmd = [
        'ffmpeg', '-v', 'warning', '-y', '-i', src,
        '-vf', vf,
        '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation',
        '-pix_fmt', 'yuv420p', '-crf', '16',
        '-r', fps,
        '-movflags', '+faststart',
        '-an',
        dst
    ]
    subprocess.run(cmd, check=True)

    enh_hash = sha256_file(dst)
    enh_size = os.path.getsize(dst)

    return {
        'id': ex_id,
        'type': 'clip',
        'tier': 'Tier C (Enhanced Upscale)',
        'method': 'FFmpeg Lanczos sharp scaling, libx264 slow CRF 16 tune=animation',
        'source': {
            'file': f'clip/{ex_id}.mp4',
            'resolution': f'{orig_w}x{orig_h}',
            'fps': fps,
            'nb_frames': nb_frames,
            'bytes': orig_size,
            'sha256': orig_hash,
            'native_status': 'Original Master'
        },
        'enhanced': {
            'file': f'enhanced/clip/{ex_id}.mp4',
            'resolution': f'{TARGET_RES}x{TARGET_RES}',
            'fps': fps,
            'bytes': enh_size,
            'sha256': enh_hash
        }
    }


def main():
    parser = argparse.ArgumentParser(description='APEX Fitness Derivative Media Enhancement Pipeline')
    parser.add_argument('--all', action='store_true', help='Process all exercises in catalogue')
    parser.add_argument('--sample', action='store_true', default=True, help='Process representative sample set')
    parser.add_argument('--ids', type=str, help='Comma-separated list of IDs to process')
    args = parser.parse_args()

    os.makedirs(STILL_OUT, exist_ok=True)
    os.makedirs(CLIP_OUT, exist_ok=True)

    if args.ids:
        target_ids = [i.strip().zfill(4) for i in args.ids.split(',') if i.strip()]
    elif args.all:
        target_ids = sorted([f.split('.')[0] for f in os.listdir(os.path.join(CATALOGUE_DIR, 'still')) if f.endswith('.webp')])
    else:
        target_ids = DEFAULT_SAMPLES

    print('=' * 80)
    print(f'APEX FITNESS — ENHANCING DERIVATIVE MEDIA ({len(target_ids)} exercises -> {TARGET_RES}x{TARGET_RES})')
    print('=' * 80)

    manifest_data = {
        'pipeline_version': '1.0.0',
        'tier_architecture': {
            'Tier A': 'Original Master (180x180 px, immutable upstream source)',
            'Tier B': 'High-Resolution Source (native 720p/1080p/4K upstream when verified; 0 public native upstream exist)',
            'Tier C': 'Enhanced Upscale (720x720 px Lanczos-sinc high-order derivative, zero AI distortion)'
        },
        'target_resolution': f'{TARGET_RES}x{TARGET_RES}',
        'items': []
    }

    for idx, ex_id in enumerate(target_ids, 1):
        print(f'[{idx}/{len(target_ids)}] Enhancing exercise {ex_id}...')
        still_info = enhance_still(ex_id)
        clip_info = enhance_clip(ex_id)
        if still_info:
            manifest_data['items'].append(still_info)
            print(f'   ✓ Still: 180x180 -> {TARGET_RES}x{TARGET_RES} ({still_info["enhanced"]["bytes"]:,} B, PSNR: {still_info["enhanced"]["reconstruction_psnr_db"]} dB)')
        if clip_info:
            manifest_data['items'].append(clip_info)
            print(f'   ✓ Clip:  180x180 -> {TARGET_RES}x{TARGET_RES} ({clip_info["enhanced"]["bytes"]:,} B, FPS: {clip_info["enhanced"]["fps"]})')

    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest_data, f, indent=2)

    print('-' * 80)
    print(f'Enhanced manifest written to: {MANIFEST_PATH}')
    print(f'Total enhanced items generated: {len(manifest_data["items"])}')
    print('Original master files in catalogue/media/ remain 100% UNTOUCHED.')
    print('=' * 80)


if __name__ == '__main__':
    main()
