import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key?.trim()) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to .env (or your environment) to use OpenAI-powered features.",
    );
  }
  if (!client) {
    client = new OpenAI({ apiKey: key });
  }
  return client;
}

/** Narrows `chat.completions.create` union (stream vs non-stream) after `stream: false`. */
export type ChatCompletionNonStream = {
  choices: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null;
      refusal?: string | null;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }>;
    };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

export function asNonStreamingChatCompletion(c: unknown): ChatCompletionNonStream {
  return c as ChatCompletionNonStream;
}

/** User-facing message for common setup failures (used by API routes + clients). */
export function userVisibleOpenAIRouteError(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  if (error.message.includes("OPENAI_API_KEY")) {
    return "OpenAI is not configured. Add OPENAI_API_KEY to your .env file in the project root, then restart the dev server.";
  }
  return undefined;
}
