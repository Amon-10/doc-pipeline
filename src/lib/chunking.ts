export function chunkText(text: string, wordsPerChunk: number = 500): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/); // split on sentence boundaries
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let wordCount = 0;

  for (const sentence of sentences) {
    const sentenceWordCount = sentence.split(/\s+/).length;
    
    if (wordCount + sentenceWordCount > wordsPerChunk && currentChunk.length > 0) {
      chunks.push(currentChunk.join(" "));
      currentChunk = [];
      wordCount = 0;
    }
    
    currentChunk.push(sentence);
    wordCount += sentenceWordCount;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(" "));
  }

  return chunks;
}