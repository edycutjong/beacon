import { loadLLMModel, loadVisionModel, runCompletion, unloadQVACModel, LLAMA_MODEL_ID, VISION_MODEL_NAME, type CompletionMessage } from "./qvac.ts";
import { getPairedProviderKey } from "./p2p.ts";
import { getAuditLog } from "./audit.ts";
import { classifyDomain, type Domain } from "./domain.ts";
import { retrieveCitations, type Citation } from "./rag.ts";

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

/**
 * Friendly model names for the HUD, keyed by domain.
 * NOTE: MedPsy-1.7B (Tether's clinical model) is not yet published in the QVAC
 * SDK model registry, so medical queries run on Llama-3.2-1B with a dedicated
 * MedPsy-aligned clinical prompt. The label reflects that honestly — swap to the
 * real MedPsy descriptor the moment it lands in the registry.
 */
const MODEL_NAME: Record<Domain, string> = {
  medical: "Llama-3.2-1B · MedPsy-aligned",
  general: "Llama-3.2-1B",
};

/** Domain- and location-aware system prompt. Medical queries get clinical guardrails. */
function systemPromptFor(hasImage: boolean, delegated: boolean, domain: Domain): string {
  if (hasImage) {
    return delegated
      ? "You are a delegated multimodal field-vision model. Describe what is visible and give the operator clear, actionable guidance."
      : "You are an on-device multimodal field-vision model. Concisely describe the image and give actionable guidance.";
  }
  if (domain === "medical") {
    const compute = delegated ? "a delegated high-capacity" : "a lightweight on-device";
    return `You are ${compute} clinical field-triage assistant (MedPsy-aligned). Give calm, numbered first-aid steps, call out red-flag symptoms that require evacuation, and never invent drug dosages. End with: "Not a substitute for professional medical care."`;
  }
  return delegated
    ? "You are a highly capable delegated AI compute provider. Answer the query thoroughly."
    : "You are a lightweight on-device AI. Provide a concise response.";
}

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

export async function runRoute(query: string, isImage: boolean = false, imagePath?: string): Promise<RouteResult> {
  const tStart = Date.now();
  const providerKey = getPairedProviderKey();
  const hasPeer = providerKey !== null;
  // An image makes a query "heavy" whether it arrives as the boolean flag (tests)
  // or as a captured file path (real multimodal capture).
  const hasImage = isImage || imagePath != null;

  // Domain routing: medical queries get a MedPsy-aligned clinical prompt, all
  // text runs on Llama-3.2-1B (the real MedPsy GGUF isn't in the QVAC registry
  // yet — see MODEL_NAME). Image queries run on the vision model instead.
  const domain = classifyDomain(query);
  const model = hasImage ? VISION_MODEL_NAME : MODEL_NAME[domain];

  // Offline RAG: ground the answer in the bundled field manual (runs locally,
  // independent of where inference executes).
  const citations = await retrieveCitations(query);

  const useDelegation = shouldDelegate(query, hasImage, hasPeer);

  // Build the user turn, attaching the captured image for multimodal completion.
  const userTurn: CompletionMessage = imagePath
    ? { role: "user", content: query || "Describe this scene and give a field operator clear, actionable guidance.", attachments: [{ path: imagePath }] }
    : { role: "user", content: query };

  const loadModelFor = (delegate?: { providerPublicKey: string; timeout: number; fallbackToLocal: boolean }) =>
    hasImage
      ? loadVisionModel(delegate)
      : loadLLMModel(LLAMA_MODEL_ID, delegate);

  if (useDelegation && providerKey) {
    try {
      console.log(`📤 Routing ${hasImage ? "vision " : ""}query to delegated peer: ${providerKey}`);
      // Cold-DHT bootstrap can take 15-45s on first run per SDK docs
      const modelId = await loadModelFor({
        providerPublicKey: providerKey,
        timeout: 60000,
        fallbackToLocal: true
      });

      const systemPrompt = systemPromptFor(hasImage, true, domain);

      let response;
      try {
        response = await runCompletion({
          modelId,
          history: [
            { role: "system", content: ground(systemPrompt, citations) },
            userTurn
          ],
          stream: false
        });
      } finally {
        await unloadQVACModel(modelId);
      }

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
  console.log(`💻 Running local on-device ${hasImage ? "vision " : ""}inference`);
  const modelId = await loadModelFor();

  const systemPrompt = systemPromptFor(hasImage, false, domain);

  let response;
  try {
    response = await runCompletion({
      modelId,
      history: [
        { role: "system", content: ground(systemPrompt, citations) },
        userTurn
      ],
      stream: false
    });
  } finally {
    await unloadQVACModel(modelId);
  }

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
