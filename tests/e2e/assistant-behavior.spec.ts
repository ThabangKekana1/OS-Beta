import { expect, test, type APIRequestContext } from "@playwright/test";

const baseContext = [
  "Business: Volt Flow",
  "Stage: Awaiting Documents",
  "Next action: Upload your latest utility bill.",
  "Missing client items: Utility bill, Signed Expression of Interest",
  "Product recommendation: Generocity",
].join("\n");

async function chat(request: APIRequestContext, message: string) {
  const response = await request.post("/api/chat", {
    data: {
      message,
      context: baseContext,
      caseName: "Volt Flow",
    },
  });

  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as { reply?: string };
  const reply = payload.reply ?? "";

  expect(reply.length).toBeGreaterThan(0);
  expect(reply).not.toMatch(/STATUS:|PRIMARY_ACTION:|OWNER:|REQUIRED_INPUTS:|RATIONALE:/i);

  return reply;
}

test("assistant replies conversationally for required prompt set", async ({ request }) => {
  const howAreYou = await chat(request, "How are you?");
  expect(howAreYou.toLowerCase()).toMatch(/help|assist|support|how can i/);

  const foundation = await chat(request, "What does Foundation-1 do?");
  expect(foundation).toMatch(/Foundation-1/i);
  expect(foundation).toMatch(/Generocity/i);
  expect(foundation).toMatch(/Lumen-1/i);

  const generocity = await chat(request, "Explain Generocity.");
  expect(generocity).toMatch(/Generocity/i);

  const onboarding = await chat(request, "I want to start migrating from Eskom.");
  expect(onboarding.toLowerCase()).toMatch(/migrat|next step|start/);

  const docs = await chat(request, "What documents do you need from me?");
  expect(docs.toLowerCase()).toMatch(/document|utility bill|expression of interest|proposal|term sheet/);

  const status = await chat(request, "What is my current status?");
  expect(status.toLowerCase()).toMatch(/stage|status|next step|outstanding/);

  const hello = await chat(request, "Hello");
  expect(hello.toLowerCase()).toMatch(/hello|hi|help/);
});
