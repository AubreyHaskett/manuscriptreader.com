# MothWing — Product & Feature Spec (Design Handoff)

A private, on-device text-to-speech reader for mobile. Bring your own text
(manuscripts, ebooks, papers) or pick a free classic, choose a natural AI
voice, and listen with **synchronized sentence highlighting** so you can read
along. All audio is generated on the device — no servers, no account, nothing
uploaded.

Built on the same engine as [manuscriptreader.com](https://manuscriptreader.com):
the Kokoro 82M open-source TTS model, running fully on-device.

---

## Positioning

**Writers first.** The defensible wedge is privacy for private text: a novelist
will not paste an unpublished manuscript into a cloud-TTS service. On-device
generation isn't just a feature for that user — it's the only acceptable
option. General-reader use (free classics, articles) is a welcome bonus and a
growth engine, but the product's identity and center of gravity is the user's
own private library.

### Three differentiators (lead the design with these)
1. **Privacy** — your text never leaves your phone. This is the brand.
2. **Follow-along highlighting** — not just audio; the spoken sentence is
   highlighted and auto-scrolls. A reading *and* listening experience.
3. **Free classics** — thousands of public-domain books, in-app.

### Why it can win on economics
Generation is on-device, so there is ~zero marginal cost per user (no cloud
inference bill, unlike Speechify et al.). MothWing can undercut subscription
competitors and still profit.

---

## Critical tech constraints the design must absorb

- **Audio is generated on-device and is not instant.** Design needs graceful
  "preparing audio…" states. The model: the *first* listen seeds a cache;
  later listens are instant. Do **not** design as if playback is immediate
  like Spotify.
- **First run downloads a ~86 MB voice model.** Needs a real first-launch
  experience (progress, "this happens once, then works offline").
- **Generation is cached** — compressed (Opus/AAC), per chapter, with a
  sentence→timestamp index so highlighting and tap-to-seek work on cached
  playback. Design needs "cached / not yet generated / generating" indicators
  and storage management.
- **Pre-generation runs ahead** of playback while the app is foregrounded, so
  the user stays ahead of the generator after an initial wait. OS background
  CPU limits constrain how much can happen in the background.

---

## Resolved design decisions

### Reader layout: text-forward, two modes
The synchronized text *is* the differentiator, and writers listening to their
manuscript are proofreading by ear — the text is the work product. So:

- **Default = Reading mode:** text dominant, current sentence highlighted and
  auto-scrolling, with a slim transport bar docked at the bottom.
- **Expandable = Player mode:** full cover / scrubber / voice controls for
  eyes-off, pocket, and lock-screen listening.
- One screen, two modes, defaulting to text.

### Catalog prominence: first-class tab, but Library is home
- **Library is the landing surface** — keeps the app's identity as "your
  private library," which is the privacy wedge.
- **Catalog ("Discover / Classics") is a co-equal, clearly-labeled tab**, one
  tap away — prominent as a *discovery/acquisition* surface (plus deep-linkable
  web pages externally for SEO), secondary as an *identity* surface.
- Not buried in Import; not the home screen.

---

## Feature areas

### 1. First-run / onboarding
- One-time voice-model download with progress + "why" ("downloads once, then
  works fully offline").
- 2–3 screen value pitch: private, follow-along, free classics.
- Optional: pick a default voice during setup, with live previews.

### 2. Getting text in (Import)
Multiple paths, in priority order:
- **Share Sheet (primary)** — share a file or selected text *into* MothWing
  from Books, Files, Safari, Mail, Word, Google Docs. One tap. Design the
  "received → preparing your book" landing state.
- **Paste text** — quick path for a snippet/chapter.
- **File picker** — on-device / iCloud / Drive / Dropbox.
- **Supported formats:** EPUB, DOCX, PDF (text-layer), TXT, Markdown.
- **Load a classic (catalog)** — browse/search Standard Ebooks (curated,
  beautifully formatted) + Project Gutenberg (huge catalog); tap to download →
  becomes a normal book.

States to design: unsupported/DRM-protected file ("this ebook is copy-protected
and can't be opened"), scanned PDF with no text layer ("we couldn't find
readable text"), import success.

### 3. Library ("shelf") — home surface
- Grid/list of imported books + downloaded classics, with cover art, title,
  author.
- **Progress ring + resume** ("Continue — 38%").
- Per-book: pin **"keep offline,"** cache size, delete.
- Sort/search; sections for *In progress / Finished / Classics*.

### 4. Reader / Player — the heart of the app
- **Reading mode (default):** text view with the current sentence highlighted,
  auto-scrolling; tap any sentence to jump there. Slim bottom transport bar.
- **Player mode (expanded):** cover, scrubber, voice, large transport — for
  eyes-off listening.
- Transport: play/pause, skip sentence/paragraph, scrubber, chapter prev/next,
  time remaining.
- **Chapter navigation / table of contents** (from EPUB structure).
- Voice + speed accessible without leaving the reader.
- **"Preparing audio" / buffering** state for not-yet-cached sections; subtle
  "generating ahead" indicator.
- **Background playback** + lock-screen / Now Playing controls (play, skip,
  scrub).
- **Sleep timer** (end of chapter / X minutes).
- Reading comfort: light / dark / sepia themes, adjustable text size.

### 5. Voices
- 14 natural voices (American/British, male/female) with **preview** buttons.
- Default voice (global) + optional per-book voice.

### 6. Pronunciation dictionary
- User-added pronunciations for proper nouns (character/place names) — solves
  the "weird name read wrong" problem and pairs perfectly with long books where
  a name recurs hundreds of times.
- Surfaced as a "fix pronunciation" affordance when a word is mispronounced.

### 7. Settings
- Defaults: voice, speed, pauses (between sentences / paragraphs).
- Appearance: theme, text size.
- **Storage & cache management** — total cache size, per-book breakdown, cap,
  "clear cache," "keep offline" management. (Cached generated audio is the only
  real storage-pressure surface.)
- **Sync (opt-in, clearly disclosed)** — iCloud/Drive to carry settings +
  position + library across devices. Off by default; book/audio content sync is
  a separate explicit choice (privacy).
- Engine/about, privacy explainer, licenses/attribution.

---

## Notable states & edge cases
- Model still downloading (can't generate yet).
- Section not yet generated → "preparing audio."
- Generating ahead in background while playing.
- DRM-protected file rejected.
- Scanned / no-text PDF.
- Offline (catalog unavailable, but local books fully work).
- Out-of-dictionary name → "fix pronunciation" affordance.

---

## Out of scope for v1 (the boundary)
- OCR for scanned PDFs.
- Non-English languages (English-only — keeps it clean technically and legally).
- Full cloud sync of book *content* (settings/position sync only, opt-in).

---

## Suggested build order (informs which screens are MVP)
1. First-run + paste/share text + **EPUB** + Reader/Player + caching
2. **DOCX**
3. **Standard Ebooks catalog**
4. **Text-layer PDF**
5. Later: OCR, Project Gutenberg breadth, cross-device sync

---

## Open technical question to validate before build
**On a mid-range phone, is on-device Kokoro generation faster than real-time
playback?** If yes, pre-generating the next chapter while the current one plays
makes the experience feel seamless after a short initial wait. If no, the user
out-runs the generator and hits buffering — which would force pre-baking whole
books up front. This determines whether the listen-along experience is pleasant
and should be measured on real hardware first.

---

## Licensing notes (engine)
- **Kokoro-82M** model weights: Apache 2.0 — commercial use OK.
- **Phonemizer:** use an espeak-free, pure-JS / dictionary-based G2P (as the
  website already does). **Avoid espeak-ng** (GPLv3) — it would impose copyleft
  on a paid app. English G2P does not require it.
- Keep Apache 2.0 attribution/NOTICE in an in-app licenses screen.
