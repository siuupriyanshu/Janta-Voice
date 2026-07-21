"use client";

import { useEffect, useMemo, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import idl from "./lib/idl/janta_voice.json";
import {
  RPC_URL,
  BACKEND_URL,
  CATEGORY_LABEL,
  explorerAddress,
  explorerTx,
} from "./lib/constants";

interface Report {
  pda: string;
  reporter: string;
  category: string;
  location: string;
  summaryHash: string;
  timestamp: number;
  summary?: string; // off-chain
  signature?: string; // off-chain
}

const CATEGORIES = ["road", "water", "electricity", "corruption", "other"];

function bytesToHex(arr: number[]): string {
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Read-only wallet — the dashboard never signs, only reads program accounts.
const readOnlyWallet = {
  publicKey: PublicKey.default,
  signTransaction: async <T,>(t: T) => t,
  signAllTransactions: async <T,>(t: T[]) => t,
};

export default function Dashboard() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const connection = new Connection(RPC_URL, "confirmed");
      const provider = new AnchorProvider(connection, readOnlyWallet as never, {
        commitment: "confirmed",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const program = new Program(idl as any, provider);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onchain = await (program.account as any).reportRecord.all();

      // Off-chain: full summary text + tx signature, keyed by summary hash.
      const offchain: Record<string, { summary?: string; signature?: string }> = {};
      try {
        const res = await fetch(`${BACKEND_URL}/api/reports`);
        if (res.ok) {
          const arr: Array<{ summaryHash: string; summary?: string; signature?: string }> =
            await res.json();
          for (const r of arr) {
            offchain[r.summaryHash] = { summary: r.summary, signature: r.signature };
          }
        }
      } catch {
        // backend may be offline; on-chain data still renders.
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const merged: Report[] = onchain.map((x: any) => {
        const hash = bytesToHex(x.account.summaryHash as number[]);
        const off = offchain[hash] ?? {};
        return {
          pda: x.publicKey.toBase58(),
          reporter: x.account.reporter.toBase58(),
          category: x.account.category as string,
          location: x.account.location as string,
          summaryHash: hash,
          timestamp: Number(x.account.timestamp),
          summary: off.summary,
          signature: off.signature,
        };
      });
      merged.sort((a, b) => b.timestamp - a.timestamp);
      setReports(merged);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of CATEGORIES) counts[c] = 0;
    for (const r of reports ?? []) counts[r.category] = (counts[r.category] ?? 0) + 1;
    return counts;
  }, [reports]);

  const byLocation = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of reports ?? []) counts[r.location] = (counts[r.location] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [reports]);

  return (
    <div className="page">
      <section className="intro">
        <div className="dash-head">
          <h1>Public report dashboard</h1>
          <button className="btn ghost" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "↻ Refresh"}
          </button>
        </div>
        <p>
          Every report below is read live from the Janta Voice program on Solana
          devnet. The full text is stored off-chain against the on-chain{" "}
          <code>summary_hash</code>.
        </p>
      </section>

      {error && <div className="error">Could not read the program: {error}</div>}

      {/* Category aggregation grid */}
      <div className="cat-grid">
        {CATEGORIES.map((c) => (
          <div key={c} className="cat-tile">
            <div className="cat-count">{byCategory[c] ?? 0}</div>
            <div className="cat-name">{CATEGORY_LABEL[c] ?? c}</div>
          </div>
        ))}
      </div>

      {byLocation.length > 0 && (
        <div className="loc-row">
          <span className="loc-label">By location:</span>
          {byLocation.map(([loc, n]) => (
            <span key={loc} className="loc-chip">
              {loc} · {n}
            </span>
          ))}
        </div>
      )}

      {/* Report list */}
      {loading && !reports ? (
        <p className="muted">Reading program accounts…</p>
      ) : reports && reports.length === 0 ? (
        <p className="muted">
          No reports on-chain yet. File the first one from the{" "}
          <a href="/">Report</a> page.
        </p>
      ) : (
        <ul className="report-list">
          {(reports ?? []).map((r) => (
            <li key={r.pda} className="report-card">
              <div className="report-top">
                <span className="report-cat">
                  {CATEGORY_LABEL[r.category] ?? r.category}
                </span>
                <span className="report-loc">{r.location}</span>
                <span className="report-time">
                  {r.timestamp
                    ? new Date(r.timestamp * 1000).toLocaleString()
                    : ""}
                </span>
              </div>
              <div className="report-summary">
                {r.summary ?? (
                  <span className="muted">
                    Summary stored off-chain (hash {r.summaryHash.slice(0, 12)}…)
                  </span>
                )}
              </div>
              <div className="report-links">
                <a
                  href={explorerAddress(r.pda)}
                  target="_blank"
                  rel="noreferrer"
                >
                  On-chain record ↗
                </a>
                {r.signature && (
                  <a
                    href={explorerTx(r.signature)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Transaction ↗
                  </a>
                )}
                <span className="report-reporter mono">
                  by {r.reporter.slice(0, 4)}…{r.reporter.slice(-4)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
