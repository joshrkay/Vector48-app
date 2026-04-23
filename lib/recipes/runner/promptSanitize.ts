// ---------------------------------------------------------------------------
// Prompt-input sanitization
//
// Two untrusted surfaces feed into Claude prompts on every recipe run:
//
//   1. Tenant-controlled config (business_name, message templates, links,
//      thresholds) stored in recipe_activations.config.
//   2. CRM contact data (firstName, name) pulled from GHL.
//
// Both can carry hostile text. This module provides a single sanitizer
// that every handler's buildPrompt callsite runs user input through
// before interpolating it into a string that becomes a Claude message.
//
// Defences:
//   - Length cap (prevents context exhaustion and cost blow-up)
//   - Strip common role-override tokens (</system>, </user>, </assistant>,
//     <|endoftext|>, [SYSTEM], etc.)
//   - Drop control characters (0x00-0x1f except tab/newline/cr)
//   - Collapse whitespace so newline-heavy injections don't survive
//
// See qa/audits/A4-recipes.md BUG-9.
// ---------------------------------------------------------------------------

const DEFAULT_MAX_LEN = 500;

// Sequences an attacker might use to escape the user turn or spoof a
// system message. Case-insensitive match; anything overlapping these
// fragments is removed before the value is interpolated.
const ROLE_MARKERS: RegExp[] = [
  /<\/?\s*(?:system|user|assistant)\s*>/gi,
  /<\|\s*(?:system|user|assistant|endoftext|im_start|im_end)\s*\|>/gi,
  /\[\s*(?:system|assistant|inst|\/inst)\s*\]/gi,
  /^(?:system|assistant)\s*:\s*/gim,
  /\banthropic[- _]?human\b/gi,
];

// All ASCII control characters except tab (\t = 0x09), newline (\n = 0x0a),
// and carriage return (\r = 0x0d). Built from char codes to keep this
// file free of literal control bytes.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp(
  "[" +
    [...Array(0x20).keys()]
      .filter((c) => c !== 0x09 && c !== 0x0a && c !== 0x0d)
      .map((c) => "\\x" + c.toString(16).padStart(2, "0"))
      .join("") +
    "\\x7f]",
  "g",
);

export interface SanitizeOptions {
  /** Max length after sanitization. Default 500 chars. */
  maxLen?: number;
  /**
   * When the input exceeds maxLen, append an ellipsis so prompts don't
   * silently truncate mid-phrase. Default true.
   */
  ellipsis?: boolean;
}

/**
 * Remove role-override markers, control chars, and excess length from
 * an untrusted string before it is interpolated into a Claude prompt.
 *
 * Non-string inputs (numbers, booleans, null, undefined) return their
 * string form unchanged — this matches the natural coercion handlers
 * were doing before and keeps numeric thresholds (e.g. inactive_days)
 * readable in the prompt.
 */
export function sanitizeForPrompt(
  value: unknown,
  options: SanitizeOptions = {},
): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value !== "string") {
    try {
      return sanitizeForPrompt(JSON.stringify(value), options);
    } catch {
      return "";
    }
  }

  const maxLen = options.maxLen ?? DEFAULT_MAX_LEN;
  const ellipsis = options.ellipsis ?? true;

  let out = value;

  // Strip role-override tokens.
  for (const re of ROLE_MARKERS) {
    out = out.replace(re, " ");
  }

  // Drop control characters, collapse whitespace so multi-line
  // injections can't visually simulate a new turn boundary.
  out = out.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();

  if (out.length > maxLen) {
    out = ellipsis
      ? out.slice(0, Math.max(0, maxLen - 1)).trimEnd() + "…"
      : out.slice(0, maxLen);
  }

  return out;
}

/**
 * Shallow sanitize every string value on an object. Use to scrub a
 * config or contact snapshot before passing it into a buildPrompt
 * callback. Non-string fields pass through unchanged.
 */
export function sanitizeStrings<T extends Record<string, unknown>>(
  input: T,
  options?: SanitizeOptions,
): T {
  const out: Record<string, unknown> = { ...input };
  for (const key of Object.keys(out)) {
    const v = out[key];
    if (typeof v === "string") {
      out[key] = sanitizeForPrompt(v, options);
    }
  }
  return out as T;
}
