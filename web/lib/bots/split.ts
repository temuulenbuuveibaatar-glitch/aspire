// Long answers are split into several chat messages.

/** Split long text into chunks of at most `max` characters, preferring paragraph, line and word breaks. */
export function splitText(text: string, max = 4096): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"));
    if (cut < max / 2) cut = window.lastIndexOf(" ");
    if (cut < max / 2) cut = max;
    // Never split a surrogate pair.
    if (cut === max && /[\uD800-\uDBFF]/.test(rest[cut - 1])) cut -= 1;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}
