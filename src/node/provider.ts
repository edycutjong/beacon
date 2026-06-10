import { startBeaconHost } from "../core/p2p.ts";

async function main() {
  const topic = process.env.BEACON_TOPIC || "beacon-field-compute";
  console.log(`🚀 Booting Beacon P2P compute daemon on topic: ${topic}...`);
  
  try {
    const publicKey = await startBeaconHost(topic);
    console.log("=========================================");
    console.log(`🟢 P2P Provider successfully started.`);
    console.log(`Public Key (Hex): ${publicKey}`);
    console.log("Give this key to your client device to pair.");
    console.log("Press Ctrl+C to stop the daemon.");
    console.log("=========================================");
  } catch (error) {
    console.error("🔴 Failed to start Beacon P2P Provider:", error);
    process.exit(1);
  }
}

main();
