#!/usr/bin/env node

import { program } from "commander";
import { evaluatePattern } from "./evaluate.js";
import { renderToWav, playRealtime } from "./render.js";
import { writeFileSync } from "fs";
import { resolve } from "path";

program
  .name("strudel-cli")
  .description("Render Strudel patterns to chiptune WAV files")
  .argument("<pattern>", 'Strudel pattern string, e.g. note("c4 e4 g4")')
  .option("-o, --output <file>", "Output WAV file path")
  .option("-p, --play", "Play in real time (no file output unless -o is also set)")
  .option("-b, --bpm <number>", "Beats per minute", "120")
  .option("-c, --cycles <number>", "Number of cycles to render", "4")
  .option(
    "-w, --wave <type>",
    "Default waveform: square, triangle, sawtooth, sine",
    "square"
  )
  .option("-s, --sample-rate <number>", "Sample rate", "44100")
  .action(async (patternStr, opts) => {
    try {
      const bpm = parseInt(opts.bpm);
      const cycles = parseInt(opts.cycles);
      const sampleRate = parseInt(opts.sampleRate);

      console.log(`Pattern: ${patternStr}`);
      console.log(`BPM: ${bpm} | Cycles: ${cycles} | Wave: ${opts.wave}`);

      const pattern = await evaluatePattern(patternStr);
      const events = pattern.queryArc(0, cycles);

      console.log(`Events: ${events.length}`);

      if (opts.play) {
        console.log("Playing...");
        await playRealtime(events, { bpm, cycles, sampleRate, defaultWave: opts.wave });
        console.log("Done.");
      }

      if (opts.output) {
        const outputPath = resolve(opts.output);
        const wavBuffer = await renderToWav(events, {
          bpm,
          cycles,
          sampleRate,
          defaultWave: opts.wave,
        });
        writeFileSync(outputPath, Buffer.from(wavBuffer));
        console.log(`Wrote ${outputPath} (${wavBuffer.byteLength} bytes)`);
      }

      if (!opts.play && !opts.output) {
        // Default: render to output.wav
        const outputPath = resolve("output.wav");
        const wavBuffer = await renderToWav(events, {
          bpm,
          cycles,
          sampleRate,
          defaultWave: opts.wave,
        });
        writeFileSync(outputPath, Buffer.from(wavBuffer));
        console.log(`Wrote ${outputPath} (${wavBuffer.byteLength} bytes)`);
      }
    } catch (err) {
      console.error("Error:", err.message);
      process.exit(1);
    }
  });

program.parse();
