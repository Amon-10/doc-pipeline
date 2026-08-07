import OpenAI from "openai";
const client = new OpenAI();

export async function summarizeChunk(chunk: string) : Promise<string>{
const response = await client.responses.create({
  model: "gpt-5.4-mini",
  input: `Provide a summary for the following text: ${chunk}`,
});

return response.output_text;
}