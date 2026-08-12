import { describe, it, expect } from "vitest";
import { chunkText } from "../src/lib/chunking";

describe("chunkText", () => {
  it("splits text into multiple chunks when it exceeds the word limit", () => {
    const longText = "This is a sentence. ".repeat(600); // ~2400 words
    const chunks = chunkText(longText, 500);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("keeps short text as a single chunk", () => {
    const shortText = "This is a short sentence. Another one here.";
    const chunks = chunkText(shortText, 500);
    expect(chunks.length).toBe(1);
  });

  it("never cuts a sentence in half", () => {
    const text = "First sentence here. Second sentence here. Third sentence here.";
    const chunks = chunkText(text, 3);
    chunks.forEach(chunk => {
      expect(chunk.trim().endsWith(".")).toBe(true);
    });
  });

  it("returns an empty array for empty input", () => {
    const chunks = chunkText("", 500);
    expect(chunks).toEqual([]);
  });
});