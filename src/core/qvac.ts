import {
  loadModel,
  unloadModel,
  completion,
  ragIngest,
  ragSearch,
  textToSpeech,
  transcribe,
  startQVACProvider,
  stopQVACProvider,
  heartbeat,
  LLAMA_3_2_1B_INST_Q4_0,
  GTE_LARGE_FP16,
  TTS_EN_SUPERTONIC_Q8_0,
  WHISPER_EN_TINY_Q8_0,
  SMOLVLM2_500M_MULTIMODAL_Q8_0,
  MMPROJ_SMOLVLM2_500M_MULTIMODAL_Q8_0,
} from "@qvac/sdk";
import { recordModelLoad, recordModelUnload, recordCompletion, estimateTokens } from "./audit.ts";

// Define custom constants or fallbacks
export const MEDPSY_MODEL_ID = "MedPsy-1.7B"; // Default name for MedPsy-1.7B
export const MULTIMODAL_MODEL_ID = "QVAC-Vision-1B"; // Legacy label, kept for back-compat
export const LLAMA_MODEL_ID = LLAMA_3_2_1B_INST_Q4_0;
export const EMBEDDING_MODEL_ID = GTE_LARGE_FP16;
// Real multimodal (vision) descriptor + its projection companion. Loading a
// vision model is heavy — exactly the workload Beacon delegates to a peer.
export const VISION_MODEL_ID = SMOLVLM2_500M_MULTIMODAL_Q8_0;
export const VISION_PROJECTION_ID = MMPROJ_SMOLVLM2_500M_MULTIMODAL_Q8_0;
export const VISION_MODEL_NAME = "SmolVLM2-500M";
// On-device speech-to-text (Whisper) for hands-free voice queries in the field.
export const STT_MODEL_ID = WHISPER_EN_TINY_Q8_0;
export const STT_MODEL_NAME = "Whisper-tiny.en";

export interface CompletionMessage {
  role: "user" | "assistant" | "system";
  content: string;
  /** File-path image attachments for multimodal completion, e.g. [{ path: uri }]. */
  attachments?: { path: string }[];
}

export interface CompletionParams {
  modelId: string;
  history: CompletionMessage[];
  stream?: boolean;
  /** @deprecated Pass images as per-message `attachments: [{ path }]` instead. */
  images?: Uint8Array[];
}

export interface EmbedParams {
  modelId: string;
  documents: string[];
  chunk?: boolean;
}

export interface RagSearchParams {
  modelId: string;
  query: string;
  topK?: number;
}

export interface TranscribeParams {
  /** File path/URI to the recorded audio, or a raw audio Buffer. */
  audioChunk: string | Uint8Array;
}

export interface TTSParams {
  text: string;
  eSpeakDataPath?: string;
}

export interface P2PProviderParams {
  topic: string;
  firewall?: {
    mode: "allow" | "deny";
    publicKeys: string[];
  };
}

export interface P2PDelegateParams {
  providerPublicKey: string;
  timeout?: number;
  fallbackToLocal?: boolean;
}

// ── Model Loaders ──────────────────────────────────────────────────────────

export async function loadLLMModel(modelSrc: any = LLAMA_MODEL_ID, delegateParams?: P2PDelegateParams) {
  try {
    // SDK expects modelSrc as the full descriptor constant (e.g. LLAMA_3_2_1B_INST_Q4_0),
    // not the .src string. See: docs.qvac.tether.io/p2p-capabilities/delegated-inference
    const params: any = {
      modelSrc,
      modelType: "llamacpp-completion",
      modelConfig: {
        ctx_size: 4096,
      },
    };

    if (delegateParams) {
      // delegate is a top-level loadModel option per SDK docs
      params.delegate = {
        providerPublicKey: delegateParams.providerPublicKey,
        timeout: delegateParams.timeout ?? 60000,
        fallbackToLocal: delegateParams.fallbackToLocal ?? true,
        forceNewConnection: true,
      };
    }

    const tLoad = Date.now();
    const modelId = await loadModel(params);
    recordModelLoad(modelId, "llamacpp-completion", Date.now() - tLoad);
    return modelId;
  } catch (error) {
    console.error("Failed to load LLM model:", error);
    throw error;
  }
}

export async function loadVisionModel(delegateParams?: P2PDelegateParams) {
  try {
    // Multimodal models load as "llm" with a projection companion (mmproj).
    // See: node_modules/@qvac/sdk/dist/examples/llamacpp-multimodal.js
    const params: any = {
      modelSrc: VISION_MODEL_ID,
      modelType: "llm",
      modelConfig: {
        ctx_size: 4096,
        projectionModelSrc: VISION_PROJECTION_ID,
      },
    };

    if (delegateParams) {
      params.delegate = {
        providerPublicKey: delegateParams.providerPublicKey,
        timeout: delegateParams.timeout ?? 60000,
        fallbackToLocal: delegateParams.fallbackToLocal ?? true,
        forceNewConnection: true,
      };
    }

    const tLoad = Date.now();
    const modelId = await loadModel(params);
    recordModelLoad(modelId, "llm", Date.now() - tLoad);
    return modelId;
  } catch (error) {
    console.error("Failed to load vision model:", error);
    throw error;
  }
}

export async function loadEmbeddingModel(modelSrc: any = EMBEDDING_MODEL_ID) {
  try {
    const tLoad = Date.now();
    const modelId = await loadModel({
      modelSrc,
      modelType: "embeddings",
    } as any);
    recordModelLoad(modelId, "embeddings", Date.now() - tLoad);
    return modelId;
  } catch (error) {
    console.error("Failed to load Embedding model:", error);
    throw error;
  }
}

export async function loadTTSModel(_eSpeakDataPath: string = "./espeak-data") {
  try {
    const tLoad = Date.now();
    const modelId = await loadModel({
      modelSrc: TTS_EN_SUPERTONIC_Q8_0,
      modelType: "tts",
      modelConfig: {
        language: "en",
      },
    } as any);
    recordModelLoad(modelId, "tts", Date.now() - tLoad);
    return modelId;
  } catch (error) {
    console.error("Failed to load TTS model:", error);
    throw error;
  }
}

export async function loadSTTModel(modelSrc: any = STT_MODEL_ID) {
  try {
    const tLoad = Date.now();
    const modelId = await loadModel({
      modelSrc,
      modelType: "whisper",
      modelConfig: {
        audio_format: "f32le",
        language: "en",
        translate: false,
      },
    } as any);
    recordModelLoad(modelId, "whisper", Date.now() - tLoad);
    return modelId;
  } catch (error) {
    console.error("Failed to load STT model:", error);
    throw error;
  }
}

/** Transcribe recorded audio to text on-device (Whisper). Frees the model after. */
export async function runTranscription(params: TranscribeParams): Promise<string> {
  const modelId = await loadSTTModel();
  try {
    const text = await transcribe({ modelId, audioChunk: params.audioChunk as any });
    return typeof text === "string" ? text.trim() : String(text ?? "").trim();
  } finally {
    await unloadQVACModel(modelId);
  }
}

export async function unloadQVACModel(modelId: string) {
  try {
    await unloadModel({ modelId });
    recordModelUnload(modelId);
  } catch (error) {
    console.error(`Failed to unload model ${modelId}:`, error);
  }
}

// ── Completion Wrapper ──────────────────────────────────────────────────────

export async function runCompletion(params: CompletionParams): Promise<{ text: string; tokenStream?: AsyncGenerator<string> }> {
  try {
    const completionParams: any = {
      modelId: params.modelId,
      history: params.history.map(m => ({
        role: m.role,
        content: m.content,
        // Per-message file-path attachments drive multimodal (vision) completion.
        ...(m.attachments && m.attachments.length > 0 ? { attachments: m.attachments } : {}),
      })),
      stream: params.stream ?? true,
    };

    if (params.stream) {
      const result: any = completion({ ...completionParams, stream: true });
      const stream = result.tokenStream;

      // Instrument only real async token streams so the audit log captures a
      // true TTFT. Anything else (e.g. a test stub) is passed through untouched.
      if (stream && typeof stream[Symbol.asyncIterator] === "function") {
        const tStart = Date.now();
        const instrumented = (async function* () {
          let firstTokenMs: number | null = null;
          let tokenCount = 0;
          try {
            for await (const tok of stream) {
              if (firstTokenMs === null) firstTokenMs = Date.now() - tStart;
              tokenCount++;
              yield tok;
            }
          } finally {
            const totalMs = Date.now() - tStart;
            recordCompletion({
              modelId: params.modelId,
              ttftMs: firstTokenMs ?? totalMs,
              totalMs,
              tokenCount,
              streamed: true,
            });
          }
        })();
        return { text: "", tokenStream: instrumented };
      }

      return { text: "", tokenStream: stream };
    } else {
      const tStart = Date.now();
      // completion() always returns a CompletionRun synchronously;
      // .text is a Promise<string> that resolves when the response ends.
      const result = completion({ ...completionParams, stream: true });
      const text = await result.text;
      const totalMs = Date.now() - tStart;
      // Non-streamed: TTFT is unknown, so it's reported as the full-response
      // latency with streamed=false to keep the metric honest.
      recordCompletion({
        modelId: params.modelId,
        totalMs,
        tokenCount: estimateTokens(text),
        streamed: false,
      });
      return { text };
    }
  } catch (error) {
    console.error("Inference completion failed:", error);
    throw error;
  }
}

// ── RAG Wrapper ─────────────────────────────────────────────────────────────

export async function runSaveEmbeddings(params: EmbedParams) {
  try {
    const response = await ragIngest({
      modelId: params.modelId,
      documents: params.documents,
      chunk: params.chunk ?? false,
    } as any);
    return response;
  } catch (error) {
    console.error("RAG embedding save failed:", error);
    throw error;
  }
}

export async function runRagSearch(params: RagSearchParams) {
  try {
    const results = await ragSearch({
      modelId: params.modelId,
      query: params.query,
      topK: params.topK ?? 5,
    });
    return results; // Returns array of { content: string, score?: number }
  } catch (error) {
    console.error("RAG search failed:", error);
    throw error;
  }
}

// ── Speech Synthesis Wrapper ────────────────────────────────────────────────

export async function runTextToSpeech(params: TTSParams) {
  try {
    const ttsModelId = await loadTTSModel(params.eSpeakDataPath);
    const result = textToSpeech({
      modelId: ttsModelId,
      text: params.text,
      inputType: "text",
      stream: false,
    });
    const buffer = await result.buffer;
    await unloadQVACModel(ttsModelId);
    return buffer;
  } catch (error) {
    console.error("TTS generation failed:", error);
    throw error;
  }
}

// ── P2P Compute Mesh Providers ──────────────────────────────────────────────

export async function startP2PProvider(params: P2PProviderParams) {
  try {
    const firewall = params.firewall ? {
      mode: params.firewall.mode,
      publicKeys: params.firewall.publicKeys,
    } : undefined;

    const response = await startQVACProvider({
      topic: params.topic,
      firewall,
    } as any);

    return response; // returns { success: boolean, publicKey?: string }
  } catch (error) {
    console.error("Failed to start QVAC P2P Provider:", error);
    throw error;
  }
}

export async function stopP2PProvider() {
  try {
    await stopQVACProvider();
  } catch (error) {
    console.error("Failed to stop QVAC P2P Provider:", error);
    throw error;
  }
}

export async function runHeartbeat(providerPublicKey: string): Promise<boolean> {
  try {
    const res = await heartbeat({ delegate: { providerPublicKey, timeout: 5000 } });
    return res.type === "heartbeat";
  } catch {
    return false;
  }
}
