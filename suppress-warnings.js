// Suppress strudel's "not in browser" warnings — must be imported before strudel
const origWarn = console.warn;
console.warn = (...args) => {
  if (args[0]?.toString().includes("window")) return;
  origWarn(...args);
};
