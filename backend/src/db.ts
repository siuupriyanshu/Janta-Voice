import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "..", "data", "reports.json");

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

function load(): Record<string, StoredReport> {
  if (!existsSync(DB_PATH)) return {};
  try {
    return JSON.parse(readFileSync(DB_PATH, "utf8")) as Record<string, StoredReport>;
  } catch {
    return {};
  }
}

function persist(data: Record<string, StoredReport>): void {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

export const db = {
  all(): StoredReport[] {
    return Object.values(load());
  },
  get(hash: string): StoredReport | undefined {
    return load()[hash];
  },
  put(report: StoredReport): void {
    const data = load();
    // Keep the first stored copy for a given hash (the on-chain record is
    // immutable anyway); never overwrite the original summary text.
    if (!data[report.summaryHash]) {
      data[report.summaryHash] = report;
      persist(data);
    }
  },
  setSignature(hash: string, signature: string): void {
    const data = load();
    if (data[hash]) {
      data[hash].signature = signature;
      persist(data);
    }
  },
};
