# Janta Voice

**A chat-based AI agent for filing hyperlocal civic complaints, committed immutably to Solana.**

Citizens describe a local problem — a broken road, a water outage, a power cut, corruption, a service failure — in plain Nepali or English. An AI agent classifies and summarizes the report, and the citizen signs a transaction that writes a permanent, tamper-evident record to a Solana program. A public dashboard aggregates every report by category and location.

> **Positioning:** Janta Voice is a **complementary layer to [Janamat](https://janamat.app/)**, Superteam Nepal's civic-sentiment platform (Solana + ZK proofs). Janamat operates at the sentiment / voting / public-square layer. Janta Voice operates one layer below: **hyperlocal grievance intake and transparent aggregation** — data that could eventually feed into or interoperate with a platform like Janamat. Janta Voice does **not** replace or compete with Janamat.

Built for the **Superteam Nepal Mini Hack**.

- **Network:** Solana **devnet**
- **Program ID:** `AxR7Xwhi2MkBUMDZweEd7pVozPcYCwPzviou7WGGhWJk` — [view on Solana Explorer](https://explorer.solana.com/address/AxR7Xwhi2MkBUMDZweEd7pVozPcYCwPzviou7WGGhWJk?cluster=devnet)
- **Live demo:** **https://jantavoicesol.vercel.app** _(frontend + backend both hosted on Vercel; the AI reply can take ~20–30s on the free-tier model)_
- **Demo video:** _coming soon_ — <!-- TODO: paste Loom/YouTube link here -->

---

## 1. What problem does this solve?

In many municipalities, filing a civic complaint means a phone call, a paper form, or a message that disappears into an inbox. There is no public, durable record that a complaint was made, no easy way to see how many people are reporting the same broken road, and no guarantee the record won't quietly vanish.

Janta Voice makes civic grievance intake:

- **Easy** — you just chat. No forms, no fixed vocabulary. The AI figures out the category and writes a clean summary for you, in Nepali or English.
- **Durable & tamper-evident** — the report is written to a Solana program account. It can't be silently deleted or edited after the fact.
- **Transparent & aggregable** — anyone can open the dashboard and see all reports grouped by category and location, each one traceable to its on-chain transaction.

This is a **prototype**, built in a single hack window. It deliberately keeps a very small scope (see [Design decisions](#7-design-decisions-scope) below).

---

## 2. How it works — the chat-to-blockchain flow, end to end

Here is the full journey of a single report, from a sentence typed by a citizen to a record on Solana:

```
Citizen (chat UI, web)
        │  free-text report, e.g. "there's a huge pothole in Ward 5, Kathmandu"
        ▼
AI Agent (tool-calling LLM, via OpenRouter)
   one tool: file_civic_report(category, location, summary)
        │  the model classifies into a fixed category set + writes a summary,
        │  then calls the tool
        ▼
Backend (thin Node/Express service)
   - hashes the AI summary (SHA-256) → summary_hash
   - stores the FULL summary text off-chain (a JSON file), keyed by that hash
   - builds an UNSIGNED Solana transaction for the submit_report instruction
        │  returns { unsigned transaction, summary_hash, report PDA }
        ▼
Wallet (Phantom, devnet) — the citizen reviews and signs
        ▼
Solana devnet — the janta_voice program stores a ReportRecord (a PDA account)
        │  reporter, category, location, summary_hash, timestamp
        ▼
Public dashboard (Next.js) — reads all program accounts via @coral-xyz/anchor,
joins each on-chain hash back to its off-chain summary text, aggregates by
category & location, and links every report to Solana Explorer.
```

**Why only a hash goes on-chain.** Storing long free text on-chain is expensive (you pay rent per byte) and unnecessary for integrity. Instead we store a **SHA-256 hash** of the AI summary on-chain, and keep the full text off-chain in a small database. Anyone can re-hash the off-chain text and check it matches the on-chain hash — so the record is verifiable without paying to store every character on-chain.

**Who signs.** The backend never holds a private key and never signs anything. It only *builds* the transaction. The citizen's own wallet (Phantom) signs it. This "backend builds, wallet signs" split is standard, safe Solana dApp architecture.

---

## 3. The AI agent

The agent is a single **tool-calling LLM** with exactly **one tool**: `file_civic_report(category, location, summary)`.

- **Categories are a closed set** — `road`, `water`, `electricity`, `corruption`, `other`. The model must classify each complaint into one of these, rather than inventing free-form category strings. This keeps the dashboard's aggregation meaningful.
- The model gathers three things from the conversation — the **category**, a **location** (ward / municipality), and a concise **summary** — asking a brief clarifying question if something is missing. Once it has all three, it calls the tool.
- The tool handler hashes the summary and calls the backend endpoint that builds the unsigned Solana transaction, which is returned to the frontend for the wallet to sign.

The LLM is accessed through **[OpenRouter](https://openrouter.ai/)** (an OpenAI-compatible gateway), so the model is configurable via one environment variable — any tool-calling-capable model works.

---

## 4. The Solana program — `janta_voice`

The on-chain program is intentionally tiny: **one account type, one instruction, one constraint.** Written with [Anchor](https://www.anchor-lang.com/).

### Account: `ReportRecord` (a PDA)

A **PDA** (Program Derived Address) is an account whose address is deterministically derived from a set of seeds plus the program ID — it has no private key; only the program can write to it.

`ReportRecord` is derived from these seeds:

```
seeds = [ b"report", reporter_wallet.key(), summary_hash ]
```

Fields stored on-chain:

| Field          | Type        | Notes                                                        |
| -------------- | ----------- | ------------------------------------------------------------ |
| `reporter`     | `Pubkey`    | the wallet that filed the report                             |
| `category`     | `String`    | max ~32 bytes — one of the closed category set               |
| `location`     | `String`    | max ~64 bytes — free text, e.g. ward / municipality name     |
| `summary_hash` | `[u8; 32]`  | SHA-256 of the full AI summary (full text lives off-chain)   |
| `timestamp`    | `i64`       | Unix time the record was committed on-chain                  |

### Instruction: `submit_report(category, location, summary_hash)`

Creates the `ReportRecord` PDA above.

### Why this structure — and why the "duplicate fails" behavior is a feature

Because the PDA's address includes both the **reporter's wallet** and the **summary hash**, there can only ever be **one** account for a given `(wallet, summary_hash)` pair. If a wallet tries to file the **identical** report twice, the second `submit_report` fails — the account already exists.

**That failure is the intended anti-spam mechanism, not a bug.** A wallet can file as many *different* reports as it likes (different text → different hash → different PDA), but it cannot spam the exact same report over and over. Everything else about the program's shape follows from keeping this one constraint simple and honest.

---

## 5. Anti-spam & anonymity — read this carefully

> v1 uses wallet-based PDA constraints for basic anti-spam (one report per wallet per issue). This means reports are pseudonymous (tied to a wallet address) but not anonymous. A natural next milestone — inspired by Janamat's use of ZK proofs — is adding a ZK-based nullifier so citizens can report without linking reports to a persistent identity, while still preventing duplicate/spam submissions. This is future work, not implemented in this prototype.

To be explicit: **Janta Voice does not implement zero-knowledge anonymity.** Reports are tied to a wallet address (pseudonymous). ZK-based anonymity is named here as the acknowledged next step, and is not part of this prototype.

---

## 6. Relationship to Janamat

[**Janamat**](https://janamat.app/) is Superteam Nepal's civic-sentiment platform, using Solana and ZK proofs, operating at the **sentiment / voting / public-square** layer.

**Janta Voice operates one layer below** — hyperlocal grievance *intake* and transparent *aggregation*. The two are **complementary, not competing**: the structured, on-chain grievance data Janta Voice produces is exactly the kind of input that could eventually feed into or interoperate with a platform like Janamat. Janta Voice does **not** aim to replace Janamat, and does not claim Janamat's ZK-anonymity properties.

---

## 7. Design decisions (scope)

This is a hack-window prototype. It intentionally does **not** include: token transfers, escrow, staking, any multi-tenant machinery, a message queue, or any auth beyond wallet-connect. The off-chain store is a single JSON file, not a database cluster. Full zkID / zkPassport-style anonymity is explicitly **out of scope** for this timeframe (real ZK circuit work takes far longer than a hack day) and is named as future work above.

**Stretch (not implemented):** an `upvote_report` instruction (one upvote per wallet, via a second PDA) to let citizens corroborate each other's reports.

---

## 8. Tech stack

| Layer      | Choice                                                                 |
| ---------- | --------------------------------------------------------------------- |
| Program    | Rust + **Anchor 1.1.2**, Solana **devnet**                            |
| Program tests | **LiteSVM** (in-process, `cargo test`)                             |
| AI agent   | Tool-calling LLM via **OpenRouter** (OpenAI-compatible), one tool     |
| Backend    | **Node + Express + TypeScript** (`tsx`), `@coral-xyz/anchor`, web3.js |
| Off-chain store | a JSON file mapping `summary_hash → full text`                   |
| Frontend   | **Next.js 14** (App Router), `@solana/wallet-adapter-react`, Phantom  |
| Dashboard reads | `@coral-xyz/anchor` reading program accounts directly           |

---

## 9. Repository layout

```
janta-voice/
├── programs/janta-voice/      # the Anchor program (Rust)
│   ├── src/
│   │   ├── lib.rs             # declare_id! + submit_report entrypoint
│   │   ├── state.rs           # ReportRecord account
│   │   ├── instructions/      # submit_report handler
│   │   ├── constants.rs       # PDA seed + length limits
│   │   └── error.rs
│   └── tests/submit_report.rs # LiteSVM tests (happy path + duplicate rejection)
├── backend/                   # thin Node service: AI agent + tx builder + off-chain store
│   ├── src/
│   │   ├── server.ts          # Express routes (/api/chat, /api/reports/build, ...)
│   │   ├── agent.ts           # OpenRouter tool-calling agent (file_civic_report)
│   │   ├── solana.ts          # builds the unsigned submit_report transaction
│   │   ├── db.ts              # JSON-file off-chain store (summary_hash → text)
│   │   └── idl/               # snapshot of the program IDL
│   └── .env.example
├── frontend/                  # Next.js chat UI + dashboard
│   └── app/
│       ├── Chat.tsx           # chat + "confirm & sign" flow
│       ├── Dashboard.tsx      # reads program accounts, aggregates
│       └── providers.tsx      # wallet-adapter (Phantom, devnet)
├── Anchor.toml
└── README.md                  # you are here
```

---

## 10. Run it locally

### Prerequisites

- **Rust** + **Solana CLI** (`solana --version`, tested with 3.1.x)
- **Anchor** 1.1.2 (via [`avm`](https://www.anchor-lang.com/docs/installation))
- **Node.js** 20+
- **Phantom** wallet browser extension, switched to **Devnet**
- An **[OpenRouter API key](https://openrouter.ai/keys)** for the AI agent

### A. The Solana program (already deployed to devnet)

The program is already live on devnet at the Program ID above, so you can run the backend and frontend against it without deploying anything. To build/test/redeploy it yourself:

```bash
cd janta-voice
anchor build
cargo test -p janta-voice          # LiteSVM tests: happy path + duplicate rejection
# (optional) redeploy to devnet — requires a funded devnet wallet:
solana config set --url https://api.devnet.solana.com
anchor deploy --provider.cluster devnet
```

### B. Backend (AI agent + transaction builder)

```bash
cd janta-voice/backend
cp .env.example .env
# edit .env and set OPENROUTER_API_KEY=sk-or-...
# (OPENROUTER_MODEL defaults to a free, tool-capable model; change it if you like)
npm install
npm start        # listens on http://localhost:4000
```

Key endpoints:

- `POST /api/chat` — the tool-calling agent; returns an assistant reply and, when a report is filed, an **unsigned** `pendingTransaction`.
- `POST /api/reports/build` — builds an unsigned `submit_report` transaction directly.
- `GET  /api/reports` — the off-chain records (used by the dashboard to show full summaries).
- `GET  /health`

### C. Frontend (chat UI + dashboard)

```bash
cd janta-voice/frontend
npm install
npm run dev      # http://localhost:3000
```

The defaults in `.env.local` point the frontend at the local backend (`:4000`) and Solana devnet — no changes needed for local dev.

### D. File a report end to end

1. Open http://localhost:3000, connect **Phantom** (make sure Phantom is set to **Devnet**).
2. **Fund your Phantom wallet** with devnet SOL — the report transaction is paid by *your* wallet. Get some from [faucet.solana.com](https://faucet.solana.com).
3. Describe a problem in the chat (Nepali or English). The agent will summarize and prepare a report.
4. Review the **Confirm & Sign** card, click **Confirm & sign on devnet**, approve in Phantom.
5. Open the **Dashboard** to see your report aggregated, with links to Solana Explorer.

---

## 11. Deployment

Both the frontend and the backend are hosted on **Vercel** (two projects); the Anchor program is on Solana **devnet**.

- **Program:** Solana devnet — Program ID `AxR7Xwhi2MkBUMDZweEd7pVozPcYCwPzviou7WGGhWJk`.
- **Frontend:** Vercel — **https://jantavoicesol.vercel.app**. The three `NEXT_PUBLIC_*` values (`NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_SOLANA_RPC`, `NEXT_PUBLIC_CLUSTER`) are passed as **build-time** env vars, since Next.js inlines them at build.
- **Backend:** Vercel serverless. The Express app is bundled into a single self-contained function with esbuild (see `backend/build.mjs` + `backend/vercel.json`) — bundling everything avoids the `web3.js` → `rpc-websockets` "`require()` of an ESM module" crash you hit when dependencies are left external on a Node-ESM serverless runtime. The function runs with a 60s budget so slow free-model calls complete. Runtime env vars: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `RPC_URL`, `CLUSTER`.
  - The off-chain report store is a JSON file. On serverless it writes to `/tmp` (ephemeral) and is backed by a committed `backend/seed.json`, so the demo reports always resolve to full summaries; reports filed live persist for the life of the warm instance. For durable persistence, swap the JSON store for a small KV/DB.

**To run the backend as a long-lived server instead** (Render / Railway / Fly / a VM): it needs no bundling — just `npm start` (which runs `tsx src/server.ts`), plus the same env vars, and point `NEXT_PUBLIC_BACKEND_URL` at its URL.

---

## 12. Roadmap / future work

- **ZK nullifier for anonymous reporting** — the acknowledged next step (see §5): let citizens report without linking reports to a persistent wallet identity, while still preventing duplicate/spam submissions.
- **`upvote_report`** — one upvote per wallet (second PDA) so citizens can corroborate reports.
- **Richer aggregation** — trends over time, maps, per-ward views.
- **Interoperability** — expose the grievance data in a form a platform like Janamat could consume.

---

## License

Prototype built for the Superteam Nepal Mini Hack. See repository for license terms.
