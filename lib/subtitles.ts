export function toWebVtt(input: string): string {
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (/^WEBVTT(?:\s|$)/.test(text)) return `${text}\n`;
  let count = 0;
  const converted = text.replace(/(\d{2,}:\d{2}:\d{2}),(\d{3})(\s+-->\s+)(\d{2,}:\d{2}:\d{2}),(\d{3})/g, (_, a, b, arrow, c, d) => { count++; return `${a}.${b}${arrow}${c}.${d}`; });
  if (!count) throw new Error('No SRT cues found. Supply a UTF-8 SRT or WebVTT file.');
  return `WEBVTT\n\n${converted}\n`;
}
