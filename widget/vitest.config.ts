import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // jsdom provides a DOM so DOMPurify and DOM APIs work in tests.
    environment: "jsdom",
  },
});
