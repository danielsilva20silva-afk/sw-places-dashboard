// Pure CSV helpers — no imports, so this stays unit-testable in node and is the
// correctness-critical core (quoting/escaping/BOM). The lead-to-row mapping and
// the download live in leadsCsv.js.

// UTF-8 byte-order mark. Built from a code point (not a literal char in source)
// so it reads as ordinary ASCII here; prepended so Excel decodes accents
// (a-acute, a-tilde, c-cedilla) correctly instead of as mojibake.
const BOM = String.fromCharCode(0xfeff);

// RFC-4180 field escaping: wrap in double quotes when the value contains a comma,
// a double quote, or a newline; double any embedded quotes. Everything else is
// emitted raw. null/undefined -> empty field.
export function csvEscape(value) {
  const str = value == null ? "" : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Build a CSV string from a header row + data rows (arrays of cells).
// - UTF-8 BOM prefix so Excel reads accents correctly.
// - CRLF line endings (Excel-safe), trailing newline included.
export function buildCsv(headers, rows) {
  const line = (cells) => cells.map(csvEscape).join(",");
  const body = [headers, ...rows].map(line).join("\r\n");
  return `${BOM}${body}\r\n`;
}

// Browser-only: trigger a download of `text` as `filename`. Never called in node.
export function downloadCsv(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
