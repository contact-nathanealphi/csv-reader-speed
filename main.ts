// csv-reader-speed: the program the harness runs (`node /bot/main.ts`, node22).
// It reads every case from /input/cases.json (a JSON array of {id, input}),
// answers each one alone with run() from solve.js, and writes
// /output/answers.json: a JSON array of the answers, one per case and in the
// cases' order. Outside a container MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR
// stand in for /input and /output.
//
// Serialization note: instead of building the whole answers array and calling
// JSON.stringify(answers) once (which holds every answer object plus one
// ~12 MB string alive at once, and pays a large GC bill), each case's answer
// is stringified and written to the file as soon as it is produced, so only
// one case is ever alive. The bytes written are identical to
// JSON.stringify(answers) (verified byte-for-byte on the practice set).

import { readFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// V8's incremental marking off, set before solve.js is imported so all of its
// work runs under it (the rules: the house baseline runs with
// --no-incremental-marking, and an entry may tune V8's flags too).
setFlagsFromString('--no-incremental-marking');

/** solve.js, imported by its URL (a .js module carries no types) and typed by its contract. */
const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as { run: (input: unknown) => unknown };

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8')) as { id: string; input: unknown }[];
const fd = openSync(join(OUTPUT_DIR, 'answers.json'), 'w');
try {
  writeSync(fd, '[');
  for (let i = 0; i < cases.length; i++) {
    if (i > 0) writeSync(fd, ',');
    writeSync(fd, JSON.stringify(run(cases[i].input)));
  }
  writeSync(fd, ']');
} finally {
  closeSync(fd);
}
