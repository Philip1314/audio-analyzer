import librosa
import numpy as np
import json
import sys
import os

def load_audio(file_path):
    y, sr = librosa.load(file_path, sr=None)
    return y, sr

def analyze_loudness(y):
    rms = np.sqrt(np.mean(y**2))
    db = 20 * np.log10(rms + 1e-9)
    return round(db, 2)

def analyze_silence(y, sr, silence_thresh_db=-35):
    frame_len = int(sr * 0.5)
    step = frame_len // 2
    silent_frames = 0
    total_frames = 0

    for i in range(0, len(y), step):
        frame = y[i:i + frame_len]
        if len(frame) < frame_len:
            continue
        db = 20 * np.log10(np.sqrt(np.mean(frame**2)) + 1e-9)
        if db < silence_thresh_db:
            silent_frames += 1
        total_frames += 1

    silence_ratio = silent_frames / total_frames
    return round(silence_ratio * 100, 2)  # in percent

def apply_rules(loudness_db, silence_pct, config):
    results = {}
    results['Loudness (dBFS)'] = loudness_db
    results['Silence (%)'] = silence_pct

    pass_loudness = config['min_loudness_db'] <= loudness_db <= config['max_loudness_db']
    pass_silence = silence_pct <= config['max_silence_pct']

    results['PASS'] = pass_loudness and pass_silence
    return results

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python audio_analyzer.py example_audio/yourfile.wav")
        sys.exit(1)

    audio_file = sys.argv[1]
    if not os.path.exists(audio_file):
        print(f"File not found: {audio_file}")
        sys.exit(1)

    with open("rules_config.json", "r") as f:
        config = json.load(f)

    y, sr = load_audio(audio_file)
    loudness = analyze_loudness(y)
    silence = analyze_silence(y, sr)
    results = apply_rules(loudness, silence, config)

    print("📊 Analysis Results:")
    for k, v in results.items():
        print(f"  {k}: {v}")
