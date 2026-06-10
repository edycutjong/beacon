import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    server: {
      deps: {
        inline: ["react-native-nfc-manager", "expo-audio", "expo-file-system", "react-native"],
      },
    },
  },
});
