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
export async function summarizeChunk(chunk: string) : Promise<string> {
    const response = await client.responses.create({
        model: "gpt-5.4-mini",
        input: `Provide a concise summary for the following text: ${chunk}`,
    });

    return response.output_text;
};

/**
 * Combines multiple chunk summaries into one coherent final summary.
 * @param combinedText - all chunk summaries joined together
 * @returns one unified summary reading as a single coherent piece
 */
export async function mergeSummaries(combinedText: string) : Promise<string>{
    const response = await client.responses.create({
        model: "gpt-5.4-mini",
        input: `The following are summaries of different sections of the same document. Combine them into one single, coherent summary that reads naturally: ${combinedText}`,
    });

    return response.output_text;
};