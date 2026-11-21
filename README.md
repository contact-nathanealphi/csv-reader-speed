# csv-reader-speed

[![csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/contact-nathanealphi/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/contact-nathanealphi/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A very fast CSV reader, built for
[csv-reader-speed-01-run-20261121](https://make.fun/bounty/csv-reader-speed-01-run-20261121):
a drop-in for make.fun's own csv-reader 1.0.0 that answers exactly as it does
on every input — same columns, rows, and broken-row errors — only much faster.

## How it works

The reference reader walks the text one character at a time and builds every
field one character at a time. This reader never does that on the common path:

- A record that is one plain line (no quote, no stray carriage return) is split
  by the engine's native `split`.
- Any other record is read field by field, each field found with the engine's
  native `indexOf` jumps and taken as one slice, so a field costs a few native
  searches instead of a scan of every character.
- Only the genuinely broken pieces — a doubled quote, a line break inside
  quotes, a stray carriage return — fall back to a careful rebuild, and even
  there the rebuild jumps from one special character to the next.

There are no regular expressions and no per-character string building anywhere.

## Layout

- `solve.js` — the reader: `run(input)` returns `{columns, rows, errors}` for
  one case's input `{text, header}`, exactly as csv-reader 1.0.0 does.
- `main.ts` — the program the harness runs: reads every case from
  `/input/cases.json`, answers each with `run`, writes `/output/answers.json`.

## License

MIT.
