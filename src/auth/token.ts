import { randomBytes } from "node:crypto";

/**
 * Generate an opaque, URL-safe token used as the subscriber's
 * confirmation + management + unsubscribe handle. 32 bytes (256 bits)
 * is plenty of entropy for a non-guessable handle.
 */
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}
