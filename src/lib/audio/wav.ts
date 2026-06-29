// Record mic audio as 16 kHz mono WAV — the format Bhashini ASR and
// OpenAI transcribe both accept reliably across Chrome, Firefox, and Safari.
// Also exposes live level (RMS 0-1) for waveform meters and optional auto-stop
// on silence for hands-free / push-to-talk reliability.

export type WavRecorder = {
  stop: () => Promise<Blob>;
  cancel: () => void;
  /** Seconds since recording started (live, monotonic). */
  elapsedMs: () => number;
};

export type WavRecorderOptions = {
  /** Fires ~20×/sec with RMS amplitude in [0, 1]. Use for waveform/level meter. */
  onLevel?: (rms: number) => void;
  /** Fires once when 'silenceMs' ms of continuous near-silence is detected after
   *  the user has actually spoken (rms crossed 'speechThreshold' at least once). */
  onSilence?: () => void;
  /** RMS below which a frame counts as silence. Default 0.015. */
  silenceThreshold?: number;
  /** RMS above which we consider the user has started speaking. Default 0.04. */
  speechThreshold?: number;
  /** Continuous silence (ms) after speech that triggers onSilence. Default 1500. */
  silenceMs?: number;
  /** Hard max recording length (ms). Default 30_000. */
  maxMs?: number;
  /** Fires when maxMs reached. */
  onMaxReached?: () => void;
};

export async function startWavRecording(opts: WavRecorderOptions = {}): Promise<WavRecorder> {
  const {
    onLevel,
    onSilence,
    silenceThreshold = 0.015,
    speechThreshold = 0.04,
    silenceMs = 1500,
    maxMs = 30_000,
    onMaxReached,
  } = opts;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const AudioCtx =
    (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
  const ctx = new AudioCtx();
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessor is deprecated but works in every browser including iOS Safari.
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];

  const startTs = performance.now();
  let hasSpoken = false;
  let silenceSince = 0;
  let firedSilence = false;
  let firedMax = false;

  node.onaudioprocess = (e) => {
    const data = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(data));

    // RMS
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / data.length);
    if (onLevel) {
      try { onLevel(Math.min(1, rms * 4)); } catch { /* ignore */ }
    }

    const now = performance.now();
    if (rms >= speechThreshold) {
      hasSpoken = true;
      silenceSince = now;
    } else if (rms < silenceThreshold) {
      if (!silenceSince) silenceSince = now;
      if (
        hasSpoken &&
        !firedSilence &&
        onSilence &&
        now - silenceSince >= silenceMs
      ) {
        firedSilence = true;
        try { onSilence(); } catch { /* ignore */ }
      }
    }

    if (!firedMax && now - startTs >= maxMs) {
      firedMax = true;
      try { onMaxReached?.(); } catch { /* ignore */ }
    }
  };
  source.connect(node);
  node.connect(ctx.destination);

  const cleanup = () => {
    try { node.disconnect(); } catch {}
    try { source.disconnect(); } catch {}
    stream.getTracks().forEach((t) => t.stop());
  };

  return {
    elapsedMs: () => performance.now() - startTs,
    cancel: () => {
      cleanup();
      ctx.close().catch(() => {});
    },
    stop: async () => {
      cleanup();
      const srcRate = ctx.sampleRate;
      await ctx.close().catch(() => {});
      const merged = mergeChunks(chunks);
      const resampled = downsample(merged, srcRate, 16000);
      return encodeWav(resampled, 16000);
    },
  };
}

function mergeChunks(chunks: Float32Array[]): Float32Array {
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Float32Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function downsample(buffer: Float32Array, srcRate: number, dstRate: number): Float32Array {
  if (dstRate === srcRate) return buffer;
  const ratio = srcRate / dstRate;
  const newLen = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLen);
  let pos = 0;
  let i = 0;
  while (pos < newLen) {
    const next = Math.round((pos + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let j = i; j < next && j < buffer.length; j++) {
      sum += buffer[j];
      count++;
    }
    result[pos] = count > 0 ? sum / count : 0;
    pos++;
    i = next;
  }
  return result;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);
  const writeString = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

// Safe base64 for large Uint8Arrays — avoids `String.fromCharCode(...arr)` stack overflow.
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunk) as unknown as number[],
    );
  }
  return btoa(binary);
}
