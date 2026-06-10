import { Platform } from 'react-native';
import { extractProviderKey } from './pairingLink';

/**
 * NFC tap-to-pair. A provider node exposes its uplink key on an NFC tag (or via
 * host-card emulation) as an NDEF URI/Text record — e.g. `beacon://pair?key=<hex>`.
 * The consumer taps the tag, we decode the record, and reuse `extractProviderKey`
 * so NFC, QR and deeplink all funnel through one pairing path.
 *
 * The native module is loaded lazily and guarded by platform so the web build
 * (and the Playwright E2E target) never imports it.
 */

let mod: any = null;

function load(): boolean {
  if (Platform.OS === 'web') return false;
  if (mod) return true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('react-native-nfc-manager');
    return true;
  } catch (e) {
    console.log("NFC dynamic require error:", e);
    return false;
  }
}

/** True only on a device whose hardware + OS actually support NFC reading. */
export async function isNfcAvailable(): Promise<boolean> {
  if (!load()) return false;
  try {
    const NfcManager = mod.default;
    await NfcManager.start();
    return await NfcManager.isSupported();
  } catch {
    return false;
  }
}

function decodeRecord(record: any): string | null {
  const Ndef = mod.Ndef;
  const bytes = Array.isArray(record?.payload) ? record.payload : Array.from(record?.payload ?? []);
  if (bytes.length === 0) return null;
  try {
    const uri = Ndef.uri?.decodePayload(Uint8Array.from(bytes));
    if (uri) return uri;
  } catch {
    /* not a URI record */
  }
  try {
    const text = Ndef.text?.decodePayload(Uint8Array.from(bytes));
    if (text) return text;
  } catch {
    /* not a text record */
  }
  return null;
}

/**
 * Open an NFC reader session and wait for a tap. Resolves with the normalised
 * 64-char provider key, or null if the tag carried no valid key. Always closes
 * the technology request, even on error/cancel.
 */
export async function readProviderKeyViaNfc(): Promise<string | null> {
  if (!load()) throw new Error('NFC is not available on this device.');
  const NfcManager = mod.default;
  const NfcTech = mod.NfcTech;
  try {
    await NfcManager.start();
    await NfcManager.requestTechnology(NfcTech.Ndef);
    const tag = await NfcManager.getTag();
    for (const record of tag?.ndefMessage ?? []) {
      const key = extractProviderKey(decodeRecord(record));
      if (key) return key;
    }
    return null;
  } finally {
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch {
      /* session already closed */
    }
  }
}

/** Cancel an in-flight reader session (e.g. user dismissed the prompt). */
export async function cancelNfc(): Promise<void> {
  if (!load()) return;
  try {
    await mod.default.cancelTechnologyRequest();
  } catch {
    /* nothing in flight */
  }
}
