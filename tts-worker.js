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

// Check WebGPU support (disabled on mobile to avoid screen glitches)
async function checkWebGPU() {
  // Skip WebGPU on mobile - causes screen glitches during GPU initialization
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
    const hasWebGPU = await checkWebGPU();
    const device = hasWebGPU ? "webgpu" : "wasm";

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

// Generate audio for text using streaming API
async function generateAudio(id, text, voice, speed) {
  if (!isInitialized) {
    await initModel();
  }

  try {
    // Use streaming API — processes text in sub-chunks, reducing peak memory
    // and improving speed on constrained devices
    const chunks = [];
    let sampleRate = 24000;

    for await (const chunk of tts.stream(text, { voice, speed })) {
      chunks.push(chunk.audio);
      sampleRate = chunk.sampling_rate || sampleRate;
    }

    // Concatenate all audio chunks into a single buffer
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const audioData = new Float32Array(totalLength);
    let offset = 0;
    for (const c of chunks) {
      audioData.set(c, offset);
      offset += c.length;
    }

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

// Start initializing immediately
initModel().catch(err => {
  self.postMessage({
    type: 'error',
    error: err.message
  });
});
