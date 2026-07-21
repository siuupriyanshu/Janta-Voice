import OpenAI from "openai";
import { PublicKey } from "@solana/web3.js";
import {
  CATEGORIES,
  MAX_CATEGORY_LEN,
  MAX_LOCATION_LEN,
  OPENROUTER_API_KEY,
  OPENROUTER_BASE_URL,
  OPENROUTER_MODEL,
} from "./config.js";
import { db, type StoredReport } from "./db.js";
import { PROGRAM_ID, sha256, buildSubmitReportTx } from "./solana.js";

// Lazy client so the backend still boots (and other routes work) when no key is set.
let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    if (!OPENROUTER_API_KEY) {
      throw new Error(
        "OPENROUTER_API_KEY is not set — the chat agent is unavailable. Add it to backend/.env.",
      );
    }
    _client = new OpenAI({
      apiKey: OPENROUTER_API_KEY,
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: { "X-Title": "Janta Voice" },
    });
  }
  return _client;
}

const SYSTEM_PROMPT = `You are Janta Voice, a civic-complaint intake assistant for citizens in Nepal.
Citizens describe hyperlocal problems (broken roads, water outages, power cuts, corruption, or other
service failures) in plain Nepali or English. Your job is to help them file one clear report.

You must gather three things before filing:
1. category — classify the complaint into EXACTLY ONE of this closed set: road, water, electricity, corruption, other.
2. location — the ward, municipality, or place name (keep it short, under 64 bytes).
3. summary — a concise 1-3 sentence summary of the specific problem.

Behaviour:
- Reply in the same language the citizen uses (Nepali or English). Keep replies short and warm.
- If the category, location, or nature of the problem is unclear, ask ONE brief clarifying question.
- Do not invent details the citizen did not provide. Use "other" only when nothing else fits.
- Once you have all three, call the file_civic_report tool. Do not ask for confirmation before calling it —
  the citizen will review and sign the on-chain transaction in their wallet as the confirmation step.
- After the tool returns, tell the citizen their report is ready and ask them to review the details and
  sign in their wallet to record it on-chain. Never claim it is already recorded — signing happens next.`;

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "file_civic_report",
      description:
        "Prepare a citizen's civic complaint to be committed on-chain. Call this only once you have a category (from the closed set), a location, and a clear 1-3 sentence summary.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [...CATEGORIES],
            description: "The complaint category, classified into the closed set.",
          },
          location: {
            type: "string",
            description: "Ward / municipality / place name. Max 64 bytes.",
          },
          summary: {
            type: "string",
            description: "A concise 1-3 sentence summary of the specific complaint.",
          },
        },
        required: ["category", "location", "summary"],
        additionalProperties: false,
      },
    },
  },
];

export interface PendingTransaction {
  transaction: string; // base64 unsigned tx
  summaryHash: string; // hex
  reportPda: string;
  programId: string;
  blockhash: string;
  category: string;
  location: string;
  summary: string;
}

export interface ChatResult {
  reply: string;
  pendingTransaction: PendingTransaction | null;
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]; // user/assistant history for the client
}

/** Validate the tool arguments against the same limits the Anchor program enforces. */
function validate(input: {
  category?: unknown;
  location?: unknown;
  summary?: unknown;
}): string[] {
  const errors: string[] = [];
  if (typeof input.category !== "string" || !CATEGORIES.includes(input.category as never)) {
    errors.push(`category must be one of: ${CATEGORIES.join(", ")}`);
  } else if (Buffer.byteLength(input.category, "utf8") > MAX_CATEGORY_LEN) {
    errors.push(`category exceeds ${MAX_CATEGORY_LEN} bytes`);
  }
  if (typeof input.location !== "string" || input.location.trim().length === 0) {
    errors.push("location is required");
  } else if (Buffer.byteLength(input.location, "utf8") > MAX_LOCATION_LEN) {
    errors.push(`location exceeds ${MAX_LOCATION_LEN} bytes — please shorten it`);
  }
  if (typeof input.summary !== "string" || input.summary.trim().length === 0) {
    errors.push("summary is required");
  }
  return errors;
}

/**
 * Run one chat turn. `history` is the user/assistant conversation so far.
 * If the model calls file_civic_report and a wallet is connected, we build the
 * unsigned transaction (Step 4) and return it as `pendingTransaction` for the
 * frontend wallet to sign.
 */
export async function runChat(
  history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  reporter?: string,
): Promise<ChatResult> {
  const client = getClient();

  const working: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
  ];

  const first = await client.chat.completions.create({
    model: OPENROUTER_MODEL,
    temperature: 0.2,
    max_tokens: 1024,
    tools: TOOLS,
    tool_choice: "auto",
    messages: working,
  });

  const assistantMsg = first.choices[0]?.message;
  const toolCall = assistantMsg?.tool_calls?.[0];

  // No tool call → plain conversational reply.
  if (!toolCall) {
    const reply = assistantMsg?.content ?? "";
    return {
      reply,
      pendingTransaction: null,
      messages: [...history, { role: "assistant", content: reply }],
    };
  }

  // The model wants to file a report. Parse and validate its arguments.
  working.push(assistantMsg);
  let input: { category?: unknown; location?: unknown; summary?: unknown } = {};
  try {
    input = JSON.parse(toolCall.function.arguments || "{}");
  } catch {
    input = {};
  }

  let toolResultContent: string;
  let pending: PendingTransaction | null = null;

  if (!reporter) {
    toolResultContent =
      "The report could not be committed: no wallet is connected. Ask the citizen to connect their Phantom wallet, then file again.";
  } else {
    let reporterPk: PublicKey | null = null;
    try {
      reporterPk = new PublicKey(reporter);
    } catch {
      reporterPk = null;
    }
    const errors = validate(input);
    if (!reporterPk) {
      toolResultContent = "The connected wallet address is invalid; the report cannot be committed.";
    } else if (errors.length > 0) {
      toolResultContent = `The report could not be prepared: ${errors.join("; ")}. Ask the citizen for the missing or corrected details.`;
    } else {
      const category = input.category as string;
      const location = input.location as string;
      const summary = input.summary as string;

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

      pending = {
        transaction: transactionBase64,
        summaryHash: summaryHashHex,
        reportPda: reportPda.toBase58(),
        programId: PROGRAM_ID.toBase58(),
        blockhash,
        category,
        location,
        summary,
      };

      toolResultContent = `Report prepared and stored off-chain. category=${category}, location=${location}, summary_hash=${summaryHashHex.slice(0, 16)}…, report_pda=${pending.reportPda}. An unsigned Solana transaction is ready — tell the citizen to review the details and sign in their wallet to record it on devnet.`;
    }
  }

  working.push({
    role: "tool",
    tool_call_id: toolCall.id,
    content: toolResultContent,
  });

  // Second call: let the model turn the tool result into a natural reply.
  const second = await client.chat.completions.create({
    model: OPENROUTER_MODEL,
    temperature: 0.2,
    max_tokens: 1024,
    tools: TOOLS,
    tool_choice: "none",
    messages: working,
  });

  const reply = second.choices[0]?.message?.content ?? "";
  return {
    reply,
    pendingTransaction: pending,
    messages: [...history, { role: "assistant", content: reply }],
  };
}
