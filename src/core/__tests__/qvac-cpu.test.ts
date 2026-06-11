/**
 * Tests for FORCE_CPU branch coverage in qvac.ts.
 *
 * The FORCE_CPU constant is evaluated at module-load time from
 * process.env.EXPO_PUBLIC_FORCE_CPU. We set the env var in vi.hoisted()
 * (which runs before any vi.mock factory or import) and use
 * vi.resetModules() + dynamic import so qvac.ts re-evaluates its IIFE.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Set env var in hoisted block — runs before everything else
vi.hoisted(() => {
  process.env.EXPO_PUBLIC_FORCE_CPU = "1";
});

// Mock @qvac/sdk
const mockLoadModel = vi.fn().mockResolvedValue("model-cpu-123");
const mockUnloadModel = vi.fn().mockResolvedValue(undefined);
const mockTranscribe = vi.fn().mockResolvedValue("transcribed text");

vi.mock("@qvac/sdk", () => ({
  loadModel: (...args: any[]) => mockLoadModel(...args),
  unloadModel: (...args: any[]) => mockUnloadModel(...args),
  transcribe: (...args: any[]) => mockTranscribe(...args),
  completion: vi.fn(),
  ragIngest: vi.fn(),
  ragSearch: vi.fn(),
  textToSpeech: vi.fn(),
  startQVACProvider: vi.fn(),
  stopQVACProvider: vi.fn(),
  heartbeat: vi.fn(),
  LLAMA_3_2_1B_INST_Q4_0: "llama-model",
  GTE_LARGE_FP16: "gte-model",
  TTS_EN_SUPERTONIC_Q8_0: { src: "tts-src" },
  WHISPER_EN_TINY_Q8_0: "whisper-model",
  SMOLVLM2_500M_MULTIMODAL_Q8_0: "vision-model",
  MMPROJ_SMOLVLM2_500M_MULTIMODAL_Q8_0: "vision-mmproj",
}));

// Mock audit so it doesn't interfere
vi.mock("../audit.ts", () => ({
  recordModelLoad: vi.fn(),
  recordModelUnload: vi.fn(),
  recordCompletion: vi.fn(),
  estimateTokens: vi.fn().mockReturnValue(10),
}));

// Dynamic import — qvac.ts will re-evaluate with FORCE_CPU=true
const qvac = await import("../qvac.ts");

describe("qvac.ts — FORCE_CPU=true branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadModel.mockResolvedValue("model-cpu-123");
  });

  it("loadLLMModel passes cpu config when FORCE_CPU is true and no delegate", async () => {
    await qvac.loadLLMModel();

    expect(mockLoadModel).toHaveBeenCalledWith(
      expect.objectContaining({
        modelConfig: expect.objectContaining({
          device: "cpu",
          gpu_layers: 0,
        }),
      }),
    );
  });

  it("loadLLMModel omits cpu config when delegating even with FORCE_CPU", async () => {
    await qvac.loadLLMModel(undefined, {
      providerPublicKey: "abc123",
      timeout: 5000,
      fallbackToLocal: true,
    });

    const call = mockLoadModel.mock.calls[0][0];
    // When delegating, inference runs on the laptop — no cpu override here
    expect(call.modelConfig.device).toBeUndefined();
    expect(call.modelConfig.gpu_layers).toBeUndefined();
    expect(call.delegate).toBeDefined();
  });

  it("loadVisionModel passes cpu config when FORCE_CPU is true and no delegate", async () => {
    await qvac.loadVisionModel();

    expect(mockLoadModel).toHaveBeenCalledWith(
      expect.objectContaining({
        modelConfig: expect.objectContaining({
          device: "cpu",
          gpu_layers: 0,
          projectionModelSrc: "vision-mmproj",
        }),
      }),
    );
  });

  it("loadEmbeddingModel attaches cpu config when FORCE_CPU is true", async () => {
    await qvac.loadEmbeddingModel();

    expect(mockLoadModel).toHaveBeenCalledWith(
      expect.objectContaining({
        modelConfig: expect.objectContaining({
          device: "cpu",
          gpu_layers: 0,
        }),
      }),
    );
  });

  it("loadSTTModel passes use_gpu:false when FORCE_CPU is true", async () => {
    await qvac.loadSTTModel();

    expect(mockLoadModel).toHaveBeenCalledWith(
      expect.objectContaining({
        modelConfig: expect.objectContaining({
          use_gpu: false,
        }),
      }),
    );
  });

  it("runTranscription works with FORCE_CPU (whisper cpu config applied)", async () => {
    const result = await qvac.runTranscription({ audioChunk: "audio-path.wav" });

    expect(result).toBe("transcribed text");
    // Verify the STT model was loaded with cpu config
    expect(mockLoadModel).toHaveBeenCalledWith(
      expect.objectContaining({
        modelType: "whisper",
        modelConfig: expect.objectContaining({
          use_gpu: false,
        }),
      }),
    );
    // Model unloaded after transcription
    expect(mockUnloadModel).toHaveBeenCalledWith({ modelId: "model-cpu-123" });
  });
});
