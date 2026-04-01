/** Rough GSM-style segment count (7-bit); UI guidance only. */
export function countSmsSegments(text: string): number {
  const len = text.length;
  if (len === 0) return 0;
  if (len <= 160) return 1;
  return Math.ceil(len / 153);
}
