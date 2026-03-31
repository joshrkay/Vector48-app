function str(val: unknown): string | undefined {
  return typeof val === "string" && val.length > 0 ? val : undefined;
}

function formatPhone(raw: string | undefined): string {
  if (!raw) return "unknown number";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    const rest = digits.slice(1);
    return `+1 (${rest.slice(0, 3)}) ${rest.slice(3, 6)}-${rest.slice(6)}`;
  }
  if (digits.length === 10) {
    return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

function contactLabel(detail: Record<string, unknown>): string {
  const name = str(detail.contact_name);
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
    }
    return name;
  }
  const phone = str(detail.contact_phone);
  return phone ? formatPhone(phone) : "contact";
}

/**
 * Human-readable line for the activity feed from type + detail; falls back to summary.
 */
export function formatActivityDescription(
  eventType: string,
  detail: Record<string, unknown>,
  summary: string,
): string {
  const phone = formatPhone(str(detail.contact_phone));
  const label = contactLabel(detail);

  switch (eventType) {
    case "call_completed":
      return `AI answered a call from ${phone}`;
    case "sms_missed_call":
    case "sms_missed_call_followup":
      return `Sent text-back to missed caller ${phone}`;
    case "message_received":
      return `Message received from ${label}`;
    case "review_request":
    case "google_review_sent":
      return `Review request sent to ${label}`;
    case "estimate_followup":
      return `Estimate follow-up sent to ${label}`;
    case "appointment_reminder":
      return str(detail.reminder_copy) ?? "Appointment reminder sent";
    case "appointment_created":
      return `Appointment booked for ${label}`;
    case "appointment_updated":
      return `Appointment updated for ${label}`;
    case "contact_created":
      return `New contact: ${label}`;
    case "contact_updated":
      return `Contact updated: ${label}`;
    case "opportunity_created":
      return `New opportunity for ${label}`;
    case "opportunity_moved":
      return `Pipeline update for ${label}`;
    case "sequence_paused":
      return `Follow-up sequence paused for ${label}`;
    case "rebook_triggered":
      return `Re-booking outreach for ${label}`;
    case "alert":
      return summary;
    default:
      return summary;
  }
}
