/** RFC 4180 CSV with a BOM so Excel reads it as UTF-8. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function csvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Spreadsheet apps run cells starting with these as formulas.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
