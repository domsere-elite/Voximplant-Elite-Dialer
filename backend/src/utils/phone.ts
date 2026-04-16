/**
 * Normalize a phone number to E.164 format (US numbers).
 * Handles 10-digit, 11-digit (1+10), and various formatting.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // Strip everything except digits
  const digits = raw.replace(/\D/g, '');

  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  // Already in international format
  if (digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}

/**
 * Extract area code from an E.164 US number.
 */
export function extractAreaCode(phone: string): string | null {
  const match = phone.match(/^\+1(\d{3})/);
  return match ? match[1] : null;
}
