# Manuscript Reader

**[manuscriptreader.com](https://manuscriptreader.com)** — Free, private text-to-speech for writers.

Paste a chapter, pick a voice, press play. Your text is read aloud in a natural AI voice, with sentence highlighting so you can follow along. Everything runs locally in your browser. No servers, no accounts, no tracking.

## How it works

The site uses [Kokoro](https://github.com/hexgrad/kokoro), an open-source text-to-speech model with 82 million parameters. On first visit, the model (~86 MB) downloads and caches in your browser. After that, all speech generation happens on-device — your text is never sent anywhere.

## Features

- 14 natural AI voices (American and British, male and female)
- Sentence-by-sentence highlighting with auto-scroll
- Speed control
- Adjustable pauses between sentences and paragraphs
- Keyboard shortcuts (Space to play/pause, Esc to stop)

## Privacy

This is the core promise: **your manuscript never leaves your browser.**

- No servers or APIs process your text
- No analytics, cookies, or tracking of any kind
- No accounts or logins
- Nothing is saved — close the tab and it's gone
- The voice model is pre-trained and read-only; your text is not used for AI training

## Tech

The entire site is a single HTML file. No build step, no dependencies, no backend.

- [Kokoro TTS](https://github.com/hexgrad/kokoro) via [kokoro-js](https://www.npmjs.com/package/kokoro-js) (Apache 2.0)
- ONNX model runs client-side via WebAssembly
- Hosted on GitHub Pages

## License

MIT
