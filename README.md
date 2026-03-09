# strudel-cli

A Node.js CLI for rendering [Strudel](https://strudel.cc/) patterns to chiptune audio. Play live or export to WAV.

Uses the real Strudel pattern engine (`@strudel/core`, `@strudel/mini`, `@strudel/transpiler`, `@strudel/tonal`) with a custom audio renderer built on [`node-web-audio-api`](https://github.com/nicholasgasior/node-web-audio-api) (Rust-backed).

## Install

```bash
git clone https://github.com/ryanfoxeth/strudel-cli.git
cd strudel-cli
npm install
npm link
```

## Usage

```bash
# Play live
strudel-cli 'note("c4 e4 g4 c5")' --play

# Render to WAV
strudel-cli 'note("c4 e4 g4 c5")' -o output.wav

# Both
strudel-cli 'note("c4 e4 g4 c5")' --play -o output.wav
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `-p, --play` | Play in real time | off |
| `-o, --output <file>` | Output WAV file path | `output.wav` |
| `-b, --bpm <n>` | Beats per minute | `120` |
| `-c, --cycles <n>` | Number of cycles to render | `4` |
| `-w, --wave <type>` | Default waveform: `square`, `triangle`, `sawtooth`, `sine` | `square` |
| `-s, --sample-rate <n>` | Sample rate | `44100` |

### Per-voice waveforms

Use `.s()` to set waveform per voice:

```bash
strudel-cli 'stack(
  note("c2 g2 ab2 bb2").s("sawtooth").gain(0.2),
  note("c4 eb4 g4 c5").gain(0.25),
  note("g5 eb5 g5 c5").fast(2).s("triangle").gain(0.1)
)' --play -b 140
```

### Strudel pattern language

Full Strudel pattern language is supported: `note()`, `stack()`, `cat()`, `fast()`, `slow()`, mini notation, euclidean rhythms, and more. See [Strudel docs](https://strudel.cc/workshop/getting-started/).

## Architecture

```
Strudel (upstream)        strudel-cli (this repo)
┌─────────────────┐      ┌──────────────────────┐
│ Pattern engine   │ ──→  │ Oscillator synth      │
│ Mini notation    │      │ ADSR envelopes        │
│ Transpiler       │      │ WAV encoder           │
│ Music theory     │      │ Real-time playback    │
└─────────────────┘      └──────────────────────┘
```

The synth is intentionally simple — square, triangle, sawtooth, and sine oscillators with ADSR envelopes. Perfect for chiptune and video game music.

## Requirements

- Node.js 18+

## License

MIT
