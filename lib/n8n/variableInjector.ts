const PLACEHOLDER_RE = /\{\{([^}]+)\}\}/g;

export class UnreplacedTemplateVariableError extends Error {
  constructor(public readonly names: string[]) {
    super(`Unreplaced template variables: ${names.join(", ")}`);
    this.name = "UnreplacedTemplateVariableError";
  }
}

/**
 * Replaces {{VARIABLE_NAME}} in a serialized JSON string (not template literals).
 * Throws if any placeholders remain after replacement.
 */
export function injectVariables(
  templateJsonString: string,
  variables: Record<string, string>,
): unknown {
  let result = templateJsonString;
  for (const [key, value] of Object.entries(variables)) {
    const token = `{{${key}}}`;
    result = result.split(token).join(value);
  }

  const remaining: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(PLACEHOLDER_RE.source, "g");
  while ((m = re.exec(result)) !== null) {
    const name = m[1]?.trim();
    if (name && !remaining.includes(name)) {
      remaining.push(name);
    }
  }
  if (remaining.length > 0) {
    throw new UnreplacedTemplateVariableError(remaining);
  }

  return JSON.parse(result) as unknown;
}
