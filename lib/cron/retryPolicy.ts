const MIN_MAX_ATTEMPTS = 1;

export function resolveRecipeTriggerMaxAttempts(
  configuredMaxAttempts: number | null | undefined,
  defaultMaxAttempts: number,
): number {
  if (
    typeof configuredMaxAttempts === "number" &&
    Number.isInteger(configuredMaxAttempts) &&
    configuredMaxAttempts >= MIN_MAX_ATTEMPTS
  ) {
    return configuredMaxAttempts;
  }

  if (Number.isInteger(defaultMaxAttempts) && defaultMaxAttempts >= MIN_MAX_ATTEMPTS) {
    return defaultMaxAttempts;
  }

  return MIN_MAX_ATTEMPTS;
}
