// csv-reader-speed v2: a fast drop-in for make.fun's csv-reader 1.0.0.
//
// It answers exactly what csv-reader 1.0.0 answers for every input {text, header}:
// the JSON value {columns, rows, errors}. The reading rules it follows, in short:
// a U+FEFF at the very start is dropped; a record ends at LF or CRLF, and a line
// left with no characters is no record; outside quotes a CR not followed by LF is
// dropped (error stray_cr); a field that opens with a quote runs to the next quote
// that is not doubled, "" inside it is one quote and each CRLF or lone CR inside
// it is read as LF; what follows its closing quote, up to the next comma or line
// break, is appended as it stands (quote_junk, when the field ends); a quote that
// never closes is a literal character, and the text after it is read again as
// unquoted (unterminated_quote); a quote inside an unquoted field is a literal
// character; fields stay strings, never trimmed or converted; columns is the first
// record when header is true, else null; rows holds the records after it, each
// padded with empty strings (short_row, with fields: its field count) or cut
// (long_row, with extra: the cut fields) to the first record's width; each error
// is {code, line, row}, in the order met, line the 1-based line its record starts
// on, row its record's index in rows, null for the header.
//
// How it is fast: the reference reads one character at a time and builds every
// field one character at a time. This reader reads field by field with the
// engine's native indexOf jumps and single slices: an unquoted field is taken
// by one tight scan that slices it whole, and a quoted field is found by
// jumping from quote to quote with indexOf and likewise taken as one slice
// when it holds no doubled quote and no line break. Only the genuinely broken
// pieces (a doubled quote, a line break inside quotes, a stray CR) fall back
// to a careful rebuild, and even there the rebuild walks short slices, never
// the whole text character by character. There is no per-line fast-path check:
// most lines hold quotes, so testing for a plain line costs more than it saves.
// There are no regular expressions anywhere.

/** How a field ended: at a comma (the record goes on), at a line break or at the end of the text (the record ends). */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    const fields = [];
    let fi = 0;
    let lastQuoted = false;
    // Read the record field by field. `pending` carries a field whose first
    // part is already known and whose rest still has to be read as unquoted:
    // the text after an opening quote that never closes (the quote itself is
    // the first character), or the junk after a closing quote (the quoted part
    // is the first part).
    let pending = null;
    let junkCheck = false;
    for (;;) {
      let value;
      let ended;
      let readUnquoted = false;
      let jc = false;
      if (pending !== null) {
        value = pending;
        pending = null;
        jc = junkCheck;
        junkCheck = false;
        readUnquoted = true;
      } else if (text.charCodeAt(pos) === 34) {
        lastQuoted = true;
        const open = pos;
        pos = open + 1;
        // Find the closing quote: the next quote that is not doubled.
        let close = -1;
        let hasDouble = false;
        let scan = pos;
        for (;;) {
          const qi = text.indexOf('"', scan);
          if (qi === -1) break;
          if (qi + 1 < n && text.charCodeAt(qi + 1) === 34) {
            hasDouble = true;
            scan = qi + 2;
            continue;
          }
          close = qi;
          break;
        }
        if (close === -1) {
          // The quote never closes: it is a literal character, and the text
          // after it is read again as unquoted.
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          value = '"';
          pos = open + 1;
          readUnquoted = true;
        } else {
          // The quoted part: one slice when it holds no doubled quote and no
          // line break, else a rebuild that turns "" into " and each CRLF or
          // lone CR into LF, counting the lines it spans.
          const content = text.slice(open + 1, close);
          if (!hasDouble && content.indexOf('\n') === -1 && content.indexOf('\r') === -1) {
            value = content;
          } else {
            let v = '';
            let s = 0;
            let seg = 0;
            let addLines = 0;
            const m = content.length;
            while (s < m) {
              const c = content.charCodeAt(s);
              if (c === 34) {
                // A doubled quote: one quote, both characters skipped.
                if (s > seg) v += content.slice(seg, s);
                v += '"';
                s += 2;
                seg = s;
                continue;
              }
              if (c === 10) {
                if (s > seg) v += content.slice(seg, s);
                v += '\n';
                addLines += 1;
                s += 1;
                seg = s;
                continue;
              }
              if (c === 13) {
                if (s > seg) v += content.slice(seg, s);
                v += '\n';
                addLines += 1;
                s = s + 1 < m && content.charCodeAt(s + 1) === 10 ? s + 2 : s + 1;
                seg = s;
                continue;
              }
              s += 1;
            }
            if (m > seg) v += content.slice(seg, m);
            line += addLines;
            value = v;
          }
          if (close + 1 >= n) {
            pos = n;
            fields[fi++] = value;
            break;
          }
          const c = text.charCodeAt(close + 1);
          if (c === 44) {
            pos = close + 2;
            fields[fi++] = value;
            continue;
          }
          if (c === 10) {
            pos = close + 2;
            line += 1;
            fields[fi++] = value;
            break;
          }
          if (c === 13 && close + 2 < n && text.charCodeAt(close + 2) === 10) {
            pos = close + 3;
            line += 1;
            fields[fi++] = value;
            break;
          }
          // What follows the closing quote is appended as it stands, up to
          // the next comma or line break.
          jc = true;
          pos = close + 1;
          readUnquoted = true;
        }
      } else {
        lastQuoted = false;
        value = '';
        readUnquoted = true;
      }
      if (readUnquoted) {
        // Reads unquoted characters onto `value` up to the next comma or
        // line break: a CR not followed by LF is dropped (stray_cr), a CR
        // followed by LF ends the field as the line break. `added` counts
        // the characters kept. One tight scan takes the field as a single
        // slice, cut only where a stray CR has to be dropped.
        let added = 0;
        let s = pos;
        let seg = pos;
        for (;;) {
          if (s >= n) {
            if (n > seg) {
              const piece = text.slice(seg, n);
              if (value === '') value = piece; else value += piece;
              added += n - seg;
            }
            pos = n;
            ended = END;
            break;
          }
          const c = text.charCodeAt(s);
          if (c === 44) {
            if (s > seg) {
              const piece = text.slice(seg, s);
              if (value === '') value = piece; else value += piece;
              added += s - seg;
            }
            pos = s + 1;
            ended = COMMA;
            break;
          }
          if (c === 10) {
            if (s > seg) {
              const piece = text.slice(seg, s);
              if (value === '') value = piece; else value += piece;
              added += s - seg;
            }
            pos = s + 1;
            line += 1;
            ended = LINE_BREAK;
            break;
          }
          if (c === 13) {
            if (s + 1 < n && text.charCodeAt(s + 1) === 10) {
              if (s > seg) {
                const piece = text.slice(seg, s);
                if (value === '') value = piece; else value += piece;
                added += s - seg;
              }
              pos = s + 2;
              line += 1;
              ended = LINE_BREAK;
              break;
            }
            if (s > seg) {
              const piece = text.slice(seg, s);
              if (value === '') value = piece; else value += piece;
              added += s - seg;
            }
            errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            s += 1;
            seg = s;
            continue;
          }
          s += 1;
        }
        if (jc && added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      }
      fields[fi++] = value;
      if (ended !== COMMA) break;
    }

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows[rows.length] = fields;
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
