import "dotenv/config";

export const PORT = Number(process.env.PORT ?? 4000);
export const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
export const CLUSTER = process.env.CLUSTER ?? "devnet";

/** Closed set of civic complaint categories (must match the LLM classifier). */
export const CATEGORIES = ["road", "water", "electricity", "corruption", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

/** On-chain string byte limits (must match the Anchor program's #[max_len]). */
export const MAX_CATEGORY_LEN = 32;
export const MAX_LOCATION_LEN = 64;
