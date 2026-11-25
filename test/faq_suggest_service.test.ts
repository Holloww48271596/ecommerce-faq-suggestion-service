import assert from "node:assert/strict";
import { parseFaqRequest } from "../src/faq_suggest_service.ts";

const parsed = parseFaqRequest({
  query: "receipt for my order",
  orderStatus: "delivered",
  fulfillmentMethod: "pickup",
  receiptAvailable: false,
});

assert.equal(parsed.orderStatus, "delivered");
assert.equal(parsed.receiptAvailable, false);
assert.throws(() => parseFaqRequest({
  query: "receipt",
  orderStatus: "unknown",
  fulfillmentMethod: "pickup",
  receiptAvailable: false,
}));
console.log("request boundary test passed");
