"use client";

import { useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import {
  BACKEND_URL,
  CATEGORY_LABEL,
  explorerAddress,
  explorerTx,
} from "./lib/constants";

interface UiMessage {
  role: "user" | "assistant";
  content: string;
}

interface PendingTransaction {
  transaction: string; // base64 unsigned tx
  summaryHash: string;
  reportPda: string;
  programId: string;
  blockhash: string;
  category: string;
  location: string;
  summary: string;
}

type SignState = "idle" | "signing" | "confirming" | "done" | "error";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const GREETING: UiMessage = {
  role: "assistant",
  content:
    "नमस्ते! Describe a civic problem in your area — a broken road, water outage, power cut, corruption, or another service failure. What is happening, and where (ward / municipality)?",
};

export default function Chat() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  const [messages, setMessages] = useState<UiMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<PendingTransaction | null>(null);
  const [signState, setSignState] = useState<SignState>("idle");
  const [txSig, setTxSig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading, pending]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    const next: UiMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          reporter: publicKey?.toBase58(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat request failed");
      setMessages([
        ...next,
        { role: "assistant", content: data.reply || "" },
      ]);
      if (data.pendingTransaction) {
        setPending(data.pendingTransaction);
        setSignState("idle");
        setTxSig(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setError(msg);
      setMessages([
        ...next,
        {
          role: "assistant",
          content: "⚠️ I could not reach the service. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function confirmAndSign() {
    if (!pending) return;
    if (!publicKey) {
      setError("Connect your wallet first, then sign.");
      return;
    }
    setError(null);
    try {
      setSignState("signing");
      const tx = Transaction.from(base64ToBytes(pending.transaction));
      // Refresh the blockhash so a slow review doesn't expire the transaction.
      const latest = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = latest.blockhash;
      tx.feePayer = publicKey;

      const sig = await sendTransaction(tx, connection);
      setSignState("confirming");
      await connection.confirmTransaction(
        {
          signature: sig,
          blockhash: latest.blockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight,
        },
        "confirmed",
      );

      // Best-effort: attach the signature to the off-chain record.
      fetch(`${BACKEND_URL}/api/reports/${pending.summaryHash}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature: sig }),
      }).catch(() => {});

      setTxSig(sig);
      setSignState("done");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSignState("error");
      if (/already in use|already been processed|0x0\b/i.test(msg)) {
        setError(
          "This exact report was already filed from your wallet. v1 anti-spam allows one report per wallet per issue — change the details to file a different report.",
        );
      } else {
        setError(msg);
      }
    }
  }

  function reset() {
    setPending(null);
    setTxSig(null);
    setSignState("idle");
    setError(null);
  }

  return (
    <div className="chat">
      <div className="messages" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.content}
          </div>
        ))}
        {loading && <div className="bubble assistant typing">…</div>}

        {pending && (
          <div className="confirm-card">
            <div className="confirm-head">Review &amp; sign your report</div>
            <dl className="confirm-details">
              <div>
                <dt>Category</dt>
                <dd>{CATEGORY_LABEL[pending.category] ?? pending.category}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{pending.location}</dd>
              </div>
              <div>
                <dt>Summary</dt>
                <dd>{pending.summary}</dd>
              </div>
              <div>
                <dt>On-chain record</dt>
                <dd>
                  <a
                    href={explorerAddress(pending.reportPda)}
                    target="_blank"
                    rel="noreferrer"
                    className="mono"
                  >
                    {pending.reportPda.slice(0, 8)}…{pending.reportPda.slice(-8)}
                  </a>
                </dd>
              </div>
            </dl>

            {signState === "done" && txSig ? (
              <div className="confirm-success">
                ✅ Recorded on devnet.{" "}
                <a href={explorerTx(txSig)} target="_blank" rel="noreferrer">
                  View transaction on Explorer
                </a>
                <button className="btn ghost" onClick={reset}>
                  File another report
                </button>
              </div>
            ) : (
              <div className="confirm-actions">
                <button
                  className="btn primary"
                  onClick={confirmAndSign}
                  disabled={
                    !connected ||
                    signState === "signing" ||
                    signState === "confirming"
                  }
                >
                  {signState === "signing"
                    ? "Sign in wallet…"
                    : signState === "confirming"
                      ? "Confirming on devnet…"
                      : connected
                        ? "Confirm & sign on devnet"
                        : "Connect wallet to sign"}
                </button>
                <button className="btn ghost" onClick={reset}>
                  Discard
                </button>
              </div>
            )}
          </div>
        )}

        {error && <div className="error">{error}</div>}
      </div>

      <div className="composer">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={
            connected
              ? "Describe the problem and where it is…"
              : "You can chat now; connect your wallet before signing."
          }
          rows={2}
        />
        <button className="btn primary" onClick={send} disabled={loading}>
          Send
        </button>
      </div>
    </div>
  );
}
