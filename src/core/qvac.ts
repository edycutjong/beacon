import {
  loadModel,
  unloadModel,
  completion,
  embed as _embed,
  ragIngest,
  ragSearch,
  textToSpeech,
  startQVACProvider,
  stopQVACProvider,
  LLAMA_3_2_1B_INST_Q4_0,
  GTE_LARGE_FP16,
  TTS_EN_SUPERTONIC_Q8_0,
  WHISPER_EN_TINY_Q8_0 as _WHISPER_EN_TINY_Q8_0,
} from "@qvac/sdk";
import { recordModelLoad, recordModelUnload, recordCompletion, estimateTokens } from "./audit";

// Define custom constants or fallbacks
export const MEDPSY_MODEL_ID = "MedPsy-1.7B"; // Default name for MedPsy-1.7B
export const MULTIMODAL_MODEL_ID = "QVAC-Vision-1B"; // Multimodal vision model for scene understanding
export const LLAMA_MODEL_ID = LLAMA_3_2_1B_INST_Q4_0;
export const EMBEDDING_MODEL_ID = GTE_LARGE_FP16;

export interface CompletionMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface CompletionParams {
  modelId: string;
  history: CompletionMessage[];
  stream?: boolean;
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
    const src = typeof modelSrc === "string" ? modelSrc : modelSrc.src;
    const params: any = {
      modelSrc: src,
      modelType: "llamacpp-completion",
    };

    if (delegateParams) {
      // Confirm signature against docs.qvac.tether.io
      params.delegate = {
        providerPublicKey: delegateParams.providerPublicKey,
        timeout: delegateParams.timeout ?? 30000,
        fallbackToLocal: delegateParams.fallbackToLocal ?? true,
      };
    }

    const tLoad = Date.now();
    const modelId = await loadModel(params);
    recordModelLoad(modelId, params.modelType, Date.now() - tLoad);
    return modelId;
  } catch (error) {
    console.error("Failed to load LLM model:", error);
    throw error;
  }
}

export async function loadEmbeddingModel(modelSrc: any = EMBEDDING_MODEL_ID) {
  try {
    const src = typeof modelSrc === "string" ? modelSrc : modelSrc.src;
    const tLoad = Date.now();
    const modelId = await loadModel({
      modelSrc: src,
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
      modelSrc: TTS_EN_SUPERTONIC_Q8_0.src,
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
      history: params.history,
      stream: params.stream ?? false,
    };

    // Attach images for multimodal inference if provided
    if (params.images && params.images.length > 0) {
      completionParams.images = params.images;
    }

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
      const result = await completion({ ...completionParams, stream: false });
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
