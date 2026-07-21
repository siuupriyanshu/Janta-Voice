import express from "express";
import cors from "cors";
import { PublicKey } from "@solana/web3.js";
import {
  PORT,
  CLUSTER,
  CATEGORIES,
  MAX_CATEGORY_LEN,
  MAX_LOCATION_LEN,
} from "./config.js";
import { db, type StoredReport } from "./db.js";
import { PROGRAM_ID, sha256, buildSubmitReportTx } from "./solana.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, cluster: CLUSTER, programId: PROGRAM_ID.toBase58() });
});

/**
 * POST /api/reports/build
 * Body: { reporter, category, location, summary }
 * Hashes the summary, stores the full text off-chain, and returns an UNSIGNED
 * submit_report transaction (base64) for the frontend wallet to sign.
 */
app.post("/api/reports/build", async (req, res) => {
  try {
    const { reporter, category, location, summary } = req.body ?? {};

    let reporterPk: PublicKey;
    try {
      reporterPk = new PublicKey(reporter);
    } catch {
      return res.status(400).json({ error: "reporter must be a valid base58 pubkey" });
    }

    if (typeof category !== "string" || !CATEGORIES.includes(category as never)) {
      return res
        .status(400)
        .json({ error: `category must be one of: ${CATEGORIES.join(", ")}` });
    }
    if (Buffer.byteLength(category, "utf8") > MAX_CATEGORY_LEN) {
      return res.status(400).json({ error: `category exceeds ${MAX_CATEGORY_LEN} bytes` });
    }
    if (typeof location !== "string" || location.trim().length === 0) {
      return res.status(400).json({ error: "location is required" });
    }
    if (Buffer.byteLength(location, "utf8") > MAX_LOCATION_LEN) {
      return res.status(400).json({ error: `location exceeds ${MAX_LOCATION_LEN} bytes` });
    }
    if (typeof summary !== "string" || summary.trim().length === 0) {
      return res.status(400).json({ error: "summary is required" });
    }

    const summaryHash = sha256(summary);
    const summaryHashHex = summaryHash.toString("hex");

    const { transactionBase64, reportPda, blockhash } = await buildSubmitReportTx({
      reporter: reporterPk,
      category,
      location,
      summaryHash,
    });

    const record: StoredReport = {
      summaryHash: summaryHashHex,
      reporter: reporterPk.toBase58(),
      category,
      location,
      summary,
      reportPda: reportPda.toBase58(),
      createdAt: Date.now(),
    };
    db.put(record);

    return res.json({
      transaction: transactionBase64,
      summaryHash: summaryHashHex,
      reportPda: reportPda.toBase58(),
      programId: PROGRAM_ID.toBase58(),
      blockhash,
    });
  } catch (err) {
    console.error("build error:", err);
    return res.status(500).json({ error: (err as Error)?.message ?? "internal error" });
  }
});

/**
 * POST /api/reports/:hash/confirm
 * Body: { signature }
 * Attaches the confirmed devnet tx signature to a stored report (for Explorer links).
 */
app.post("/api/reports/:hash/confirm", (req, res) => {
  const { hash } = req.params;
  const { signature } = req.body ?? {};
  if (typeof signature !== "string" || signature.length === 0) {
    return res.status(400).json({ error: "signature is required" });
  }
  if (!db.get(hash)) {
    return res.status(404).json({ error: "unknown report hash" });
  }
  db.setSignature(hash, signature);
  return res.json({ ok: true });
});

/** Dashboard helpers: resolve on-chain summary hashes back to full off-chain text. */
app.get("/api/reports", (_req, res) => {
  res.json(db.all());
});
app.get("/api/reports/:hash", (req, res) => {
  const report = db.get(req.params.hash);
  if (!report) return res.status(404).json({ error: "not found" });
  return res.json(report);
});

app.listen(PORT, () => {
  console.log(
    `Janta Voice backend listening on :${PORT} (${CLUSTER}, program ${PROGRAM_ID.toBase58()})`,
  );
});
