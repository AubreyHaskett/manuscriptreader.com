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
      isInitialized = true;
      self.postMessage({
        type: 'ready',
        device,
        message: `Model ready (${device.toUpperCase()})`
      });
    } catch (err) {
      // If WebGPU fails, fall back to WASM with q4 quantization
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
