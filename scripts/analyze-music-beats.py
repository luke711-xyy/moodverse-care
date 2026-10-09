"""Measure an onset grid from a supplied audio file; no model dependency."""
import json
import subprocess
import sys
import numpy as np

rate, hop, window = 22050, 256, 1024
raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', sys.argv[1], '-f', 'f32le', '-ac', '1', '-ar', str(rate), 'pipe:1'])
audio = np.frombuffer(raw, dtype='<f4')
frames = np.lib.stride_tricks.sliding_window_view(audio, window)[::hop]
spectrum = np.abs(np.fft.rfft(frames * np.hanning(window), axis=1))
flux = np.maximum(0, np.diff(np.log1p(spectrum[:, 5:] * 10), axis=0)).sum(axis=1)
flux = np.maximum(0, flux - np.convolve(flux, np.ones(43)/43, mode='same'))
scores = []
for bpm in np.arange(65, 171, .1):
    lag = rate * 60 / (hop * bpm)
    corr = 0
    for multiple, weight in [(1, 1), (2, .6), (3, .3), (4, .2)]:
        shift = round(lag * multiple)
        corr += weight * np.dot(flux[shift:], flux[:-shift]) / (len(flux)-shift)
    scores.append((corr, float(bpm)))
bpm = max(scores)[1]
period = 60 / bpm
times = (np.arange(len(flux)) + 1) * hop / rate
phases = np.arange(0, period, .002)
phase_scores = [np.sum(flux * np.exp(-((np.remainder(times-offset+period/2, period)-period/2)/.04)**2)) for offset in phases]
offset = float(phases[np.argmax(phase_scores)])
beats = np.arange(offset, len(audio)/rate, period)
print(json.dumps({'bpm': round(bpm, 1), 'offsetSeconds': round(offset, 3), 'durationSeconds': round(len(audio)/rate, 3), 'beatsSeconds': np.round(beats, 3).tolist(), 'tempoCandidates': [[round(b, 1), round(s, 2)] for s, b in sorted(scores, reverse=True)[:5]]}))
