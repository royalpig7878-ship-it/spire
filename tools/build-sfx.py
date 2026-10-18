"""Builds the game's sound file from a sound-effects pack you own.

Usage (from the project folder):
    python tools/build-sfx.py "C:\\Users\\Owner\\Desktop\\Building Tycoon Sound FX Pack"

It picks a few clips for each job in the game, then for every clip it
  - joins stereo into mono and trims silence from both ends,
  - cuts it to a sensible length with a soft fade-out,
  - filters and shrinks it to 22 kHz (smaller download, fine for a phone speaker),
  - evens out the volume,
and packs them one after another into ONE file, plus a small list saying where
each clip starts. The original files are never copied into the project.

Output: assets/sfx/sfx.wav and assets/sfx/sfx.json
(The pack's license allows use inside a game but not sharing the raw files, so
the game ships this changed, combined version instead.)
"""
import json
import os
import sys
import wave

import numpy as np

# job name -> (max seconds, [clips as "Folder/File name" without .wav])
GROUPS = {
    # building
    "place": (0.9, ["Building/Basic Placement A", "Building/Basic Placement C", "Building/Basic Placement E", "Building/Basic Placement G"]),
    "buildLow": (1.3, ["Building/Build Low Tier A", "Building/Build Low Tier C"]),
    "buildMed": (1.9, ["Building/Build Medium Tier A", "Building/Build Medium Tier C"]),
    "buildHigh": (2.3, ["Building/Build High Tier A", "Building/Build High Tier C"]),
    "buildHospital": (2.3, ["Building/Build Hospital A"]),
    "buildPolice": (2.3, ["Building/Build Police Station A"]),
    "buildComms": (2.0, ["Building/Communications A"]),
    "dragStep": (0.3, ["Building/Place Drag Single A", "Building/Place Drag Single B", "Building/Place Drag Single C"]),
    # removing
    "demolish": (1.8, ["Removal/Deconstruct A", "Removal/Deconstruct B", "Removal/Deconstruct C"]),
    "bulldoze": (2.0, ["Removal/Bulldoze A"]),
    "scrap": (1.4, ["Removal/Scrap A", "Removal/Scrap C"]),
    "sell": (1.1, ["Removal/Sell Building A", "Removal/Sell Building B"]),
    # feedback
    "denied": (0.9, ["Notifications/Placement Denied A", "Notifications/Placement Denied B"]),
    "select": (0.7, ["Selection/Building Select Brick A", "Selection/Building Select Brick B", "Selection/Building Select Brick C"]),
    "good": (2.0, ["Notifications/Notification Positive A", "Notifications/Notification Positive B"]),
    "bad": (1.6, ["Notifications/Notification Negative A", "Notifications/Notification Negative B"]),
    "achievement": (2.8, ["Notifications/Achievement A", "Notifications/Achievement B"]),
    "levelUp": (3.0, ["Notifications/City Level Up A", "Notifications/City Level Up B"]),
    # money
    "money": (2.0, ["Economy/Money Earned A", "Economy/Money Earned B"]),
    "econUp": (2.2, ["Economy/Economic Turn Positive A"]),
    "econDown": (2.2, ["Economy/Economic Turn Negative A", "Economy/Economic Turn Negative B"]),
    "tax": (2.0, ["Economy/Tax Notification A"]),
    "legislation": (1.4, ["Economy/Sign Legislation A"]),
    # warnings
    "disaster": (2.8, ["Warnings/Disaster Warning A"]),
    "warning": (2.4, ["Warnings/Warning A", "Warnings/Warning B"]),
    # upgrades
    "upgrade": (2.4, ["Upgrades/Upgrade Building A"]),
    "upgradeSmall": (1.6, ["Upgrades/Upgrade Building Small A", "Upgrades/Upgrade Building Small B"]),
    "upgradeObject": (1.7, ["Upgrades/Upgrade Object Small A"]),
    # the world outside
    "bird": (2.4, ["Environment/Birds Oneshot A", "Environment/Birds Oneshot B", "Environment/Birds Oneshot C", "Environment/Birds Oneshot D"]),
    "hoot": (0.8, ["Traffic/Car Hoot A", "Traffic/Car Hoot B"]),
    "engine": (4.0, ["Traffic/Distant Engine"]),
    "police": (3.6, ["Traffic/Distant Police Siren A"]),
    "ambulance": (4.0, ["Traffic/Ambulance Siren A"]),
}

OUT_RATE_DIVISOR = 2  # 44100 -> 22050 Hz
GAP = 0.05  # seconds of silence between clips


def read_wav(path):
    with wave.open(path, "rb") as w:
        channels, width, rate, frames = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        raw = w.readframes(frames)
    if width != 2:
        raise SystemExit(f"{path}: expected 16-bit audio")
    data = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if channels > 1:
        data = data.reshape(-1, channels).mean(axis=1)
    return data, rate


def lowpass_decimate(x, rate, divisor):
    """Windowed-sinc low-pass just under the new Nyquist, then keep every `divisor`-th sample."""
    cutoff = 0.45 * rate / divisor  # Hz
    taps = 127
    n = np.arange(taps) - (taps - 1) / 2
    h = np.sinc(2 * cutoff / rate * n) * np.hamming(taps)
    h /= h.sum()
    y = np.convolve(x, h, mode="same")
    return y[::divisor]


def process(path, max_seconds):
    x, rate = read_wav(path)
    peak = float(np.max(np.abs(x))) or 1.0
    loud = np.where(np.abs(x) > 0.015 * peak)[0]
    if len(loud):
        start = max(0, loud[0] - int(0.005 * rate))
        end = min(len(x), loud[-1] + int(0.04 * rate))
        x = x[start:end]
    x = lowpass_decimate(x, rate, OUT_RATE_DIVISOR)
    out_rate = rate // OUT_RATE_DIVISOR
    cap = int(max_seconds * out_rate)
    if len(x) > cap:
        x = x[:cap]
        fade = int(0.18 * out_rate)
        x[-fade:] *= np.linspace(1, 0, fade)
    # short fades so clips never click
    fin, fout = int(0.003 * out_rate), int(0.012 * out_rate)
    if len(x) > fin + fout:
        x[:fin] *= np.linspace(0, 1, fin)
        x[-fout:] *= np.linspace(1, 0, fout)
    x = x / (float(np.max(np.abs(x))) or 1.0) * 0.89  # even out the volume
    return x, out_rate


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    pack = sys.argv[1]
    base = os.path.join(pack, "Non Loops")
    pieces, groups, rate, cursor = [], {}, None, 0.0
    for name, (max_seconds, clips) in GROUPS.items():
        groups[name] = []
        for clip in clips:
            path = os.path.join(base, clip.replace("/", os.sep) + ".wav")
            if not os.path.exists(path):
                raise SystemExit(f"Missing: {path}")
            x, rate = process(path, max_seconds)
            groups[name].append({"s": round(cursor, 4), "d": round(len(x) / rate, 4)})
            pieces.append(x)
            gap = np.zeros(int(GAP * rate), dtype=np.float32)
            pieces.append(gap)
            cursor += (len(x) + len(gap)) / rate
    audio = np.concatenate(pieces)
    pcm = np.clip(audio * 32767, -32768, 32767).astype("<i2")
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "sfx")
    os.makedirs(out_dir, exist_ok=True)
    with wave.open(os.path.join(out_dir, "sfx.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())
    with open(os.path.join(out_dir, "sfx.json"), "w", encoding="utf8") as f:
        json.dump({"rate": rate, "groups": groups}, f, separators=(",", ":"))
    clips = sum(len(v) for v in groups.values())
    print(f"{clips} clips in {len(groups)} groups, {cursor:.1f} s, {len(pcm) * 2 / 1e6:.2f} MB at {rate} Hz")


if __name__ == "__main__":
    main()
