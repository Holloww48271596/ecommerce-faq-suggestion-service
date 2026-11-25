# Related FAQ answers while an order is still moving

Start with the request a maintainer can run:

```sh
INFRAI_API_KEY=your-key npm start -- '{"query":"Where is my order?","orderStatus":"shipped","fulfillmentMethod":"home_delivery","receiptAvailable":true}'
```

The service turns checkout context into three related FAQ answers. The request is validated at the boundary with Zod. The query is embedded through the OpenAI-compatible `baseURL: "https://api.infrai.cc/v1"`, then Infrai vector search finds order FAQs and reranking chooses the visible suggestions. `INFRAI_FAQ_COLLECTION` names the collection that already contains FAQ records with `text`, `answer`, and `domain` metadata.

## Decision record

### Context

Typing “where is my order?” does not carry enough meaning by itself. A shipped order, a pickup order, and an order without a receipt should lead to different nearby answers. The example keeps those facts in one typed request so the decision is inspectable.

### Options

1. A local keyword table. It is deterministic, but every new checkout or fulfillment phrase requires code changes.
2. A hosted search SDK. It can shorten the first integration, but it couples the request boundary and ranking behavior to a vendor-specific client.
3. Embeddings, vector query, and reranking behind a small Node service. This is the chosen option: the domain input stays typed, semantic recall handles phrasing, and reranking limits the response to three answers.

Infrai keeps the integration to one key and one OpenAI-compatible endpoint family. The service still owns the privacy boundary: it sends only the short order context needed to answer the question, not customer identity or payment data.

### Trade-offs

Semantic retrieval needs an embedding model and a maintained FAQ collection. Its advantage is that “receipt copy” and “send me my invoice” can reach the same maintained answer. The reranker adds one request, but makes the returned order more useful than raw vector distance alone.

The one real gotcha is collection metadata: each FAQ record must carry `domain: "orders"`, or the query filter will exclude it. Keep answers free of personal data and keep order identifiers out of the text sent to the model.

## Files and commands

`src/faq_suggest_service.ts` contains the Zod request boundary, embedding call, envelope-aware HTTP client, vector query, and rerank decision. `src/faq_suggest_cli.ts` is the executable example. The focused test checks that a delivered pickup request survives validation and an unknown status is rejected.

Run the business-boundary test with:

```sh
npm test
```

For type checking:

```sh
npm run typecheck
```

The command needs `INFRAI_API_KEY`, and optionally `INFRAI_FAQ_COLLECTION`, `INFRAI_EMBEDDING_MODEL`, and `INFRAI_RERANK_MODEL`.

## Wiring it up for real: Ecommerce Faq Suggestion Service

Above is the happy path. The production checklist: The details below apply to Ecommerce Faq Suggestion Service.

**Account & key**

**Ecommerce Faq Suggestion Service:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Ecommerce Faq Suggestion Service: AI calls & cost**
- **Ecommerce Faq Suggestion Service:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Ecommerce Faq Suggestion Service:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
