import "dotenv/config";

export const PORT = Number(process.env.PORT ?? 4000);
export const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
export const CLUSTER = process.env.CLUSTER ?? "devnet";

/** OpenRouter (OpenAI-compatible) config for the tool-calling chat agent. */
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
export const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
/** Any tool-calling-capable OpenRouter model, e.g. anthropic/claude-3.5-sonnet. */
export const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

/** Closed set of civic complaint categories (must match the LLM classifier). */
export const CATEGORIES = ["road", "water", "electricity", "corruption", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

/** On-chain string byte limits (must match the Anchor program's #[max_len]). */
export const MAX_CATEGORY_LEN = 32;
export const MAX_LOCATION_LEN = 64;
