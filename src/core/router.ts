import { loadLLMModel, runCompletion, unloadQVACModel, LLAMA_MODEL_ID } from "./qvac.js";
import { getPairedProviderKey } from "./p2p.js";

export interface RouteResult {
  text: string;
  source: "local" | "delegated";
  latencyMs: number;
  peerId?: string;
}

export function shouldDelegate(query: string, isImage: boolean, hasPeer: boolean): boolean {
  // Heavy criteria: contains images, long context (> 200 chars), and a peer is active
  const isHeavy = isImage || query.length > 200;
  return isHeavy && hasPeer;
}

export async function runRoute(query: string, isImage: boolean = false): Promise<RouteResult> {
  const tStart = Date.now();
  const providerKey = getPairedProviderKey();
  const hasPeer = providerKey !== null;

  const useDelegation = shouldDelegate(query, isImage, hasPeer);

  if (useDelegation && providerKey) {
    try {
      console.log(`📤 Routing query to delegated peer: ${providerKey}`);
      // Load model using the delegate key
      const modelId = await loadLLMModel(LLAMA_MODEL_ID as any, {
        providerPublicKey: providerKey,
        timeout: 10000,
        fallbackToLocal: true
      });

      const response = await runCompletion({
        modelId,
        history: [
          { role: "system", content: "You are a highly capable delegated AI compute provider. Answer the query thoroughly." },
          { role: "user", content: query }
        ],
        stream: false
      });

      await unloadQVACModel(modelId);
      const latencyMs = Date.now() - tStart;

      return {
        text: response.text,
        source: "delegated",
        latencyMs,
        peerId: providerKey
      };
    } catch (error) {
      console.warn("⚠️ Delegated compute failed, falling back to local on-device inference:", error);
      // Fall through to local execution on error
    }
  }

  // Local on-device execution fallback
  console.log("💻 Running local on-device inference");
  const modelId = await loadLLMModel(LLAMA_MODEL_ID as any);
  
  const response = await runCompletion({
    modelId,
    history: [
      { role: "system", content: "You are a lightweight on-device AI. Provide a concise response." },
      { role: "user", content: query }
    ],
    stream: false
  });

  await unloadQVACModel(modelId);
  const latencyMs = Date.now() - tStart;

  return {
    text: response.text,
    source: "local",
    latencyMs
  };
}
