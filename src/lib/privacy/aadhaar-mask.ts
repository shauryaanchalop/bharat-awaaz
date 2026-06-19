/** Mask all but the last 4 digits of a 12-digit Aadhaar UID, per UIDAI guidelines. */
export function maskAadhaar(uid: string | undefined | null): string {
  if (!uid) return "";
  const digits = uid.replace(/\D/g, "");
  if (digits.length !== 12) return uid;
  return `XXXX XXXX ${digits.slice(8)}`;
}

/** Mask Aadhaar numbers anywhere in a string. */
export function maskAadhaarInText(text: string): string {
  return text.replace(/\b(\d{4})\s?(\d{4})\s?(\d{4})\b/g, "XXXX XXXX $3");
}
