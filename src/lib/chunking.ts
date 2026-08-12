/**
 * Splits text into chunks of roughly `wordsPerChunk` words, snapping to
 * sentence boundaries so no chunk cuts a sentence in half.
 *
 * Sentence-aware chunking gives OpenAI more coherent context per chunk
 * than a raw character or word cutoff would, which tends to produce
 * better summaries.
 *
 * @param text - full extracted text from the PDF
 * @param wordsPerChunk - target chunk size in words (default 500)
 * @returns array of text chunks, each ending on a complete sentence
 */
export function chunkText(text: string, wordsPerChunk: number = 500): string[] {
  if (!text.trim()) return [];
  
  // split on sentence-ending punctuation followed by whitespace
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let wordCount = 0;

  for (const sentence of sentences) {
    const sentenceWordCount = sentence.split(/\s+/).length;

    // start a new chunk once adding this sentence would exceed the target size
    if (wordCount + sentenceWordCount > wordsPerChunk && currentChunk.length > 0) {
      chunks.push(currentChunk.join(" "));
      currentChunk = [];
      wordCount = 0;
    }

    currentChunk.push(sentence);
    wordCount += sentenceWordCount;
  }

  // push whatever's left as the final chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(" "));
  }

  return chunks;
}