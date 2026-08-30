import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

type PdfParser = (buffer: Buffer) => Promise<{ text: string }>;

describe("pdf-parse CommonJS compatibility", () => {
  it("loads with require and extracts text from a real PDF buffer", async () => {
    const pdfParse: PdfParser = require("pdf-parse");
    expect(typeof pdfParse).toBe("function");

    const packageRoot = path.dirname(require.resolve("pdf-parse"));
    const validPdf = await readFile(path.join(packageRoot, "test/data/01-valid.pdf"));
    const parsed = await pdfParse(validPdf);
    expect(parsed.text.trim().length).toBeGreaterThan(0);
  });
});
