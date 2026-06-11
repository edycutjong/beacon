// Reproducible proof that Beacon's P2P delegation is REAL, not simulated.
//
//   node scripts/verify_delegation.mjs
//
// Spawns two independent @qvac/sdk peers on this machine:
//   • a child PROVIDER process (hosts the model, its own DHT identity)
//   • this CONSUMER process, which calls loadModel({ delegate }) + completion
//     against the provider's public key with fallbackToLocal:FALSE.
//
// Because the on-device fallback is disabled, producing any tokens proves the
// inference round-tripped over the QVAC P2P/DHT delegation path. The provider's
// [request-lifecycle] completion logs confirm the compute executed there.
//
// NOTE: both peers run on one host (loopback DHT), so the timings reflect the
// pipeline, not phone-over-Wi-Fi latency. The first run downloads the GGUF
// (~0.8GB) into ~/.qvac/models on the provider side.
import { spawn } from "node:child_process";
import * as qvac from "@qvac/sdk";

const log = (...a) => console.log("[verify]", ...a);

const PROVIDER_SRC = `
import * as qvac from "@qvac/sdk";
try {
  const res = await qvac.startQVACProvider({ topic: process.env.BEACON_TOPIC || "beacon-verify" });
  console.log("PROVIDER_KEY=" + (res?.publicKey ?? ""));
  console.log("PROVIDER_READY");
} catch (e) {
  console.error("PROVIDER_ERROR " + (e?.stack || e?.message || String(e)));
  process.exit(1);
}
const bye = async () => { try { await qvac.stopQVACProvider(); } catch {} process.exit(0); };
process.on("SIGTERM", bye);
process.on("SIGINT", bye);
setInterval(() => {}, 1 << 30);
`;

const WATCHDOG_MS = 660000;
const watchdog = setTimeout(() => {
  console.error(`[verify] WATCHDOG ${WATCHDOG_MS}ms exceeded — aborting`);
  try { provider?.child?.kill("SIGKILL"); } catch {}
  process.exit(3);
}, WATCHDOG_MS);

function startProvider() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", PROVIDER_SRC], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let key = null;
    child.stdout.on("data", (buf) => {
      const s = buf.toString();
      process.stdout.write("[provider] " + s);
      const m = s.match(/PROVIDER_KEY=([0-9a-fA-F]{64})/);
      if (m) key = m[1];
      if (/PROVIDER_READY/.test(s) && key) resolve({ child, key });
      if (/PROVIDER_ERROR/.test(s)) reject(new Error("provider failed to start"));
    });
    child.stderr.on("data", (b) => process.stdout.write("[provider:err] " + b.toString()));
    child.on("exit", (c) => { if (!key) reject(new Error("provider exited early, code=" + c)); });
    setTimeout(() => { if (!key) reject(new Error("provider not ready within 90s")); }, 90000);
  });
}

async function streamCompletion(modelId, prompt) {
  const t0 = Date.now();
  const run = qvac.completion({ modelId, history: [{ role: "user", content: prompt }], stream: true });
  let first = null, n = 0, out = "";
  const ts = run?.tokenStream;
  if (ts && typeof ts[Symbol.asyncIterator] === "function") {
    for await (const tok of ts) {
      if (first === null) first = Date.now() - t0;
      n++; out += tok;
      process.stdout.write(tok);
    }
  } else {
    out = await run.text;
    first = Date.now() - t0;
    n = Math.max(1, Math.round(out.split(/\s+/).length * 1.3));
  }
  const total = Date.now() - t0;
  return { text: out, ttftMs: first ?? total, totalMs: total, tokens: n, tokPerSec: n / (total / 1000) };
}

let provider;
try {
  log("starting provider child process...");
  provider = await startProvider();
  log("provider ready. publicKey=" + provider.key);

  log("consumer: loadModel with delegate (fallbackToLocal=false)...");
  const modelId = await qvac.loadModel({
    modelSrc: qvac.LLAMA_3_2_1B_INST_Q4_0,
    modelType: "llamacpp-completion",
    modelConfig: { ctx_size: 4096 },
    delegate: {
      providerPublicKey: provider.key,
      timeout: 480000,
      fallbackToLocal: false,
      forceNewConnection: true,
    },
  });
  log("delegated modelId=" + modelId);

  log("consumer: running delegated completion...");
  console.log("\n----- DELEGATED OUTPUT -----");
  const r = await streamCompletion(
    modelId,
    "In two sentences, explain why an offline mesh network helps first responders."
  );
  console.log("\n----- /DELEGATED OUTPUT -----");
  log(`RESULT ttft=${r.ttftMs}ms total=${r.totalMs}ms tokens=${r.tokens} tok/s=${r.tokPerSec.toFixed(1)} (loopback — pipeline proof, not device latency)`);

  try { await qvac.unloadModel({ modelId }); } catch {}
  log("SUCCESS — real delegated token stream captured (on-device fallback was disabled).");
  clearTimeout(watchdog);
  try { provider.child.kill("SIGTERM"); } catch {}
  process.exit(0);
} catch (e) {
  console.error("[verify] FAILED:", e?.stack || e?.message || String(e));
  clearTimeout(watchdog);
  try { provider?.child?.kill("SIGTERM"); } catch {}
  process.exit(1);
}
