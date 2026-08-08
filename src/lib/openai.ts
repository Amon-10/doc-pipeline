import OpenAI from "openai";

// picks up OPENAI_API_KEY from environment automatically — no need to pass it explicitly
const client = new OpenAI();

/**
 * Sends a single chunk of text to OpenAI and returns a concise summary.
 * Kept separate from the worker so the summarization logic can be tested
 * or swapped for a different provider without touching job/queue code.
 *
 * @param chunk - a section of extracted PDF text to summarize
 * @returns the model's summary as plain text
 */
export async function summarizeChunk(chunk: string) : Promise<string>{
const response = await client.responses.create({
  model: "gpt-5.4-mini",
  input: `Provide a concise summary for the following text: ${chunk}`,
});

return response.output_text;
}