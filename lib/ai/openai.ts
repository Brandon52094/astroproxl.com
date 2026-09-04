type OpenAITextRequest = {
  system: string;
  prompt: string;
  maxTokens?: number;
};

export async function generateOpenAIText({
  system,
  prompt,
  maxTokens = 8000, // ── EDIT: Raised default ceiling
}: OpenAITextRequest): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-5.6-terra",
      instructions: system,
      input: prompt,
      max_output_tokens: maxTokens,
      // ── EDIT: Reasoning knobs ──
      reasoning: { effort: "medium" },
      text: { verbosity: "high" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[openai] Luna API error:", errorText);
    throw new Error(
      `OpenAI request failed with status ${response.status}.`
    );
  }

  const data = await response.json();

  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const text = data.output
    ?.flatMap((item: any) => item.content ?? [])
    ?.filter((item: any) => item.type === "output_text")
    ?.map((item: any) => item.text)
    ?.join("");

  if (!text?.trim()) {
    throw new Error("Luna returned no text.");
  }

  return text.trim();
}