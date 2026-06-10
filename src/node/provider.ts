import { startBeaconHost } from "../core/p2p.ts";
import { buildPairingLink } from "../core/pairingLink.ts";
import qrcode from "qrcode-terminal";

async function main() {
  const topic = process.env.BEACON_TOPIC || "beacon-field-compute";
  console.log(`🚀 Booting Beacon P2P compute daemon on topic: ${topic}...`);

  try {
    const publicKey = await startBeaconHost(topic);
    console.log("=========================================");
    console.log(`🟢 P2P Provider successfully started.`);

    const uri = buildPairingLink(publicKey);
    qrcode.generate(uri, { small: true });

    console.log(`Public Key (Hex): ${publicKey}`);
    console.log("Scan this QR code to pair your device:");
    console.log("Press Ctrl+C to stop the daemon.");
    console.log("=========================================");
  } catch (error) {
    console.error("🔴 Failed to start Beacon P2P Provider:", error);
    process.exit(1);
  }
}

main();
