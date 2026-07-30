import { Resend } from "resend";

export function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export function getFromAddress(): string {
  return process.env.EMAIL_FROM_ADDRESS || "quinn@dermaqea.com";
}
