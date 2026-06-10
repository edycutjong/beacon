import { startP2PProvider, stopP2PProvider } from "./qvac.ts";

let pairedProviderKey: string | null = null;

export async function startBeaconHost(topic: string = "beacon-field-compute"): Promise<string> {
  try {
    const response = await startP2PProvider({
      topic,
      firewall: {
        mode: "allow",
        publicKeys: []
      }
    });

    if (response.success && response.publicKey) {
      console.log(`📡 Beacon P2P Host active! Public Key: ${response.publicKey}`);
      return response.publicKey;
    } else {
      throw new Error(response.error || "Unknown error starting P2P provider");
    }
  } catch (error) {
    console.error("Failed to start Beacon P2P Host:", error);
    throw error;
  }
}

export async function stopBeaconHost(): Promise<void> {
  await stopP2PProvider();
}

export function pairWithProvider(publicKey: string): void {
  // Validate public key format (64-character hex representing a 32-byte Ed25519 key)
  const hexRegex = /^[0-9a-fA-F]{64}$/;
  const isValid = hexRegex.test(publicKey);
  if (!isValid) {
    console.warn("Invalid public key provided to pairWithProvider:", publicKey);
    throw new Error("Invalid public key format. Must be a 64-character hex string.");
  }
  pairedProviderKey = publicKey;
  console.log(`✅ Paired successfully with provider: ${publicKey}`);
}

export function getPairedProviderKey(): string | null {
  return pairedProviderKey;
}

export function clearPairing(): void {
  pairedProviderKey = null;
}
