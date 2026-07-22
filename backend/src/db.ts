import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import seed from "../seed.json";

const __dirname = dirname(fileURLToPath(import.meta.url));

// On serverless (Vercel) only /tmp is writable; locally use ./data.
const DATA_DIR = process.env.VERCEL ? "/tmp" : join(__dirname, "..", "data");
const DB_PATH = join(DATA_DIR, "reports.json");

/**
 * A civic report. The full `summary` text lives here off-chain; only its
 * `summaryHash` is committed on-chain (integrity + cost). The dashboard joins
 * on-chain records back to this text by `summaryHash`.
 */
export interface StoredReport {
  summaryHash: string; // hex, SHA-256 of `summary`
  reporter: string; // base58 wallet address
  category: string;
  location: string;
  summary: string; // full off-chain report text
  reportPda: string; // base58 PDA address of the on-chain ReportRecord
  signature?: string; // devnet tx signature, set after confirmation
  createdAt: number; // ms epoch (server-side, when the tx was built)
}

// Bundled demo seed — always available (read-only), even on ephemeral hosts.
const SEED = seed as Record<string, StoredReport>;

function loadMutable(): Record<string, StoredReport> {
  if (!existsSync(DB_PATH)) return {};
  try {
    return JSON.parse(readFileSync(DB_PATH, "utf8")) as Record<string, StoredReport>;
  } catch {
    return {};
  }
}

// Seed first, then the mutable store overrides/extends it.
function load(): Record<string, StoredReport> {
  return { ...SEED, ...loadMutable() };
}

function persist(mutable: Record<string, StoredReport>): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(DB_PATH, JSON.stringify(mutable, null, 2));
  } catch (err) {
    // Read-only FS (some serverless tiers) — keep serving from memory/seed.
    console.warn("report store not persisted:", (err as Error)?.message);
  }
}

export const db = {
  all(): StoredReport[] {
    return Object.values(load());
  },
  get(hash: string): StoredReport | undefined {
    return load()[hash];
  },
  put(report: StoredReport): void {
    const mutable = loadMutable();
    // Keep the first stored copy for a given hash (the on-chain record is
    // immutable anyway); never overwrite the original summary text.
    if (!mutable[report.summaryHash] && !SEED[report.summaryHash]) {
      mutable[report.summaryHash] = report;
      persist(mutable);
    }
  },
  setSignature(hash: string, signature: string): void {
    const mutable = loadMutable();
    if (mutable[hash]) {
      mutable[hash].signature = signature;
      persist(mutable);
    }
  },
};
