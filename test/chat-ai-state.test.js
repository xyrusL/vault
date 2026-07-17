import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CHAT_ENDPOINT,
  chooseConversationAfterDelete,
  mergeConversation,
  readApiResult,
} from "../src/dashboard/chatAiState.js";

test("chat endpoint defaults to 9router v1", () => {
  assert.equal(DEFAULT_CHAT_ENDPOINT, "https://rgd2742.abc-tunnel.us/v1");
});

test("readApiResult returns successful JSON and exposes backend errors", async () => {
  assert.deepEqual(await readApiResult(new Response(JSON.stringify({ data: [1] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  }), "fallback"), { data: [1] });

  await assert.rejects(
    readApiResult(new Response(JSON.stringify({ error: "Provider rejected key" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    }), "fallback"),
    /Provider rejected key/,
  );
});

test("mergeConversation replaces and moves the updated conversation first", () => {
  const result = mergeConversation(
    [{ id: "a", title: "A" }, { id: "b", title: "B" }],
    { id: "b", title: "Updated B" },
  );
  assert.deepEqual(result.map((item) => item.id), ["b", "a"]);
  assert.equal(result[0].title, "Updated B");
});

test("chooseConversationAfterDelete returns the first remaining conversation", () => {
  const conversations = [{ id: "a" }, { id: "b" }];
  assert.equal(chooseConversationAfterDelete(conversations, "a"), "b");
  assert.equal(chooseConversationAfterDelete([{ id: "a" }], "a"), "");
});
