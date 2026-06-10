export default {
  plugins: [
    "@qvac/sdk/llamacpp-completion/plugin",
    "@qvac/sdk/llamacpp-embedding/plugin",
    "@qvac/sdk/whispercpp-transcription/plugin",
    "@qvac/sdk/parakeet-transcription/plugin",
    "@qvac/sdk/nmtcpp-translation/plugin",
    "@qvac/sdk/onnx-tts/plugin",
    "@qvac/sdk/onnx-ocr/plugin",
    "@qvac/sdk/sdcpp-generation/plugin"
  ]
};
