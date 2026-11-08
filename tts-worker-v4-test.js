import { KokoroTTS } from "https://esm.sh/kokoro-js@1.2.1?deps=@huggingface/transformers@4.0.0";

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
