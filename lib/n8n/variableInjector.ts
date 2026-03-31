// ---------------------------------------------------------------------------
// Replace {{VAR}} placeholders in serialized workflow JSON (not template literals).
// ---------------------------------------------------------------------------

const PLACEHOLDER_RE = /\{\{([A-Z0-9_]+)\}\}/g;

export class UnreplacedPlaceholdersError extends Error {
  constructor(public readonly leftovers: string[]) {
    super(
      `Unreplaced template placeholders: ${leftovers.join(", ")}`,
    );
    this.name = "UnreplacedPlaceholdersError";
  }
}

/**
 * Replace {{VARIABLE_NAME}} in the template string, then JSON.parse.
 * Keys in `variables` should be the placeholder names (e.g. TENANT_ID for {{TENANT_ID}}).
 */
export function injectVariables(
  templateJsonString: string,
  variables: Record<string, string>,
): unknown {
  const sortedKeys = Object.keys(variables).sort((a, b) => b.length - a.length);

  let out = templateJsonString;
  for (const key of sortedKeys) {
    const value = variables[key];
    const token = `{{${key}}}`;
    if (out.includes(token)) {
      out = out.split(token).join(value);
    }
  }

  const leftovers: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(PLACEHOLDER_RE.source, "g");
  while ((m = re.exec(out)) !== null) {
    if (m[1] && !leftovers.includes(m[1])) {
      leftovers.push(m[1]);
    }
  }
  if (leftovers.length > 0) {
    throw new UnreplacedPlaceholdersError(leftovers);
  }

  return JSON.parse(out) as unknown;
}
