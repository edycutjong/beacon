import { startP2PProvider, stopP2PProvider, runHeartbeat } from "./qvac.ts";

let pairedProviderKey: string | null = null;

export async function startBeaconHost(topic: string = "beacon-field-compute"): Promise<string> {
  try {
    const response = await Promise.race([
      startP2PProvider({
        topic,
        firewall: {
          mode: "allow",
          publicKeys: []
        }
      }),
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("P2P Host start timed out after 10s")), 10000))
    ]);

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

export async function pairWithProvider(publicKey: string): Promise<void> {
  // Validate public key format (64-character hex representing a 32-byte Ed25519 key)
  // Special bypass for GOD MODE demo
  if (publicKey === "GOD_MODE_ACTIVE") {
    pairedProviderKey = publicKey;
    console.log(`✅ GOD MODE: Bypassing heartbeat and pairing directly`);
    return;
  }

  const hex64Regex = /^[0-9a-fA-F]{64}$/;
  const isValid = hex64Regex.test(publicKey);

  if (!isValid) {
    console.warn(`Invalid public key provided to pairWithProvider: ${publicKey}`);
    throw new Error("Invalid public key format. Must be a 64-character hex string.");
  }

  const isOnline = await Promise.race([
    runHeartbeat(publicKey),
    new Promise<boolean>(resolve => setTimeout(() => resolve(false), 5000))
  ]);
  if (!isOnline) {
    throw new Error("Provider is unreachable. Check the uplink key and ensure the host is online.");
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
