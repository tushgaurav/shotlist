export function downloadText(text: string, fileName: string, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A file name that's safe on every OS, e.g. "Midnight Diner". */
export function safeFileName(name: string, fallback: string) {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "").replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}
