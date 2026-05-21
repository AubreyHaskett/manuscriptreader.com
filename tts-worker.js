// TTS Web Worker - runs Kokoro TTS off the main thread
// This keeps the UI responsive during audio generation

import { KokoroTTS } from "https://esm.sh/kokoro-js@1.2.1";

let tts = null;
let isInitialized = false;
let initPromise = null;

// Check if running on mobile device
function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// GPU detection is handled by the main thread (more reliable on Windows Chrome).
// Main thread sends a 'config' message before init with { useWebGPU: bool }.
let configuredUseWebGPU = null;

// Fallback WebGPU check used only if no config message arrives first
async function checkWebGPU() {
  if (isMobile()) return false;
  if (!navigator.gpu) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

// Check if generated audio is garbled (NaN, Infinity, or abnormal energy).
// Some integrated GPUs (e.g. AMD RDNA 2 iGPU on dual-GPU laptops) produce
// corrupted WebGPU output even though the adapter appears functional.
function isAudioGarbled(audioData) {
  if (!audioData || audioData.length === 0) return true;

  let sumSq = 0;
  let nanCount = 0;
  let clippedCount = 0;

  for (let i = 0; i < audioData.length; i++) {
    const v = audioData[i];
    if (!isFinite(v)) { nanCount++; continue; }
    sumSq += v * v;
    if (Math.abs(v) > 5.0) clippedCount++;  // PCM float shouldn't exceed ~1.0
  }

  // Any NaN/Infinity → garbled
  if (nanCount > 0) return true;
  // More than 1% extreme-amplitude samples → noise
  if (clippedCount / audioData.length > 0.01) return true;
  // RMS energy: completely silent (<1e-8) or absurdly loud (>2.0) → suspect
  const rms = Math.sqrt(sumSq / audioData.length);
  if (rms < 1e-8 || rms > 2.0) return true;

  return false;
}

// Initialize the TTS model
async function initModel() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const useWebGPU = configuredUseWebGPU !== null
      ? configuredUseWebGPU
      : await checkWebGPU();
    const device = useWebGPU ? "webgpu" : "wasm";

    self.postMessage({
      type: 'status',
      message: `Loading model with ${device.toUpperCase()}...`,
      device
    });

    // Use fp32 for WebGPU (q4 causes audio artifacts), q8 for WASM (faster than q4, better quality)
    const dtype = device === "webgpu" ? "fp32" : "q8";

    try {
      tts = await KokoroTTS.from_pretrained(
        "onnx-community/Kokoro-82M-v1.0-ONNX",
        { dtype, device }
      );

      // ── Validate WebGPU output ─────────────────────────
      // Some integrated GPUs produce garbled audio even though the adapter
      // looks fine. Run a quick test phrase and check the output. If it's
      // corrupt, tear down and re-init with WASM.
      if (device === "webgpu") {
        self.postMessage({
          type: 'status',
          message: 'Validating audio quality...',
          device
        });

        try {
          const test = await tts.generate("Testing one two three.", {
            voice: "bf_emma", speed: 1
          });

          if (isAudioGarbled(test.audio)) {
            self.postMessage({
              type: 'status',
              message: 'GPU audio garbled — switching to CPU...',
              device: 'wasm'
            });
            // Release WebGPU model and re-init with WASM
            tts = null;
            tts = await KokoroTTS.from_pretrained(
              "onnx-community/Kokoro-82M-v1.0-ONNX",
              { dtype: "q8", device: "wasm" }
            );
            isInitialized = true;
            self.postMessage({
              type: 'ready',
              device: 'wasm',
              message: 'Model ready (CPU — your GPU produced garbled audio)'
            });
            return;
          }
        } catch (testErr) {
          // Test generation itself failed — fall back to WASM
          self.postMessage({
            type: 'status',
            message: 'GPU validation failed — switching to CPU...',
            device: 'wasm'
          });
          tts = null;
          tts = await KokoroTTS.from_pretrained(
            "onnx-community/Kokoro-82M-v1.0-ONNX",
            { dtype: "q8", device: "wasm" }
          );
          isInitialized = true;
          self.postMessage({
            type: 'ready',
            device: 'wasm',
            message: 'Model ready (CPU — GPU validation error)'
          });
          return;
        }
      }

      isInitialized = true;
      self.postMessage({
        type: 'ready',
        device,
        message: `Model ready (${device.toUpperCase()})`
      });
    } catch (err) {
      // If WebGPU fails, fall back to WASM with q8 quantization
      if (device === "webgpu") {
        self.postMessage({
          type: 'status',
          message: 'WebGPU failed, falling back to WASM...',
          device: 'wasm'
        });
        tts = await KokoroTTS.from_pretrained(
          "onnx-community/Kokoro-82M-v1.0-ONNX",
          { dtype: "q8", device: "wasm" }  // q8 is faster than q4 for WASM
        );
        isInitialized = true;
        self.postMessage({
          type: 'ready',
          device: 'wasm',
          message: 'Model ready (WASM fallback)'
        });
      } else {
        throw err;
      }
    }
  })();

  return initPromise;
}

// Generate audio for text
async function generateAudio(id, text, voice, speed) {
  if (!isInitialized) {
    await initModel();
  }

  try {
    const result = await tts.generate(text, { voice, speed });

    // Transfer the audio data back to main thread
    const audioData = result.audio;
    const sampleRate = result.sampling_rate || 24000;

    self.postMessage({
      type: 'audio',
      id,
      audioData,
      sampleRate
    }, [audioData.buffer]); // Transfer ownership for performance

  } catch (err) {
    self.postMessage({
      type: 'error',
      id,
      error: err.message
    });
  }
}

// Handle messages from main thread
self.onmessage = async (e) => {
  const { type, id, text, voice, speed } = e.data;

  switch (type) {
    case 'config':
      // Sent by main thread before init — contains GPU detection result
      configuredUseWebGPU = e.data.useWebGPU;
      break;

    case 'init':
      try {
        await initModel();
      } catch (err) {
        self.postMessage({
          type: 'error',
          error: err.message
        });
      }
      break;

    case 'generate':
      await generateAudio(id, text, voice, speed);
      break;

    case 'ping':
      self.postMessage({ type: 'pong' });
      break;
  }
};

// Delay auto-init slightly so the main thread's 'config' message can arrive first.
// The config message sets configuredUseWebGPU before initModel() reads it.
setTimeout(() => {
  initModel().catch(err => {
    self.postMessage({
      type: 'error',
      error: err.message
    });
  });
}, 50);
