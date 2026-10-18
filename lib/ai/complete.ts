/** The last word typed on the line, which the model is asked to start its reply with. */
export function lastWord(line: string) {
  return line.match(/(\S+)\s*$/)?.[1] ?? "";
}

/**
 * The text to show after `line`, from a reply that starts with the line's last word. The echo
 * shows where the new text joins: after a space, or partway through a word.
 */
export function joinCompletion(reply: string, line: string): string {
  const text = reply.replace(/\r?\n[\s\S]*$/, "").trimStart();
  const word = lastWord(line);
  const typedSpace = /\s$/.test(line);
  if (!text || !word) return text;

  if (text.toLowerCase().startsWith(word.toLowerCase())) {
    const rest = text.slice(word.length);
    return typedSpace ? rest.trimStart() : rest;
  }
  // No echo: a new word is likelier than the end of a half-typed one.
  return typedSpace || !/^[\p{L}\p{N}]/u.test(text) ? text : ` ${text}`;
}
