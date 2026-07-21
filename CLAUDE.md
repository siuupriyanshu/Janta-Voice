# Janta Voice — Build Plan for Claude Code

**Event:** Superteam Nepal Mini Hack
**Deadline:** ~26 hours from project start

This file is the single source of truth for what to build. Follow it in order. Do not
expand scope beyond what's written here — the timeframe is short and every extra feature
is a risk to finishing at all.

---

## 1. What we're building

**Janta Voice**: a chat-based AI agent where citizens file hyperlocal civic complaints
(broken road, water outage, corruption, service failure) in plain Nepali/English text.
The agent classifies and summarizes the report, then commits an immutable record to a
Solana program. A public dashboard aggregates all reports by category and location.

**Positioning (must appear in the project README, see Section 9):**
Janta Voice is a **complementary layer to [Janamat](https://janamat.app/)**, Superteam
Nepal's civic-sentiment platform (Solana + ZK proofs, founded by Ronak / Superteam Nepal).
Janamat operates at the sentiment/voting/public-square layer. Janta Voice operates one
layer below: hyperlocal grievance intake and transparent aggregation — data that could
eventually feed into or interoperate with a platform like Janamat.
**Do not claim to replace or compete with Janamat.** Do not claim ZK-based anonymity is
implemented — it is explicitly future work (see Section 6).

## 2. Why this scope (do not expand it)

- Full zkID/zkPassport-style anonymity is not achievable safely in this timeframe — real
  ZK circuit work takes far longer than a single hack day. We are not attempting it.
  Anti-spam in v1 is a simple on-chain PDA-per-wallet-per-issue constraint, described
  honestly as v1, with ZK anonymity named as the acknowledged next step.
- No token transfers, no escrow, no staking, no multi-tenant anything, no message queue,
  no auth system beyond wallet connect. If it's not in this file, don't build it.

## 3. Reference material (consult these before writing code)

1. Janamat (the project we're positioning alongside): https://janamat.app/
2. Anchor Book (program structure, accounts, PDAs, instructions):
   https://www.anchor-lang.com/docs
3. Solana web3.js docs (connection, transactions, sending/confirming):
   https://solana-labs.github.io/solana-web3.js/
4. Using `@coral-xyz/anchor` from a frontend (IDL-driven client calls):
   https://www.anchor-lang.com/docs/clients/typescript

Anchor and web3.js versions drift; if `anchor init` scaffolds something that doesn't match
the Book's current syntax, trust the installed CLI's generated scaffold and adjust rather
than fighting version mismatches — a working devnet deploy matters more than matching docs
exactly.

## 4. Architecture

```
Citizen (chat UI, web)
        │  free text report
        ▼
AI Agent (tool-calling LLM)
   tool: file_civic_report(category, location, summary)
        │  classified + summarized report
        ▼
Backend (thin Express/Node service)
   - builds unsigned Solana transaction
   - calls Anchor program instruction: submit_report
        ▼
Wallet (Phantom, devnet) — citizen signs
        ▼
Solana devnet — Anchor program stores report record (PDA)
        │
        ▼
Public dashboard (Next.js) — reads program accounts,
aggregates by category/location, renders list + simple grid
```

## 5. Anchor program spec — `janta_voice`

One instruction, one account type, one constraint. Nothing else.

**Account: `ReportRecord` (PDA)**
- `seeds = [b"report", wallet.key(), issue_hash]` — one record per wallet per issue-hash.
  This IS the anti-spam mechanism (a wallet can't file the identical report twice, but can
  file different reports).
- Fields:
  - `reporter: Pubkey`
  - `category: String` (max ~32 bytes — road, water, electricity, corruption, other)
  - `location: String` (max ~64 bytes — free text, e.g. ward/municipality name)
  - `summary_hash: [u8; 32]` (hash of the full AI-generated summary; full text stored
    off-chain in a database, only the hash goes on-chain for integrity + cost reasons)
  - `timestamp: i64`

**Instruction: `submit_report(category: String, location: String, summary_hash: [u8; 32])`**
- Creates the PDA above. Fails with a clear Anchor error if it already exists for that
  wallet+hash combination — this failure IS the anti-spam behavior, not a bug.

**Stretch goal only, not required:** `upvote_report` (increment a counter, one upvote per
wallet via a second PDA). Do not attempt this until everything in Section 9's build order
is done and working.

## 6. Anti-spam / anonymity note (this exact framing must appear in the README)

> v1 uses wallet-based PDA constraints for basic anti-spam (one report per wallet per
> issue). This means reports are pseudonymous (tied to a wallet address) but not
> anonymous. A natural next milestone — inspired by Janamat's use of ZK proofs — is
> adding a ZK-based nullifier so citizens can report without linking reports to a
> persistent identity, while still preventing duplicate/spam submissions. This is future
> work, not implemented in this prototype.

## 7. AI agent / tool integration

- Build a single tool-calling LLM integration with one tool: `file_civic_report`.
  - Input extracted from free-text chat: `category`, `location`, `summary`.
  - Categories: a fixed small set (road, water, electricity, corruption, other) so the
    LLM classifies into a closed set rather than free-form category strings.
  - On tool call: hash the summary, call the backend endpoint that builds and returns
    the Solana transaction for the frontend/wallet to sign.
- Keep the backend minimal for this hackathon: a single table (or even a JSON file) to
  store full report text against its hash. No background job queue, no multi-tenant
  schema — none of that is needed for a single-purpose demo.

## 8. Frontend

- Next.js + `@solana/wallet-adapter-react`, Phantom on devnet.
- Two views:
  1. **Chat view** — text input, agent conversation, a "confirm & sign" step before the
     transaction is submitted.
  2. **Dashboard view** — public list/grid of reports pulled from program accounts via
     `@coral-xyz/anchor`, grouped by category and location, each entry linking to its
     transaction on Solana Explorer (devnet).
- No auth beyond wallet connect. No native mobile app — a responsive web page is enough
  to satisfy the "mobile" suggested track.

## 9. Build order (do not reorder — each step should produce something runnable)

1. `anchor init janta-voice` → scaffold, adjust to the spec in Section 5.
2. `anchor build && anchor deploy` to devnet as soon as it compiles — get a program ID
   on devnet early, before every field is final.
3. Write an Anchor test for `submit_report` (happy path + duplicate-rejection path).
4. Build the backend endpoint that constructs the unsigned transaction.
5. Wire the AI tool (`file_civic_report`) to call that endpoint.
6. Build the chat UI, connect wallet, sign, confirm on devnet.
7. Build the dashboard view reading program accounts.
8. Deploy the frontend (Vercel).
9. Write the project README — **as a separate file, `README.md`, written for someone who
   has never seen this project before, including the author.** It must plainly explain,
   in order: what problem this solves, how the chat-to-blockchain flow works end to end,
   why the Anchor program is structured this way, the anti-spam/anonymity note from
   Section 6, the Janamat positioning from Section 1, how to run it locally, the devnet
   program ID, and the live link. Do not assume the reader already understands the
   architecture — spell it out.
10. Record a ≤3 minute demo video: problem → chat filing a report → on-chain confirmation
    on Explorer → dashboard aggregation → 15 seconds on the Janamat-complementary vision.

## 10. Submission checklist

- [ ] Public GitHub repo with `README.md` (per Section 9, item 9)
- [ ] Program deployed and working on Solana devnet, program ID in README
- [ ] Live frontend link
- [ ] Demo video ≤3 min, posted on Loom/YouTube, linked in README
- [ ] Shared on X/LinkedIn ("build in public" requirement)
- [ ] README explicitly and accurately positions the project relative to Janamat
      (complementary, not competing; anonymity is future work, not implemented)
