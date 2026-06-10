// Dummy mock for @qvac/sdk for web E2E tests
export const loadModel = async () => "dummy-model";
export const unloadModel = async () => {};
export const completion = async () => ({ text: "Mock response from QVAC SDK" });
export const embed = async () => ({ embeddings: [] });
export const ragIngest = async () => ({ success: true });
export const ragSearch = async () => ([]);
export const textToSpeech = () => ({ buffer: new Uint8Array() });
export const startQVACProvider = async () => ({ success: true, publicKey: "mock-pub-key" });
export const stopQVACProvider = async () => {};
export const LLAMA_3_2_1B_INST_Q4_0 = { src: "dummy" };
export const GTE_LARGE_FP16 = { src: "dummy" };
export const TTS_EN_SUPERTONIC_Q8_0 = { src: "dummy" };
export const WHISPER_EN_TINY_Q8_0 = { src: "dummy" };
