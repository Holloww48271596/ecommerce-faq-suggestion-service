import { suggestFaq } from "./faq_suggest_service.ts";

const raw = process.argv[2] ?? "";
const input = raw ? JSON.parse(raw) : {
  query: "Where is my order?",
  orderStatus: "shipped",
  fulfillmentMethod: "home_delivery",
  receiptAvailable: true,
};

try {
  console.log(JSON.stringify(await suggestFaq(input), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
