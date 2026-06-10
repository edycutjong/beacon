import { describe, it, expect, vi, beforeEach } from "vitest";

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
  setAuditSink,
} from "../audit";
import * as audit from "../audit";

import { classifyDomain, domainLabel } from "../domain";
import { lexicalSearch, retrieveCitations } from "../rag";

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

    it("should handle empty audit log gracefully in lastCompletionMetrics", async () => {
      mockLoadModel.mockResolvedValue("local-model-id");
      mockCompletion.mockResolvedValue({ text: Promise.resolve("local concise answer") });
      const spy = vi.spyOn(audit, "getAuditLog").mockReturnValue([]);

      const result = await runRoute("hello", false);
      expect(result.tokenCount).toBeUndefined();
      expect(result.tokensPerSec).toBeUndefined();

      spy.mockRestore();
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

  it("falls back to totalMs for ttftMs if stream is empty", async () => {
    async function* emptyStream() {}
    mockCompletion.mockReturnValue({ tokenStream: emptyStream() });

    const res = await runCompletion({ modelId: "mid", history: [], stream: true });
    const out: string[] = [];
    for await (const t of res.tokenStream as AsyncGenerator<string>) out.push(t);
    expect(out).toHaveLength(0);

    const completions = getAuditLog().filter((e) => e.type === "completion");
    const last = completions[completions.length - 1];
    expect(last.streamed).toBe(true);
    expect(last.tokenCount).toBe(0);
    expect(last.ttftMs).toBeDefined();
    expect(last.ttftMs).toBe(last.totalMs);
  });

  it("records model load with undefined modelType for consoleSink branch", () => {
    recordModelLoad("no-type-id", undefined, 100);
    const log = getAuditLog();
    expect(log[log.length - 1]?.modelId).toBe("no-type-id");
  });

  it("records completion with missing optional fields for branches", () => {
    recordCompletion({ modelId: "missing-fields", totalMs: 100, tokenCount: 10, source: "delegated", streamed: true });
    const log1 = getAuditLog();
    const e = log1[log1.length - 1]!;
    expect(e.streamed).toBe(true);
    expect(e.source).toBe("delegated");

    recordCompletion({ modelId: "zero-tps", totalMs: 0, tokenCount: 0 });
    const log2 = getAuditLog();
    const e2 = log2[log2.length - 1]!;
    expect(e2.tokensPerSec).toBe(0);
  });

  it("respects MAX_EVENTS limit", () => {
    clearAuditLog();
    for (let i = 0; i < 505; i++) {
      recordModelLoad(`model-${i}`, "llamacpp-completion", 100);
    }
    const log = getAuditLog();
    expect(log).toHaveLength(500);
    expect(log[0].modelId).toBe("model-5");
  });

  it("handles model unload for unknown model in summary", () => {
    clearAuditLog();
    recordModelUnload("unknown-model");
    const s = getAuditSummary();
    expect(s.unloads).toBe(1);
  });

  it("handles defensive undefined metrics in summary", () => {
    clearAuditLog();
    const log = getAuditLog() as any[];
    log.push({ type: "completion", modelId: "raw-event" });
    const s = getAuditSummary();
    expect(s.avgTtftMs).toBeNull();
    expect(s.avgTokensPerSec).toBeNull();
  });

  it("allows setting a custom audit sink and handles sink errors", () => {
    const mockSink = vi.fn();
    setAuditSink(mockSink);
    recordModelLoad("sink-test", "llamacpp-completion", 100);
    expect(mockSink).toHaveBeenCalled();

    const throwingSink = () => { throw new Error("sink error"); };
    setAuditSink(throwingSink);
    expect(() => recordModelLoad("sink-error-test", "llamacpp-completion", 100)).not.toThrow();

    setAuditSink(null);
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

  it("returns null averages when there are no valid completions", () => {
    clearAuditLog();
    const s = getAuditSummary();
    expect(s.avgTtftMs).toBeNull();
    expect(s.avgTokensPerSec).toBeNull();
  });
});

describe("routing edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPairing();
  });

  // shouldDelegate(query, isImage, hasPeer) === (isImage || query.length > 200) && hasPeer
  it("treats exactly 200 chars as NOT heavy (boundary is > 200)", () => {
    expect(shouldDelegate("a".repeat(200), false, true)).toBe(false);
  });

  it("treats 201 chars as heavy", () => {
    expect(shouldDelegate("a".repeat(201), false, true)).toBe(true);
  });

  it("treats 199 chars as NOT heavy", () => {
    expect(shouldDelegate("a".repeat(199), false, true)).toBe(false);
  });

  it("never delegates without a peer, however heavy the query", () => {
    expect(shouldDelegate("a".repeat(5000), false, false)).toBe(false);
    expect(shouldDelegate("photo", true, false)).toBe(false);
  });

  it("delegates a short query when it carries an image and a peer exists", () => {
    expect(shouldDelegate("", true, true)).toBe(true);
    expect(shouldDelegate("describe this", true, true)).toBe(true);
  });

  it("handles empty and whitespace-only input as not heavy", () => {
    expect(shouldDelegate("", false, true)).toBe(false);
    expect(shouldDelegate("    ", false, true)).toBe(false);
  });

  it("runRoute delegates a 201-char query to a paired peer", async () => {
    pairWithProvider("d".repeat(64));
    mockLoadModel.mockResolvedValue("model-id");
    mockCompletion.mockResolvedValue({ text: Promise.resolve("delegated answer") });

    const r = await runRoute("a".repeat(201), false);
    expect(r.source).toBe("delegated");
  });

  it("runRoute keeps a boundary (200-char) query local even with a peer", async () => {
    pairWithProvider("d".repeat(64));
    mockLoadModel.mockResolvedValue("model-id");
    mockCompletion.mockResolvedValue({ text: Promise.resolve("local answer") });

    const r = await runRoute("a".repeat(200), false);
    expect(r.source).toBe("local");
  });
});

describe("p2p pairing — key format validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPairing();
  });

  it("accepts an all-lowercase 64-hex key", () => {
    const key = "0123456789abcdef".repeat(4);
    pairWithProvider(key);
    expect(getPairedProviderKey()).toBe(key);
  });

  it("accepts an all-uppercase 64-hex key", () => {
    const key = "0123456789ABCDEF".repeat(4);
    pairWithProvider(key);
    expect(getPairedProviderKey()).toBe(key);
  });

  it("accepts a mixed-case 64-hex key", () => {
    const key = "0123456789aBcDeF".repeat(4);
    pairWithProvider(key);
    expect(getPairedProviderKey()).toBe(key);
  });

  it("accepts an all-zero 64-hex key", () => {
    const key = "0".repeat(64);
    pairWithProvider(key);
    expect(getPairedProviderKey()).toBe(key);
  });

  it("rejects a 63-character key (one short)", () => {
    expect(() => pairWithProvider("a".repeat(63))).toThrow("64-character hex");
    expect(getPairedProviderKey()).toBeNull();
  });

  it("rejects a 65-character key (one long)", () => {
    expect(() => pairWithProvider("a".repeat(65))).toThrow("64-character hex");
    expect(getPairedProviderKey()).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(() => pairWithProvider("")).toThrow("64-character hex");
    expect(getPairedProviderKey()).toBeNull();
  });

  it("rejects a 64-char string containing non-hex letters (g–z)", () => {
    expect(() => pairWithProvider("g".repeat(64))).toThrow("64-character hex");
    expect(getPairedProviderKey()).toBeNull();
  });

  it("rejects a key padded with surrounding whitespace", () => {
    expect(() => pairWithProvider(" " + "a".repeat(62) + " ")).toThrow("64-character hex");
    expect(getPairedProviderKey()).toBeNull();
  });

  it("rejects a key with an embedded space", () => {
    expect(() => pairWithProvider("a".repeat(32) + " " + "a".repeat(31))).toThrow("64-character hex");
    expect(getPairedProviderKey()).toBeNull();
  });

  it("overwrites the previous key when re-paired", () => {
    const first = "a".repeat(64);
    const second = "b".repeat(64);
    pairWithProvider(first);
    pairWithProvider(second);
    expect(getPairedProviderKey()).toBe(second);
  });

  it("a failed re-pair leaves the existing key intact", () => {
    const good = "a".repeat(64);
    pairWithProvider(good);
    expect(() => pairWithProvider("nope")).toThrow();
    expect(getPairedProviderKey()).toBe(good);
  });

  it("clearPairing is idempotent", () => {
    pairWithProvider("c".repeat(64));
    clearPairing();
    clearPairing();
    expect(getPairedProviderKey()).toBeNull();
  });
});

describe("p2p host lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPairing();
  });

  it("uses the default 'beacon-field-compute' topic when none is given", async () => {
    mockStartQVACProvider.mockResolvedValue({ success: true, publicKey: "k" });
    await startBeaconHost();
    expect(mockStartQVACProvider).toHaveBeenCalledWith({
      topic: "beacon-field-compute",
      firewall: { mode: "allow", publicKeys: [] },
    });
  });

  it("forwards a custom topic to the provider", async () => {
    mockStartQVACProvider.mockResolvedValue({ success: true, publicKey: "k" });
    await startBeaconHost("custom-topic");
    expect(mockStartQVACProvider).toHaveBeenCalledWith({
      topic: "custom-topic",
      firewall: { mode: "allow", publicKeys: [] },
    });
  });

  it("returns the provider's public key on success", async () => {
    mockStartQVACProvider.mockResolvedValue({ success: true, publicKey: "pub-123" });
    await expect(startBeaconHost()).resolves.toBe("pub-123");
  });

  it("stopBeaconHost delegates to stopQVACProvider exactly once", async () => {
    mockStopQVACProvider.mockResolvedValue(undefined);
    await stopBeaconHost();
    expect(mockStopQVACProvider).toHaveBeenCalledTimes(1);
  });
});

describe("router — decision truth table", () => {
  // shouldDelegate(query, isImage, hasPeer) === (isImage || query.length > 200) && hasPeer
  it("short text, no image, no peer → local (false)", () => {
    expect(shouldDelegate("hi", false, false)).toBe(false);
  });
  it("short text, no image, peer → local (false)", () => {
    expect(shouldDelegate("hi", false, true)).toBe(false);
  });
  it("long text, no image, no peer → local (false)", () => {
    expect(shouldDelegate("a".repeat(201), false, false)).toBe(false);
  });
  it("long text, no image, peer → delegate (true)", () => {
    expect(shouldDelegate("a".repeat(201), false, true)).toBe(true);
  });
  it("short text, image, no peer → local (false)", () => {
    expect(shouldDelegate("hi", true, false)).toBe(false);
  });
  it("short text, image, peer → delegate (true)", () => {
    expect(shouldDelegate("hi", true, true)).toBe(true);
  });
  it("image dominates even for a boundary-length (200) query", () => {
    expect(shouldDelegate("a".repeat(200), true, true)).toBe(true);
  });
  it("is a pure function — repeated calls give the same answer", () => {
    const a = shouldDelegate("a".repeat(300), false, true);
    const b = shouldDelegate("a".repeat(300), false, true);
    expect(a).toBe(b);
    expect(a).toBe(true);
  });
});

describe("router — runRoute behaviour", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPairing();
    clearAuditLog();
  });

  it("reports a non-negative latency for a local route", async () => {
    mockLoadModel.mockResolvedValue("m");
    mockCompletion.mockResolvedValue({ text: Promise.resolve("ok") });
    const r = await runRoute("hi", false);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("unloads the model after a local route", async () => {
    mockLoadModel.mockResolvedValue("m-local");
    mockCompletion.mockResolvedValue({ text: Promise.resolve("ok") });
    mockUnloadModel.mockResolvedValue(undefined);
    await runRoute("hi", false);
    expect(mockUnloadModel).toHaveBeenCalledWith({ modelId: "m-local" });
  });

  it("unloads the model after a delegated route", async () => {
    pairWithProvider("e".repeat(64));
    mockLoadModel.mockResolvedValue("m-deleg");
    mockCompletion.mockResolvedValue({ text: Promise.resolve("ok") });
    mockUnloadModel.mockResolvedValue(undefined);
    await runRoute("a".repeat(250), false);
    expect(mockUnloadModel).toHaveBeenCalledWith({ modelId: "m-deleg" });
  });

  it("delegates an image query when a peer is paired", async () => {
    const peer = "f".repeat(64);
    pairWithProvider(peer);
    mockLoadModel.mockResolvedValue("m");
    mockCompletion.mockResolvedValue({ text: Promise.resolve("vision answer") });
    const r = await runRoute("what is this", true);
    expect(r.source).toBe("delegated");
    expect(r.peerId).toBe(peer);
  });

  it("runs an image query locally when no peer is paired", async () => {
    mockLoadModel.mockResolvedValue("m");
    mockCompletion.mockResolvedValue({ text: Promise.resolve("local vision answer") });
    const r = await runRoute("what is this", true);
    expect(r.source).toBe("local");
    expect(r.peerId).toBeUndefined();
  });

  it("a local route carries no peerId", async () => {
    mockLoadModel.mockResolvedValue("m");
    mockCompletion.mockResolvedValue({ text: Promise.resolve("ok") });
    const r = await runRoute("hi", false);
    expect(r.peerId).toBeUndefined();
  });

  it("uses the 'highly capable delegated' system prompt when delegating", async () => {
    pairWithProvider("a".repeat(64));
    mockLoadModel.mockResolvedValue("m");
    mockCompletion.mockResolvedValue({ text: Promise.resolve("ok") });
    await runRoute("a".repeat(250), false);
    const history = mockCompletion.mock.calls[0][0].history;
    expect(history[0].role).toBe("system");
    expect(history[0].content).toContain("delegated AI compute provider");
    expect(history[1]).toEqual({ role: "user", content: "a".repeat(250) });
  });

  it("uses the 'lightweight on-device' system prompt when local", async () => {
    mockLoadModel.mockResolvedValue("m");
    mockCompletion.mockResolvedValue({ text: Promise.resolve("ok") });
    await runRoute("hi", false);
    const history = mockCompletion.mock.calls[0][0].history;
    expect(history[0].content).toContain("lightweight on-device");
  });

  it("propagates tokenCount and tokensPerSec from the audit log", async () => {
    mockLoadModel.mockResolvedValue("m");
    mockCompletion.mockResolvedValue({ text: Promise.resolve("a longer answer with some tokens") });
    const r = await runRoute("hi", false);
    expect(r.tokenCount).toBeGreaterThan(0);
    expect(r.tokensPerSec).toBeGreaterThanOrEqual(0);
  });

  it("attempts to load twice (delegate then local) when the peer drops", async () => {
    pairWithProvider("a".repeat(64));
    mockLoadModel
      .mockRejectedValueOnce(new Error("peer gone"))
      .mockResolvedValueOnce("local-id");
    mockCompletion.mockResolvedValue({ text: Promise.resolve("fallback") });
    const r = await runRoute("a".repeat(250), false);
    expect(r.source).toBe("local");
    expect(mockLoadModel).toHaveBeenCalledTimes(2);
  });

  it("falls back to local when the delegated completion itself fails", async () => {
    pairWithProvider("a".repeat(64));
    mockLoadModel.mockResolvedValue("m");
    mockCompletion
      .mockRejectedValueOnce(new Error("delegated inference failed"))
      .mockResolvedValueOnce({ text: Promise.resolve("local recovery") });
    const r = await runRoute("a".repeat(250), false);
    expect(r.source).toBe("local");
    expect(r.text).toBe("local recovery");
  });
});

describe("qvac wrappers — call shapes & audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuditLog();
  });

  it("loadLLMModel (default) loads the Llama model with no delegate block", async () => {
    mockLoadModel.mockResolvedValue("llm-id");
    await loadLLMModel();
    expect(mockLoadModel).toHaveBeenCalledWith({
      modelSrc: "llama-model",
      modelType: "llamacpp-completion",
    });
  });

  it("loadLLMModel records a model_load audit event", async () => {
    mockLoadModel.mockResolvedValue("llm-id");
    await loadLLMModel();
    const last = getAuditLog().at(-1)!;
    expect(last.type).toBe("model_load");
    expect(last.modelType).toBe("llamacpp-completion");
  });

  it("loadEmbeddingModel loads the GTE model as 'embeddings'", async () => {
    mockLoadModel.mockResolvedValue("emb-id");
    await loadEmbeddingModel();
    expect(mockLoadModel).toHaveBeenCalledWith({
      modelSrc: "gte-model",
      modelType: "embeddings",
    });
    expect(getAuditLog().at(-1)!.modelType).toBe("embeddings");
  });

  it("loadTTSModel loads the supertonic source as 'tts' with language config", async () => {
    mockLoadModel.mockResolvedValue("tts-id");
    await loadTTSModel();
    expect(mockLoadModel).toHaveBeenCalledWith({
      modelSrc: "tts-src",
      modelType: "tts",
      modelConfig: { language: "en" },
    });
  });

  it("runCompletion attaches the images array for multimodal calls", async () => {
    mockCompletion.mockResolvedValue({ text: Promise.resolve("seen") });
    const img = new Uint8Array([4, 5, 6]);
    await runCompletion({ modelId: "m", history: [], images: [img] });
    expect(mockCompletion.mock.calls[0][0].images).toEqual([img]);
  });

  it("runCompletion omits the images key when none are provided", async () => {
    mockCompletion.mockResolvedValue({ text: Promise.resolve("text only") });
    await runCompletion({ modelId: "m", history: [] });
    expect(mockCompletion.mock.calls[0][0]).not.toHaveProperty("images");
  });

  it("runCompletion defaults stream to false", async () => {
    mockCompletion.mockResolvedValue({ text: Promise.resolve("x") });
    await runCompletion({ modelId: "m", history: [] });
    expect(mockCompletion.mock.calls[0][0].stream).toBe(false);
  });

  it("runSaveEmbeddings defaults chunk to false", async () => {
    mockRagIngest.mockResolvedValue({ success: true });
    await runSaveEmbeddings({ modelId: "m", documents: ["d"] });
    expect(mockRagIngest.mock.calls[0][0].chunk).toBe(false);
  });

  it("runSaveEmbeddings forwards chunk:true", async () => {
    mockRagIngest.mockResolvedValue({ success: true });
    await runSaveEmbeddings({ modelId: "m", documents: ["d"], chunk: true });
    expect(mockRagIngest.mock.calls[0][0].chunk).toBe(true);
  });

  it("runRagSearch defaults topK to 5", async () => {
    mockRagSearch.mockResolvedValue([]);
    await runRagSearch({ modelId: "m", query: "q" });
    expect(mockRagSearch.mock.calls[0][0].topK).toBe(5);
  });

  it("runRagSearch forwards a custom topK", async () => {
    mockRagSearch.mockResolvedValue([]);
    await runRagSearch({ modelId: "m", query: "q", topK: 12 });
    expect(mockRagSearch.mock.calls[0][0].topK).toBe(12);
  });

  it("runTextToSpeech unloads the TTS model after synthesis", async () => {
    mockLoadModel.mockResolvedValue("tts-id");
    mockTextToSpeech.mockReturnValue({ buffer: Promise.resolve(new Uint8Array([1])) });
    mockUnloadModel.mockResolvedValue(undefined);
    await runTextToSpeech({ text: "hello" });
    expect(mockUnloadModel).toHaveBeenCalledWith({ modelId: "tts-id" });
  });

  it("startP2PProvider passes undefined firewall when none is supplied", async () => {
    mockStartQVACProvider.mockResolvedValue({ success: true, publicKey: "k" });
    await startP2PProvider({ topic: "t" });
    expect(mockStartQVACProvider).toHaveBeenCalledWith({ topic: "t", firewall: undefined });
  });

  it("startP2PProvider passes a failure response straight through", async () => {
    mockStartQVACProvider.mockResolvedValue({ success: false, error: "denied" });
    const res = await startP2PProvider({ topic: "t" });
    expect(res).toEqual({ success: false, error: "denied" });
  });

  it("stopP2PProvider resolves when the SDK stop succeeds", async () => {
    mockStopQVACProvider.mockResolvedValue(undefined);
    await expect(stopP2PProvider()).resolves.toBeUndefined();
  });
});

describe("audit — estimation, recording & summaries", () => {
  beforeEach(() => {
    clearAuditLog();
    setAuditSink(null);
  });

  it("estimateTokens rounds up to whole tokens (~4 chars each)", () => {
    expect(estimateTokens("ab")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("a".repeat(9))).toBe(3);
  });

  it("estimateTokens returns 0 for empty input", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("recordCompletion defaults streamed to false", () => {
    recordCompletion({ modelId: "m", totalMs: 100, tokenCount: 10 });
    expect(getAuditLog().at(-1)!.streamed).toBe(false);
  });

  it("recordCompletion defaults ttftMs to totalMs", () => {
    recordCompletion({ modelId: "m", totalMs: 250, tokenCount: 10 });
    expect(getAuditLog().at(-1)!.ttftMs).toBe(250);
  });

  it("recordCompletion derives tokens/sec from totalMs", () => {
    recordCompletion({ modelId: "m", totalMs: 500, tokenCount: 50 });
    expect(getAuditLog().at(-1)!.tokensPerSec).toBe(100); // 50 tok / 0.5s
  });

  it("getAuditSummary totalEvents counts every recorded event", () => {
    recordModelLoad("a", "llamacpp-completion", 10);
    recordCompletion({ modelId: "a", totalMs: 100, tokenCount: 4 });
    recordModelUnload("a");
    expect(getAuditSummary().totalEvents).toBe(3);
  });

  it("getAuditSummary treats a model loaded twice and unloaded once as still active", () => {
    recordModelLoad("dup", "llamacpp-completion", 10);
    recordModelLoad("dup", "llamacpp-completion", 10);
    recordModelUnload("dup");
    expect(getAuditSummary().activeModels).toEqual(["dup"]);
  });

  it("getAuditSummary excludes zero-throughput completions from the average", () => {
    recordCompletion({ modelId: "a", totalMs: 0, tokenCount: 0 }); // tps 0 → excluded
    recordCompletion({ modelId: "b", totalMs: 1000, tokenCount: 20 }); // 20 tok/s
    expect(getAuditSummary().avgTokensPerSec).toBe(20);
  });

  it("a custom sink receives all three event types", () => {
    const seen: string[] = [];
    setAuditSink((e) => seen.push(e.type));
    recordModelLoad("a", "llamacpp-completion", 10);
    recordCompletion({ modelId: "a", totalMs: 100, tokenCount: 4 });
    recordModelUnload("a");
    expect(seen).toEqual(["model_load", "completion", "model_unload"]);
    setAuditSink(null);
  });

  it("getAuditLog reflects clearing", () => {
    recordModelLoad("a", "llamacpp-completion", 10);
    expect(getAuditLog().length).toBe(1);
    clearAuditLog();
    expect(getAuditLog().length).toBe(0);
  });

  it("recordModelLoad returns the event it pushed", () => {
    const ev = recordModelLoad("ret", "tts", 33);
    expect(ev).toMatchObject({ type: "model_load", modelId: "ret", loadMs: 33 });
  });
});

describe("domain classifier (MedPsy routing)", () => {
  it("classifies obvious medical queries as 'medical'", () => {
    expect(classifyDomain("How do I treat a severe bleeding wound?")).toBe("medical");
    expect(classifyDomain("Is this a fracture or a sprain?")).toBe("medical");
    expect(classifyDomain("Steps for CPR on an unconscious casualty")).toBe("medical");
    expect(classifyDomain("How to manage a crush injury")).toBe("medical");
  });

  it("classifies non-medical queries as 'general'", () => {
    expect(classifyDomain("What is the bearing back to base camp?")).toBe("general");
    expect(classifyDomain("Summarize the comms log")).toBe("general");
    expect(classifyDomain("")).toBe("general");
  });

  it("is case-insensitive", () => {
    expect(classifyDomain("TOURNIQUET PLACEMENT")).toBe("medical");
    expect(classifyDomain("Bleeding Control")).toBe("medical");
  });

  it("matches inflected forms via substring (injur → injury/injuries)", () => {
    expect(classifyDomain("triage the injured first")).toBe("medical");
    expect(classifyDomain("multiple injuries reported")).toBe("medical");
  });

  it("exposes a human label per domain", () => {
    expect(domainLabel("medical")).toBe("MEDICAL TRIAGE");
    expect(domainLabel("general")).toBe("GENERAL");
  });
});

describe("RAG lexical retrieval over the field manual", () => {
  it("returns relevant, scored citations for a medical query", () => {
    const hits = lexicalSearch("how to stop severe bleeding with a tourniquet");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].title).toMatch(/Bleeding|Tourniquet/i);
    expect(hits[0].page).toBeGreaterThan(0);
    expect(hits[0].snippet.length).toBeGreaterThan(0);
  });

  it("sorts citations by descending score", () => {
    const hits = lexicalSearch("burn and bleeding and fracture splint");
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
    }
  });

  it("respects the topK limit", () => {
    const hits = lexicalSearch("bleeding burn fracture shock hypothermia water fire", 2);
    expect(hits.length).toBeLessThanOrEqual(2);
  });

  it("returns no citations for an empty or stopword-only query", () => {
    expect(lexicalSearch("")).toEqual([]);
    expect(lexicalSearch("the and for")).toEqual([]);
  });

  it("returns no citations when nothing matches the manual", () => {
    expect(lexicalSearch("quarterly blockchain tokenomics roadmap")).toEqual([]);
  });
});

describe("retrieveCitations (SDK-first, lexical fallback)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps QVAC ragSearch hits into citations when the index returns results", async () => {
    mockRagSearch.mockResolvedValue([
      { id: "h1", title: "Indexed Section", page: 99, content: "indexed snippet", score: 5 },
    ]);
    const cites = await retrieveCitations("anything");
    expect(cites[0]).toMatchObject({ id: "h1", title: "Indexed Section", page: 99, snippet: "indexed snippet" });
  });

  it("falls back to lexical search when ragSearch returns empty", async () => {
    mockRagSearch.mockResolvedValue([]);
    const cites = await retrieveCitations("treat a burn with cool water");
    expect(cites.length).toBeGreaterThan(0);
    expect(cites[0].title).toMatch(/Burn/i);
  });

  it("falls back to lexical search when ragSearch throws", async () => {
    mockRagSearch.mockRejectedValue(new Error("no index loaded"));
    const cites = await retrieveCitations("hypothermia rewarming");
    expect(cites.length).toBeGreaterThan(0);
    expect(cites[0].title).toMatch(/Hypothermia/i);
  });
});

describe("router — domain routing & grounded answers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPairing();
    clearAuditLog();
    mockRagSearch.mockResolvedValue([]); // force the offline lexical path
  });

  it("routes a medical query to the MedPsy model", async () => {
    mockLoadModel.mockResolvedValue("m");
    mockCompletion.mockResolvedValue({ text: Promise.resolve("apply a tourniquet") });
    const r = await runRoute("how do I treat a severe bleeding wound", false);
    expect(r.domain).toBe("medical");
    expect(r.model).toBe("MedPsy-1.7B");
    expect(mockLoadModel.mock.calls[0][0].modelSrc).toBe("MedPsy-1.7B");
  });

  it("routes a general query to the Llama model", async () => {
    mockLoadModel.mockResolvedValue("m");
    mockCompletion.mockResolvedValue({ text: Promise.resolve("take a back-bearing") });
    const r = await runRoute("what is the bearing back to base camp", false);
    expect(r.domain).toBe("general");
    expect(r.model).toBe("Llama-3.2-1B");
    expect(mockLoadModel.mock.calls[0][0].modelSrc).toBe("llama-model");
  });

  it("attaches field-manual citations to a grounded answer", async () => {
    mockLoadModel.mockResolvedValue("m");
    mockCompletion.mockResolvedValue({ text: Promise.resolve("cool the burn") });
    const r = await runRoute("how to treat a thermal burn in the field", false);
    expect(r.citations.length).toBeGreaterThan(0);
    expect(r.citations[0].page).toBeGreaterThan(0);
  });

  it("injects the retrieved excerpts into the system prompt (RAG grounding)", async () => {
    mockLoadModel.mockResolvedValue("m");
    mockCompletion.mockResolvedValue({ text: Promise.resolve("...") });
    await runRoute("steps to control severe bleeding with a tourniquet", false);
    const systemContent = mockCompletion.mock.calls[0][0].history[0].content;
    expect(systemContent).toContain("field-manual excerpts");
    expect(systemContent).toMatch(/\[p\.\d+\]/);
  });

  it("leaves the system prompt ungrounded when no citation matches", async () => {
    mockLoadModel.mockResolvedValue("m");
    mockCompletion.mockResolvedValue({ text: Promise.resolve("...") });
    await runRoute("quarterly blockchain tokenomics roadmap", false);
    const systemContent = mockCompletion.mock.calls[0][0].history[0].content;
    expect(systemContent).not.toContain("field-manual excerpts");
    expect(mockCompletion.mock.calls[0][0].history[1]).toEqual({
      role: "user",
      content: "quarterly blockchain tokenomics roadmap",
    });
  });
});
