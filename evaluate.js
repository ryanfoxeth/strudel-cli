import "./suppress-warnings.js";
import { evaluate } from "@strudel/transpiler";
import * as core from "@strudel/core";
import * as tonal from "@strudel/tonal";
import * as miniPkg from "@strudel/mini";

let initialized = false;

async function init() {
  if (initialized) return;
  core.setStringParser(miniPkg.mini);
  await core.evalScope(core, tonal, miniPkg);
  initialized = true;
}

export async function evaluatePattern(code) {
  await init();
  const { pattern } = await evaluate(code);
  return pattern;
}
