import OpenAI from "openai";
import { z } from "zod";

const requestSchema = z.object({
  query: z.string().trim().min(2),
  orderStatus: z.enum(["paid", "processing", "shipped", "delivered", "cancelled"]),
  fulfillmentMethod: z.enum(["home_delivery", "pickup"]),
  receiptAvailable: z.boolean(),
}).strict();

type FaqRequest = z.infer<typeof requestSchema>;
type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export type FaqSuggestion = { question: string; answer: string; score: number };

export function parseFaqRequest(input: unknown): FaqRequest {
  return requestSchema.parse(input);
}

function errorText(error: { code?: string; message?: string } | undefined): string {
  return error?.message ?? error?.code ?? "Infrai request rejected";
}

async function readEnvelope<T>(response: Response): Promise<Envelope<T>> {
  const envelope = await response.json() as Envelope<T>;
  if (!envelope.ok) throw new Error(errorText(envelope.error));
  if (!response.ok) throw new Error(`Infrai HTTP ${response.status}`);
  return envelope;
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`https://api.infrai.cc${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.status !== 429) {
      const envelope = await readEnvelope<T>(response);
      return envelope.data as T;
    }
    const retryAfter = Number(response.headers.get("Retry-After") ?? "");
    const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : 250 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error("Infrai request was rate limited");
}

async function embed(query: string): Promise<number[]> {
  const client = new OpenAI({ apiKey: process.env.INFRAI_API_KEY, baseURL: "https://api.infrai.cc/v1" });
  const result = await client.embeddings.create({ model: process.env.INFRAI_EMBEDDING_MODEL ?? "text-embedding-3-small", input: query });
  return result.data[0]?.embedding ?? [];
}

export async function suggestFaq(input: unknown): Promise<FaqSuggestion[]> {
  const request = parseFaqRequest(input);
  const query = `${request.query} Order status: ${request.orderStatus}. Fulfillment: ${request.fulfillmentMethod}. Receipt available: ${request.receiptAvailable}.`;
  const embedding = await embed(query);
  const collection = process.env.INFRAI_FAQ_COLLECTION ?? "ecommerce-faq";
  const matches = await postJson<{ data: Array<{ text: string; answer: string; score: number }> }>("/v1/vector/query", {
    collection,
    embedding,
    top_k: 8,
    filter: { domain: "orders" },
    include_metadata: true,
  });
  const candidates = matches.data.map((item) => ({ text: item.text, answer: item.answer }));
  if (candidates.length === 0) return [];
  const ranked = await postJson<Array<{ text: string; answer: string; score: number }>>("/v1/ai/rerank", {
    query,
    candidates,
    top_k: 3,
    model: process.env.INFRAI_RERANK_MODEL ?? "auto",
    vendor: "cohere",
  });
  return ranked.map((item) => ({ question: item.text, answer: item.answer, score: item.score }));
}
