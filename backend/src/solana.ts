import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { Connection, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { RPC_URL } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// The Anchor IDL (new format, includes `address`).
const idl = JSON.parse(readFileSync(join(__dirname, "idl", "janta_voice.json"), "utf8"));

export const PROGRAM_ID = new PublicKey(idl.address);
export const connection = new Connection(RPC_URL, "confirmed");

// Read-only provider: this wallet never signs. The frontend wallet signs the
// unsigned transaction we return, so we only need a placeholder here.
const readOnlyWallet = {
  publicKey: PublicKey.default,
  signTransaction: async <T>(tx: T): Promise<T> => tx,
  signAllTransactions: async <T>(txs: T[]): Promise<T[]> => txs,
};
const provider = new anchor.AnchorProvider(connection, readOnlyWallet as anchor.Wallet, {
  commitment: "confirmed",
});
export const program = new anchor.Program(idl as anchor.Idl, provider);

/** SHA-256 of the full summary text → 32 raw bytes. */
export function sha256(input: string): Buffer {
  return createHash("sha256").update(input, "utf8").digest();
}

/** Derive the ReportRecord PDA for (reporter, summaryHash). */
export function deriveReportPda(reporter: PublicKey, summaryHash: Buffer): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("report"), reporter.toBuffer(), summaryHash],
    PROGRAM_ID,
  )[0];
}

/**
 * Build an UNSIGNED submit_report transaction the frontend wallet can sign.
 * We set the reporter as fee payer and attach a fresh devnet blockhash.
 */
export async function buildSubmitReportTx(params: {
  reporter: PublicKey;
  category: string;
  location: string;
  summaryHash: Buffer;
}): Promise<{ transactionBase64: string; reportPda: PublicKey; blockhash: string }> {
  const { reporter, category, location, summaryHash } = params;
  const reportPda = deriveReportPda(reporter, summaryHash);

  const ix = await program.methods
    .submitReport(category, location, Array.from(summaryHash))
    .accountsPartial({
      reporter,
      report: reportPda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction();
  tx.feePayer = reporter;
  tx.recentBlockhash = blockhash;
  tx.add(ix);

  const transactionBase64 = tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString("base64");

  return { transactionBase64, reportPda, blockhash };
}
