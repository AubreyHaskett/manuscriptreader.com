import { KokoroTTS } from "https://esm.sh/kokoro-js@1.2.1";

let tts = null;

let isInitialized = false;

let initPromise = null;

function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

let configuredUseWebGPU = null;

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

function isAudioGarbled(audioData) {
  if (!audioData || audioData.length === 0) return true;
  let sumSq = 0;
  let nanCount = 0;
  let clippedCount = 0;
  for (let i = 0; i < audioData.length; i++) {
    const v = audioData[i];
    if (!isFinite(v)) {
      nanCount++;
      continue;
    }
    sumSq += v * v;
    if (Math.abs(v) > 5) clippedCount++;
  }
  if (nanCount > 0) return true;
  if (clippedCount / audioData.length > .01) return true;
  const rms = Math.sqrt(sumSq / audioData.length);
  if (rms < 1e-8 || rms > 2) return true;
  return false;
}

async function initModel() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const useWebGPU = configuredUseWebGPU !== null ? configuredUseWebGPU : await checkWebGPU();
    const device = useWebGPU ? "webgpu" : "wasm";
    self.postMessage({
      type: "status",
      message: `Loading model with ${device.toUpperCase()}...`,
      device: device
    });
    const dtype = device === "webgpu" ? "fp32" : "q8";
    try {
      tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
        dtype: dtype,
        device: device
      });
      if (device === "webgpu") {
        self.postMessage({
          type: "status",
          message: "Validating audio quality...",
          device: device
        });
        try {
          const test = await tts.generate("Testing one two three.", {
            voice: "bf_emma",
            speed: 1
          });
          if (isAudioGarbled(test.audio)) {
            self.postMessage({
              type: "status",
              message: "GPU audio garbled — switching to CPU...",
              device: "wasm"
            });
            tts = null;
            tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
              dtype: "q8",
              device: "wasm"
            });
            isInitialized = true;
            self.postMessage({
              type: "ready",
              device: "wasm",
              message: "Model ready (CPU — your GPU produced garbled audio)"
            });
            return;
          }
        } catch (testErr) {
          self.postMessage({
            type: "status",
            message: "GPU validation failed — switching to CPU...",
            device: "wasm"
          });
          tts = null;
          tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
            dtype: "q8",
            device: "wasm"
          });
          isInitialized = true;
          self.postMessage({
            type: "ready",
            device: "wasm",
            message: "Model ready (CPU — GPU validation error)"
          });
          return;
        }
      }
      isInitialized = true;
      self.postMessage({
        type: "ready",
        device: device,
        message: `Model ready (${device.toUpperCase()})`
      });
    } catch (err) {
      if (device === "webgpu") {
        self.postMessage({
          type: "status",
          message: "WebGPU failed, falling back to WASM...",
          device: "wasm"
        });
        tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
          dtype: "q8",
          device: "wasm"
        });
        isInitialized = true;
        self.postMessage({
          type: "ready",
          device: "wasm",
          message: "Model ready (WASM fallback)"
        });
      } else {
        throw err;
      }
    }
  })();
  return initPromise;
}

async function generateAudio(id, text, voice, speed) {
  if (!isInitialized) {
    await initModel();
  }
  try {
    const result = await tts.generate(text, {
      voice: voice,
      speed: speed
    });
    const audioData = result.audio;
    const sampleRate = result.sampling_rate || 24e3;
    self.postMessage({
      type: "audio",
      id: id,
      audioData: audioData,
      sampleRate: sampleRate
    }, [ audioData.buffer ]);
  } catch (err) {
    self.postMessage({
      type: "error",
      id: id,
      error: err.message
    });
  }
}

self.onmessage = async e => {
  const {type: type, id: id, text: text, voice: voice, speed: speed} = e.data;
  switch (type) {
   case "config":
    configuredUseWebGPU = e.data.useWebGPU;
    break;

   case "init":
    try {
      await initModel();
    } catch (err) {
      self.postMessage({
        type: "error",
        error: err.message
      });
    }
    break;

   case "generate":
    await generateAudio(id, text, voice, speed);
    break;

   case "ping":
    self.postMessage({
      type: "pong"
    });
    break;
  }
};

setTimeout(() => {
  initModel().catch(err => {
    self.postMessage({
      type: "error",
      error: err.message
    });
  });
}, 50);
