/**
 * Pairing payloads can arrive three ways:
 *   1. A raw 64-char Ed25519 hex public key
 *   2. A Beacon deeplink:  beacon://pair?key=<hex>
 *   3. A full URL form:    https://beacon.app/pair?key=<hex>
 * `extractProviderKey` normalises any of these to the bare hex key, or null.
 */
const HEX64 = /[0-9a-fA-F]{64}/;

export function extractProviderKey(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const raw = payload.trim();

  // Try to read a `key`/`uplink` query param first (deeplink or URL form).
  const paramMatch = raw.match(/[?&](?:key|uplink|provider)=([^&\s]+)/i);
  const candidate = paramMatch ? decodeURIComponent(paramMatch[1]) : raw;

  const hex = candidate.match(HEX64);
  if (hex && hex[0].length === candidate.replace(/[^0-9a-fA-F]/g, '').length) {
    return hex[0].toLowerCase();
  }
  // Fall back to any embedded 64-hex run (e.g. raw scan of a longer string).
  const embedded = raw.match(HEX64);
  return embedded ? embedded[0].toLowerCase() : null;
}

/** Build the deeplink a provider would encode into its QR code. */
export function buildPairingLink(publicKey: string): string {
  return `beacon://pair?key=${publicKey}`;
}
