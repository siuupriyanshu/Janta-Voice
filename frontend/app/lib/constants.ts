export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
export const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";
export const CLUSTER = process.env.NEXT_PUBLIC_CLUSTER || "devnet";

export function explorerTx(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`;
}
export function explorerAddress(addr: string): string {
  return `https://explorer.solana.com/address/${addr}?cluster=${CLUSTER}`;
}

export const CATEGORY_LABEL: Record<string, string> = {
  road: "🛣️ Road",
  water: "🚰 Water",
  electricity: "💡 Electricity",
  corruption: "⚖️ Corruption",
  other: "📌 Other",
};
