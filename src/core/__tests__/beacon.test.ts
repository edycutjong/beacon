import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @qvac/sdk
const mockLoadModel = vi.fn();
const mockUnloadModel = vi.fn();
const mockCompletion = vi.fn();
const mockTextToSpeech = vi.fn();
const mockStartQVACProvider = vi.fn();
const mockStopQVACProvider = vi.fn();
const mockRagIngest = vi.fn();
const mockRagSearch = vi.fn();

vi.mock("@qvac/sdk", () => ({
  loadModel: (...args: any[]) => mockLoadModel(...args),
  unloadModel: (...args: any[]) => mockUnloadModel(...args),
  completion: (...args: any[]) => mockCompletion(...args),
  textToSpeech: (...args: any[]) => mockTextToSpeech(...args),
  startQVACProvider: (...args: any[]) => mockStartQVACProvider(...args),
  stopQVACProvider: (...args: any[]) => mockStopQVACProvider(...args),
  ragIngest: (...args: any[]) => mockRagIngest(...args),
  ragSearch: (...args: any[]) => mockRagSearch(...args),
  LLAMA_3_2_1B_INST_Q4_0: "llama-model",
  GTE_LARGE_FP16: "gte-model",
  TTS_EN_SUPERTONIC_Q8_0: { src: "tts-src" },
  WHISPER_EN_TINY_Q8_0: "whisper-model",
}));

// Import Beacon core modules and qvac wrappers
import {
  startBeaconHost,
  stopBeaconHost,
  pairWithProvider,
  getPairedProviderKey,
  clearPairing,
} from "../p2p";

import {
  shouldDelegate,
  runRoute,
} from "../router";

import {
  loadLLMModel,
  loadEmbeddingModel,
  loadTTSModel,
  unloadQVACModel,
  runCompletion,
  runSaveEmbeddings,
  runRagSearch,
  runTextToSpeech,
  startP2PProvider,
  stopP2PProvider,
} from "../qvac";

import {
  estimateTokens,
  recordModelLoad,
  recordModelUnload,
  recordCompletion,
  getAuditLog,
  clearAuditLog,
  getAuditSummary,
} from "../audit";

describe("Beacon Core Module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPairing();
  });

  describe("p2p.ts tests", () => {
    it("should start Beacon Host successfully", async () => {
      mockStartQVACProvider.mockResolvedValue({ success: true, publicKey: "mocked-pubkey" });
      const pubKey = await startBeaconHost();
      expect(pubKey).toBe("mocked-pubkey");
      expect(mockStartQVACProvider).toHaveBeenCalledWith({
        topic: "beacon-field-compute",
        firewall: { mode: "allow", publicKeys: [] },
      });
    });

    it("should throw error if start Beacon Host fails", async () => {
      mockStartQVACProvider.mockResolvedValue({ success: false, error: "Network error" });
      await expect(startBeaconHost()).rejects.toThrow("Network error");

      mockStartQVACProvider.mockResolvedValue({ success: false });
      await expect(startBeaconHost()).rejects.toThrow("Unknown error starting P2P provider");
    });

    it("should throw error if start Beacon Host succeeds but returns no public key", async () => {
      mockStartQVACProvider.mockResolvedValue({ success: true });
      await expect(startBeaconHost()).rejects.toThrow("Unknown error starting P2P provider");
    });

    it("should handle start Beacon Host exception", async () => {
      mockStartQVACProvider.mockRejectedValue(new Error("Crash"));
      await expect(startBeaconHost()).rejects.toThrow("Crash");
    });

    it("should stop Beacon Host", async () => {
      mockStopQVACProvider.mockResolvedValue(undefined);
      await stopBeaconHost();
      expect(mockStopQVACProvider).toHaveBeenCalled();
    });

    it("should pair with valid provider public key", () => {
      const validKey = "a".repeat(64); // 64 hex characters
      pairWithProvider(validKey);
      expect(getPairedProviderKey()).toBe(validKey);
    });

    it("should throw error when pairing with invalid provider public key", () => {
      const invalidKey = "too-short";
      expect(() => pairWithProvider(invalidKey)).toThrow(
        "Invalid public key format. Must be a 64-character hex string."
      );
      expect(getPairedProviderKey()).toBeNull();
    });

    it("should clear pairing", () => {
      pairWithProvider("b".repeat(64));
      expect(getPairedProviderKey()).not.toBeNull();
      clearPairing();
      expect(getPairedProviderKey()).toBeNull();
    });
  });

  describe("router.ts tests", () => {
    it("should decide delegation based on query, image, and peer presence", () => {
      // Not heavy, no peer
      expect(shouldDelegate("hi", false, false)).toBe(false);
      // Not heavy, has peer
      expect(shouldDelegate("hi", false, true)).toBe(false);
      // Is heavy (long query), no peer
      expect(shouldDelegate("a".repeat(201), false, false)).toBe(false);
      // Is heavy (long query), has peer
      expect(shouldDelegate("a".repeat(201), false, true)).toBe(true);
      // Is heavy (image), no peer
      expect(shouldDelegate("hi", true, false)).toBe(false);
      // Is heavy (image), has peer
      expect(shouldDelegate("hi", true, true)).toBe(true);
    });

    it("should execute delegated route when conditions met", async () => {
      const peerKey = "c".repeat(64);
      pairWithProvider(peerKey);

      mockLoadModel.mockResolvedValue("mock-model-id");
      mockCompletion.mockResolvedValue({ text: Promise.resolve("delegated answer") });
      mockUnloadModel.mockResolvedValue(undefined);

      const result = await runRoute("a".repeat(205), false);
      expect(result.source).toBe("delegated");
      expect(result.text).toBe("delegated answer");
      expect(result.peerId).toBe(peerKey);
      expect(mockLoadModel).toHaveBeenCalledWith({
        modelSrc: "llama-model",
        modelType: "llamacpp-completion",
        delegate: {
          providerPublicKey: peerKey,
          timeout: 10000,
          fallbackToLocal: true,
        }
      });
    });

    it("should fall back to local route if delegation fails", async () => {
      const peerKey = "c".repeat(64);
      pairWithProvider(peerKey);

      // First call (loadModel for delegation) fails
      mockLoadModel
        .mockRejectedValueOnce(new Error("Peer connection failed"))
        // Second call (loadModel for local) succeeds
        .mockResolvedValueOnce("local-model-id");

      mockCompletion.mockResolvedValue({ text: Promise.resolve("local fallback answer") });

      const result = await runRoute("a".repeat(205), false);
      expect(result.source).toBe("local");
      expect(result.text).toBe("local fallback answer");
    });

    it("should execute local route if no peer or conditions not met", async () => {
      // Conditions not met (short query, no image)
      mockLoadModel.mockResolvedValue("local-model-id");
      mockCompletion.mockResolvedValue({ text: Promise.resolve("local concise answer") });

      const result = await runRoute("hello", false);
      expect(result.source).toBe("local");
      expect(result.text).toBe("local concise answer");
      expect(mockLoadModel).toHaveBeenCalledWith({
        modelSrc: "llama-model",
        modelType: "llamacpp-completion",
      });
    });
  });

  describe("qvac.ts wrapper tests", () => {
    it("should load Embedding Model successfully", async () => {
      mockLoadModel.mockResolvedValue("mock-embed-id");
      const id = await loadEmbeddingModel();
      expect(id).toBe("mock-embed-id");

      // Test object modelSrc parameter
      const idObj = await loadEmbeddingModel({ src: "obj-embed-model" });
      expect(idObj).toBe("mock-embed-id");
    });

    it("should load TTS Model successfully", async () => {
      mockLoadModel.mockResolvedValue("mock-tts-id");
      const id = await loadTTSModel();
      expect(id).toBe("mock-tts-id");
    });

    it("should load LLM Model with object modelSrc", async () => {
      mockLoadModel.mockResolvedValue("mock-llm-id");
      const idObj = await loadLLMModel({ src: "obj-llama-model" });
      expect(idObj).toBe("mock-llm-id");
    });

    it("should load LLM Model with delegate options and defaults", async () => {
      mockLoadModel.mockResolvedValue("mock-llm-id");
      const id = await loadLLMModel("custom-src", {
        providerPublicKey: "pubkey"
      });
      expect(id).toBe("mock-llm-id");
      expect(mockLoadModel).toHaveBeenCalledWith({
        modelSrc: "custom-src",
        modelType: "llamacpp-completion",
        delegate: {
          providerPublicKey: "pubkey",
          timeout: 30000,
          fallbackToLocal: true
        }
      });
    });


    it("should handle model loading failures", async () => {
      mockLoadModel.mockRejectedValue(new Error("Load failed"));
      await expect(loadLLMModel()).rejects.toThrow("Load failed");
      await expect(loadEmbeddingModel()).rejects.toThrow("Load failed");
      await expect(loadTTSModel()).rejects.toThrow("Load failed");
    });

    it("should log error when unloading fails but not throw", async () => {
      mockUnloadModel.mockRejectedValue(new Error("Unload failed"));
      await expect(unloadQVACModel("mock-id")).resolves.not.toThrow();
    });

    it("should run Completion successfully with text", async () => {
      mockCompletion.mockResolvedValue({ text: Promise.resolve("hello") });
      const res = await runCompletion({
        modelId: "mock-id",
        history: [{ role: "user", content: "hi" }],
      });
      expect(res.text).toBe("hello");
    });

    it("should run Completion successfully with stream", async () => {
      const mockStream = { tokenStream: "stream-obj" };
      mockCompletion.mockReturnValue(mockStream);
      const res = await runCompletion({
        modelId: "mock-id",
        history: [{ role: "user", content: "hi" }],
        stream: true,
      });
      expect(res.tokenStream).toBe("stream-obj");
    });

    it("should run Completion with images if provided", async () => {
      mockCompletion.mockResolvedValue({ text: Promise.resolve("image-processed") });
      const img = new Uint8Array([1, 2, 3]);
      const res = await runCompletion({
        modelId: "mock-id",
        history: [{ role: "user", content: "hi" }],
        images: [img],
      });
      expect(res.text).toBe("image-processed");

      // Test empty images array to cover the empty branch check
      const resEmpty = await runCompletion({
        modelId: "mock-id",
        history: [{ role: "user", content: "hi" }],
        images: [],
      });
      expect(resEmpty.text).toBe("image-processed");
    });

    it("should handle runCompletion failures", async () => {
      mockCompletion.mockRejectedValue(new Error("Inference failed"));
      await expect(
        runCompletion({
          modelId: "mock-id",
          history: [],
        })
      ).rejects.toThrow("Inference failed");
    });

    it("should save embeddings successfully", async () => {
      mockRagIngest.mockResolvedValue({ success: true });
      const res = await runSaveEmbeddings({
        modelId: "mock-id",
        documents: ["doc1"],
        chunk: true,
      });
      expect(res).toEqual({ success: true });
    });

    it("should handle save embeddings failure", async () => {
      mockRagIngest.mockRejectedValue(new Error("Ingest failed"));
      await expect(
        runSaveEmbeddings({
          modelId: "mock-id",
          documents: [],
        })
      ).rejects.toThrow("Ingest failed");
    });

    it("should search RAG successfully", async () => {
      mockRagSearch.mockResolvedValue([{ content: "found" }]);
      const res = await runRagSearch({
        modelId: "mock-id",
        query: "test",
      });
      expect(res).toEqual([{ content: "found" }]);
    });

    it("should handle RAG search failure", async () => {
      mockRagSearch.mockRejectedValue(new Error("Search failed"));
      await expect(
        runRagSearch({
          modelId: "mock-id",
          query: "test",
        })
      ).rejects.toThrow("Search failed");
    });

    it("should synthesize TTS successfully", async () => {
      mockLoadModel.mockResolvedValue("mock-tts-id");
      mockTextToSpeech.mockReturnValue({ buffer: Promise.resolve(new Uint8Array([9, 9])) });
      mockUnloadModel.mockResolvedValue(undefined);

      const buffer = await runTextToSpeech({ text: "say hi" });
      expect(buffer).toEqual(new Uint8Array([9, 9]));
    });

    it("should handle TTS failure", async () => {
      mockLoadModel.mockResolvedValue("mock-tts-id");
      mockTextToSpeech.mockReturnValue({ buffer: Promise.reject(new Error("TTS failed")) });
      await expect(runTextToSpeech({ text: "say hi" })).rejects.toThrow("TTS failed");
    });

    it("should handle stopP2PProvider failures", async () => {
      mockStopQVACProvider.mockRejectedValue(new Error("Stop failed"));
      await expect(stopP2PProvider()).rejects.toThrow("Stop failed");
    });

    it("should pair with invalid key and handle errors in startP2PProvider", async () => {
      mockStartQVACProvider.mockRejectedValue(new Error("Start failed"));
      await expect(startP2PProvider({ topic: "test" })).rejects.toThrow("Start failed");
    });

    it("should start P2P provider successfully", async () => {
      mockStartQVACProvider.mockResolvedValue({ success: true, publicKey: "pubkey" });
      const res = await startP2PProvider({ topic: "test" });
      expect(res).toEqual({ success: true, publicKey: "pubkey" });

      // Test with firewall definition to cover the firewall branch
      const resFW = await startP2PProvider({
        topic: "test",
        firewall: { mode: "allow", publicKeys: ["key1"] }
      });
      expect(resFW).toEqual({ success: true, publicKey: "pubkey" });
    });
  });
});

describe("Audit Log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuditLog();
  });

  it("estimates tokens from text length (~4 chars/token)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(40))).toBe(10);
  });

  it("records model load / unload / completion events", () => {
    recordModelLoad("m1", "llamacpp-completion", 120);
    recordCompletion({ modelId: "m1", totalMs: 200, tokenCount: 40, streamed: false });
    recordModelUnload("m1");

    const log = getAuditLog();
    expect(log).toHaveLength(3);
    expect(log[0]).toMatchObject({ type: "model_load", modelId: "m1", loadMs: 120 });
    // tokens/sec is derived: 40 tokens over 0.2s = 200 tok/s
    expect(log[1]).toMatchObject({ type: "completion", tokenCount: 40, tokensPerSec: 200, streamed: false });
    expect(log[2]).toMatchObject({ type: "model_unload", modelId: "m1" });
  });

  it("summarizes active models and average metrics", () => {
    recordModelLoad("a", "llamacpp-completion", 100);
    recordModelLoad("b", "embeddings", 50);
    recordCompletion({ modelId: "a", ttftMs: 80, totalMs: 100, tokenCount: 50, streamed: true });
    recordModelUnload("b"); // b loaded then unloaded → not active

    const s = getAuditSummary();
    expect(s.loads).toBe(2);
    expect(s.unloads).toBe(1);
    expect(s.completions).toBe(1);
    expect(s.activeModels).toEqual(["a"]);
    expect(s.avgTtftMs).toBe(80);
    expect(s.avgTokensPerSec).toBeCloseTo(500, 0); // 50 tok / 0.1s
  });

  it("auto-records a completion event from runCompletion (non-stream)", async () => {
    mockCompletion.mockResolvedValue({ text: Promise.resolve("a delegated answer of some length") });
    await runCompletion({ modelId: "mid", history: [{ role: "user", content: "hi" }] });

    const completions = getAuditLog().filter((e) => e.type === "completion");
    expect(completions).toHaveLength(1);
    expect(completions[0].streamed).toBe(false);
    expect(completions[0].tokenCount).toBeGreaterThan(0);
  });

  it("captures a true TTFT from a real token stream", async () => {
    async function* fakeStream() {
      yield "to";
      yield "ken";
    }
    mockCompletion.mockReturnValue({ tokenStream: fakeStream() });

    const res = await runCompletion({ modelId: "mid", history: [], stream: true });
    // Drain the instrumented stream so the finally-block records the event.
    const out: string[] = [];
    for await (const t of res.tokenStream as AsyncGenerator<string>) out.push(t);
    expect(out).toEqual(["to", "ken"]);

    const completions = getAuditLog().filter((e) => e.type === "completion");
    expect(completions).toHaveLength(1);
    expect(completions[0].streamed).toBe(true);
    expect(completions[0].tokenCount).toBe(2);
    expect(completions[0].ttftMs).toBeGreaterThanOrEqual(0);
  });

  it("records load + unload through the qvac wrappers", async () => {
    mockLoadModel.mockResolvedValue("loaded-id");
    mockUnloadModel.mockResolvedValue(undefined);

    await loadLLMModel();
    await unloadQVACModel("loaded-id");

    const s = getAuditSummary();
    expect(s.loads).toBe(1);
    expect(s.unloads).toBe(1);
    expect(s.activeModels).toEqual([]); // loaded then unloaded
  });
});
