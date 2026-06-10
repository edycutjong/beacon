import { loadLLMModel, runCompletion, unloadQVACModel, LLAMA_MODEL_ID, MEDPSY_MODEL_ID } from "./qvac";
import { getPairedProviderKey } from "./p2p";
import { getAuditLog } from "./audit";
import { classifyDomain, type Domain } from "./domain";
import { retrieveCitations, type Citation } from "./rag";

export interface RouteResult {
  text: string;
  source: "local" | "delegated";
  latencyMs: number;
  peerId?: string;
  /** Output tokens for this answer (from the audit log). */
  tokenCount?: number;
  /** Throughput for this answer in tokens/sec (from the audit log). */
  tokensPerSec?: number;
  /** Routing domain — "medical" queries run on the specialized MedPsy model. */
  domain: Domain;
  /** Human-readable name of the model that produced the answer. */
  model: string;
  /** Field-manual passages the answer was grounded in (offline RAG). */
  citations: Citation[];
}

/** Friendly model names for the HUD, keyed by domain. */
const MODEL_NAME: Record<Domain, string> = {
  medical: "MedPsy-1.7B",
  general: "Llama-3.2-1B",
};

/** Pull the metrics recorded by runCompletion for the call that just finished. */
function lastCompletionMetrics(): { tokenCount?: number; tokensPerSec?: number } {
  const log = getAuditLog();
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].type === "completion") {
      return { tokenCount: log[i].tokenCount, tokensPerSec: log[i].tokensPerSec };
    }
  }
  return {};
}

export function shouldDelegate(query: string, isImage: boolean, hasPeer: boolean): boolean {
  // Heavy criteria: contains images, long context (> 200 chars), and a peer is active
  const isHeavy = isImage || query.length > 200;
  return isHeavy && hasPeer;
}

/** Append retrieved field-manual excerpts to a system prompt so the model cites them. */
function ground(basePrompt: string, citations: Citation[]): string {
  if (citations.length === 0) return basePrompt;
  const excerpts = citations
    .map((c) => `- [p.${c.page}] ${c.title}: ${c.snippet}`)
    .join("\n");
  return `${basePrompt}\n\nGround your answer in these field-manual excerpts and cite the page numbers:\n${excerpts}`;
}

export async function runRoute(query: string, isImage: boolean = false): Promise<RouteResult> {
  const tStart = Date.now();
  const providerKey = getPairedProviderKey();
  const hasPeer = providerKey !== null;

  // Specialized-model routing: medical/triage → MedPsy, everything else → Llama.
  const domain = classifyDomain(query);
  const modelSrc = domain === "medical" ? MEDPSY_MODEL_ID : LLAMA_MODEL_ID;
  const model = MODEL_NAME[domain];

  // Offline RAG: ground the answer in the bundled field manual (runs locally,
  // independent of where inference executes).
  const citations = await retrieveCitations(query);

  const useDelegation = shouldDelegate(query, isImage, hasPeer);

  if (useDelegation && providerKey) {
    try {
      console.log(`📤 Routing query to delegated peer: ${providerKey}`);
      // Load model using the delegate key
      const modelId = await loadLLMModel(modelSrc as any, {
        providerPublicKey: providerKey,
        timeout: 10000,
        fallbackToLocal: true
      });

      const response = await runCompletion({
        modelId,
        history: [
          { role: "system", content: ground("You are a highly capable delegated AI compute provider. Answer the query thoroughly.", citations) },
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
        peerId: providerKey,
        domain,
        model,
        citations,
        ...lastCompletionMetrics()
      };
    } catch (error) {
      console.warn("⚠️ Delegated compute failed, falling back to local on-device inference:", error);
      // Fall through to local execution on error
    }
  }

  // Local on-device execution fallback
  console.log("💻 Running local on-device inference");
  const modelId = await loadLLMModel(modelSrc as any);

  const response = await runCompletion({
    modelId,
    history: [
      { role: "system", content: ground("You are a lightweight on-device AI. Provide a concise response.", citations) },
      { role: "user", content: query }
    ],
    stream: false
  });

  await unloadQVACModel(modelId);
  const latencyMs = Date.now() - tStart;

  return {
    text: response.text,
    source: "local",
    latencyMs,
    domain,
    model,
    citations,
    ...lastCompletionMetrics()
  };
}
