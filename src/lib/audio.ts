/**
 * Web Audio & MediaRecorder utility for encrypted voice messaging
 */

export interface RecordedAudioPayload {
  buffer: ArrayBuffer;
  mimeType: string;
  durationSec: number;
  peaks: number[];
}

export interface ActiveRecorderSession {
  stop: () => Promise<RecordedAudioPayload>;
  cancel: () => void;
  getLivePeaks: () => number[];
}

function getSupportedAudioMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

export async function startVoiceRecording(): Promise<ActiveRecorderSession> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Peramban tidak mendukung perekaman audio mikrofon.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const mimeType = getSupportedAudioMimeType();
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 64;
  source.connect(analyser);

  const freqData = new Uint8Array(analyser.frequencyBinCount);
  const recordedPeaks: number[] = [];
  const chunks: Blob[] = [];
  const startedAt = Date.now();
  let cancelled = false;

  const peakTimer = window.setInterval(() => {
    analyser.getByteFrequencyData(freqData);
    let sum = 0;
    for (let i = 0; i < freqData.length; i++) {
      sum += freqData[i];
    }
    const avg = sum / Math.max(1, freqData.length) / 255;
    recordedPeaks.push(Math.min(1, Math.max(0.08, avg * 1.6)));
  }, 120);

  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) {
      chunks.push(ev.data);
    }
  };

  recorder.start(200);

  const cleanup = () => {
    window.clearInterval(peakTimer);
    stream.getTracks().forEach((t) => t.stop());
    if (audioCtx.state !== 'closed') {
      audioCtx.close().catch(() => {});
    }
  };

  return {
    getLivePeaks: () => {
      analyser.getByteFrequencyData(freqData);
      const bars: number[] = [];
      const step = Math.max(1, Math.floor(freqData.length / 24));
      for (let i = 0; i < 24; i++) {
        const val = freqData[Math.min(freqData.length - 1, i * step)] || 0;
        bars.push(Math.min(1, Math.max(0.08, (val / 255) * 1.45)));
      }
      return bars;
    },
    cancel: () => {
      cancelled = true;
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      cleanup();
    },
    stop: () => {
      return new Promise((resolve, reject) => {
        if (cancelled) {
          reject(new Error('Rekaman dibatalkan'));
          return;
        }
        recorder.onstop = async () => {
          cleanup();
          try {
            const actualMime = recorder.mimeType || mimeType || 'audio/webm';
            const blob = new Blob(chunks, { type: actualMime });
            const buffer = await blob.arrayBuffer();
            const durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
            const normalizedPeaks = downsamplePeaks(recordedPeaks, 28);
            resolve({
              buffer,
              mimeType: actualMime,
              durationSec,
              peaks: normalizedPeaks,
            });
          } catch (err) {
            reject(err);
          }
        };
        recorder.onerror = () => {
          cleanup();
          reject(new Error('Gagal memproses rekaman audio.'));
        };
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      });
    },
  };
}

function downsamplePeaks(raw: number[], targetLength: number): number[] {
  if (raw.length === 0) {
    return Array.from({ length: targetLength }, () => 0.25);
  }
  if (raw.length <= targetLength) {
    const out = [...raw];
    while (out.length < targetLength) {
      out.push(raw[out.length % raw.length] ?? 0.25);
    }
    return out;
  }
  const result: number[] = [];
  const bucketSize = raw.length / targetLength;
  for (let i = 0; i < targetLength; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.min(raw.length, Math.floor((i + 1) * bucketSize));
    let maxVal = 0.12;
    for (let j = start; j < end; j++) {
      if (raw[j] > maxVal) maxVal = raw[j];
    }
    result.push(Number(maxVal.toFixed(2)));
  }
  return result;
}
