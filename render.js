import { OfflineAudioContext, AudioContext } from "node-web-audio-api";

// MIDI note name to frequency
const NOTE_REGEX = /^([a-gA-G])([#b]?)(\d+)$/;
const SEMITONES = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

function noteToFreq(note) {
  if (typeof note === "number") {
    // MIDI number
    return 440 * Math.pow(2, (note - 69) / 12);
  }
  const str = String(note);
  const match = str.match(NOTE_REGEX);
  if (!match) return null;

  const [, letter, accidental, octave] = match;
  let semitone = SEMITONES[letter.toLowerCase()];
  if (accidental === "#") semitone++;
  if (accidental === "b") semitone--;
  const midi = semitone + 12 * (parseInt(octave) + 1);
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function getEventValue(event) {
  const val = event.value;
  if (typeof val === "object" && val !== null) return val;
  return { note: val };
}

export async function renderToWav(events, opts) {
  const { bpm, cycles, sampleRate, defaultWave } = opts;

  // Duration of one cycle in seconds (1 cycle = 1 bar = 4 beats at given BPM)
  const cycleDuration = (4 * 60) / bpm;
  const totalDuration = cycles * cycleDuration;

  const ctx = new OfflineAudioContext(2, sampleRate * totalDuration, sampleRate);

  for (const event of events) {
    if (!event.whole) continue;

    const startSec = event.whole.begin.valueOf() * cycleDuration;
    const endSec = event.whole.end.valueOf() * cycleDuration;
    const duration = endSec - startSec;

    if (duration <= 0 || startSec >= totalDuration) continue;

    const vals = getEventValue(event);
    const noteVal = vals.note ?? vals.n ?? vals.freq;
    if (noteVal == null) continue;

    const freq = vals.freq ? vals.freq : noteToFreq(noteVal);
    if (!freq || freq <= 0) continue;

    // Use .s() or .sound() as waveform selector (square, triangle, sawtooth, sine)
    const VALID_WAVES = ["square", "triangle", "sawtooth", "sine"];
    const soundVal = vals.s ?? vals.sound ?? vals.wave ?? vals.waveform;
    const wave = VALID_WAVES.includes(soundVal) ? soundVal : defaultWave;
    const gain = vals.gain ?? vals.velocity ?? 0.3;
    const attack = vals.attack ?? 0.005;
    const decay = vals.decay ?? 0.1;
    const sustain = vals.sustain ?? 0.6;
    const release = vals.release ?? 0.05;

    // Oscillator
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = freq;

    // Gain envelope (ADSR)
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, startSec);
    gainNode.gain.linearRampToValueAtTime(gain, startSec + Math.min(attack, duration * 0.3));

    const decayStart = startSec + attack;
    const sustainLevel = gain * sustain;
    if (decayStart < endSec) {
      gainNode.gain.linearRampToValueAtTime(
        sustainLevel,
        Math.min(decayStart + decay, endSec)
      );
    }

    const releaseStart = endSec - Math.min(release, duration * 0.3);
    gainNode.gain.setValueAtTime(sustainLevel, releaseStart);
    gainNode.gain.linearRampToValueAtTime(0, endSec);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(startSec);
    osc.stop(endSec + 0.01);
  }

  const audioBuffer = await ctx.startRendering();

  return encodeWav(audioBuffer);
}

// Persistent AudioContext for gapless looping
let _sharedCtx = null;

function getSharedContext() {
  if (!_sharedCtx || _sharedCtx.state === "closed") {
    _sharedCtx = new AudioContext();
  }
  return _sharedCtx;
}

export async function closeContext() {
  if (_sharedCtx) {
    await _sharedCtx.close();
    _sharedCtx = null;
  }
}

export async function playRealtime(events, opts) {
  const { bpm, cycles, defaultWave } = opts;
  const cycleDuration = (4 * 60) / bpm;
  const totalDuration = cycles * cycleDuration;

  const ctx = getSharedContext();

  const baseTime = ctx.currentTime + 0.05;

  for (const event of events) {
    if (!event.whole) continue;

    const startSec = baseTime + event.whole.begin.valueOf() * cycleDuration;
    const endSec = baseTime + event.whole.end.valueOf() * cycleDuration;
    const duration = endSec - startSec;

    if (duration <= 0 || startSec >= baseTime + totalDuration) continue;

    const vals = getEventValue(event);
    const noteVal = vals.note ?? vals.n ?? vals.freq;
    if (noteVal == null) continue;

    const freq = vals.freq ? vals.freq : noteToFreq(noteVal);
    if (!freq || freq <= 0) continue;

    const VALID_WAVES = ["square", "triangle", "sawtooth", "sine"];
    const soundVal = vals.s ?? vals.sound ?? vals.wave ?? vals.waveform;
    const wave = VALID_WAVES.includes(soundVal) ? soundVal : defaultWave;
    const gain = vals.gain ?? vals.velocity ?? 0.3;
    const attack = vals.attack ?? 0.005;
    const decay = vals.decay ?? 0.1;
    const sustain = vals.sustain ?? 0.6;
    const release = vals.release ?? 0.05;

    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = freq;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, startSec);
    gainNode.gain.linearRampToValueAtTime(gain, startSec + Math.min(attack, duration * 0.3));

    const decayStart = startSec + attack;
    const sustainLevel = gain * sustain;
    if (decayStart < endSec) {
      gainNode.gain.linearRampToValueAtTime(
        sustainLevel,
        Math.min(decayStart + decay, endSec)
      );
    }

    const releaseStart = endSec - Math.min(release, duration * 0.3);
    gainNode.gain.setValueAtTime(sustainLevel, releaseStart);
    gainNode.gain.linearRampToValueAtTime(0, endSec);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(startSec);
    osc.stop(endSec + 0.01);
  }

  // Wait for playback to finish — timed precisely to the music duration
  const endTime = baseTime + totalDuration;
  const waitMs = (endTime - ctx.currentTime) * 1000;
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

// Schedule events onto a context at a given absolute start time
function scheduleEvents(ctx, events, baseTime, opts) {
  const { bpm, cycles, defaultWave } = opts;
  const cycleDuration = (4 * 60) / bpm;
  const totalDuration = cycles * cycleDuration;

  for (const event of events) {
    if (!event.whole) continue;

    const startSec = baseTime + event.whole.begin.valueOf() * cycleDuration;
    const endSec = baseTime + event.whole.end.valueOf() * cycleDuration;
    const duration = endSec - startSec;

    if (duration <= 0 || startSec >= baseTime + totalDuration) continue;

    const vals = getEventValue(event);
    const noteVal = vals.note ?? vals.n ?? vals.freq;
    if (noteVal == null) continue;

    const freq = vals.freq ? vals.freq : noteToFreq(noteVal);
    if (!freq || freq <= 0) continue;

    const VALID_WAVES = ["square", "triangle", "sawtooth", "sine"];
    const soundVal = vals.s ?? vals.sound ?? vals.wave ?? vals.waveform;
    const wave = VALID_WAVES.includes(soundVal) ? soundVal : defaultWave;
    const gain = vals.gain ?? vals.velocity ?? 0.3;
    const attack = vals.attack ?? 0.005;
    const decay = vals.decay ?? 0.1;
    const sustain = vals.sustain ?? 0.6;
    const release = vals.release ?? 0.05;

    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = freq;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, startSec);
    gainNode.gain.linearRampToValueAtTime(gain, startSec + Math.min(attack, duration * 0.3));

    const decayStart = startSec + attack;
    const sustainLevel = gain * sustain;
    if (decayStart < endSec) {
      gainNode.gain.linearRampToValueAtTime(
        sustainLevel,
        Math.min(decayStart + decay, endSec)
      );
    }

    const releaseStart = endSec - Math.min(release, duration * 0.3);
    gainNode.gain.setValueAtTime(sustainLevel, releaseStart);
    gainNode.gain.linearRampToValueAtTime(0, endSec);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(startSec);
    osc.stop(endSec + 0.01);
  }
}

// Gapless looping with hot-reload support
// Watches /tmp/strudel-cli-pattern.json for pattern changes
export async function playLoop(events, opts) {
  const { bpm, cycles } = opts;
  const cycleDuration = (4 * 60) / bpm;
  const loopDuration = cycles * cycleDuration;

  const ctx = getSharedContext();
  let nextStartTime = ctx.currentTime + 0.05;
  let currentEvents = events;
  let currentOpts = opts;

  // Schedule one iteration at a time, checking for updates between each
  function scheduleNext() {
    scheduleEvents(ctx, currentEvents, nextStartTime, currentOpts);
    nextStartTime += loopDuration;
  }

  // Pre-schedule 2 iterations
  scheduleNext();
  scheduleNext();

  // Watch for pattern updates via file
  const patternFile = "/tmp/strudel-cli-pattern.json";
  let lastMtime = 0;

  async function checkForUpdate() {
    try {
      const { statSync, readFileSync } = await import("fs");
      const stat = statSync(patternFile);
      if (stat.mtimeMs > lastMtime) {
        lastMtime = stat.mtimeMs;
        const data = JSON.parse(readFileSync(patternFile, "utf-8"));
        if (data.pattern) {
          const { evaluatePattern } = await import("./evaluate.js");
          const pattern = await evaluatePattern(data.pattern);
          const newCycles = data.cycles ?? cycles;
          const newBpm = data.bpm ?? bpm;
          const newOpts = { ...opts, bpm: newBpm, cycles: newCycles };
          currentEvents = pattern.queryArc(0, newCycles);
          currentOpts = newOpts;
          console.log(`Hot-reloaded: ${currentEvents.length} events`);
        }
      }
    } catch {
      // File doesn't exist yet or invalid — that's fine
    }
  }

  // Keep scheduling ahead forever
  while (true) {
    const now = ctx.currentTime;
    // Schedule more when needed (keep 1 iteration of buffer)
    const newLoopDuration = (currentOpts.cycles * (4 * 60)) / currentOpts.bpm;
    while (nextStartTime - now < newLoopDuration) {
      await checkForUpdate();
      scheduleEvents(ctx, currentEvents, nextStartTime, currentOpts);
      nextStartTime += newLoopDuration;
    }
    // Sleep half a loop duration
    await new Promise((resolve) => setTimeout(resolve, newLoopDuration * 500));
  }
}

function encodeWav(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // WAV header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample

  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Interleave channels and convert to 16-bit PCM
  const channels = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(audioBuffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample * 0x7fff, true);
      offset += 2;
    }
  }

  return buffer;
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
