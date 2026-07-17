import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const dashboard = await readFile(new URL("../src/Dashboard.jsx", import.meta.url), "utf8");
const chrome = await readFile(new URL("../src/dashboard/DashboardChrome.jsx", import.meta.url), "utf8");

test("dashboard registers the Chat Ai view", () => {
  assert.match(dashboard, /import ChatAiView from "\.\/dashboard\/ChatAiView"/);
  assert.match(dashboard, /case "chat-ai":/);
  assert.match(dashboard, /return <ChatAiView \/>/);
});

test("sidebar exposes the Chat Ai navigation item", () => {
  assert.match(chrome, /id: "chat-ai", label: "AI Chat"/);
});

const chatView = await readFile(new URL("../src/dashboard/ChatAiView.jsx", import.meta.url), "utf8");
const chatTools = await readFile(new URL("../src/dashboard/chatAiTools.js", import.meta.url), "utf8");
const worker = await readFile(new URL("../worker/api.js", import.meta.url), "utf8");

test("Chat Ai verifies providers directly from the browser", () => {
  assert.match(chatView, /apiFetch\("\/ai\/config"/);
  assert.match(chatView, /fetch\(providerUrl\(verification\.baseUrl, "models"\)/);
  assert.match(chatView, /providerId: "9router"/);
  assert.match(chatView, /apiMode: "openai-compatible"/);
  assert.equal(chatView.match(/Configure endpoint/g)?.length, 1);
  assert.doesNotMatch(chatView, /localStorage|sessionStorage/);
});

test("Chat Ai sends provider requests in-browser and persists exchanges", () => {
  assert.match(chatView, /apiFetch\(`\/chat\/conversations\/\$\{.*\}\/messages`\)/);
  assert.match(chatView, /requestProviderCompletion\(/);
  assert.match(chatView, /apiFetch\("\/chat\/exchanges"/);
  assert.match(worker, /url\.pathname === '\/v1\/ai\/client-config'/);
  assert.match(worker, /url\.pathname === '\/v1\/chat\/exchanges'/);
  assert.match(chatView, /method: "DELETE"/);
  assert.match(chatView, /event\.shiftKey/);
  assert.match(chatView, /pending-user-/);
  assert.match(chatView, /setDraft\(""\)/);
  assert.match(chatView, /current\.filter\(\(item\) => item\.id !== optimisticUserId\)/);
});

test("Chat Ai runs Vault tools in the browser through existing manual APIs", () => {
  assert.match(chatView, /const availableTools = \[/);
  assert.match(chatView, /pendingActionTools\(pendingAction\)/);
  assert.match(chatView, /tools: availableTools/);
  assert.match(chatView, /executeVaultAiTool/);
  assert.match(chatView, /role: "tool"/);
  assert.match(chatView, /totalToolCalls > 20/);
  assert.match(chatTools, /tool\("create_temp_email"/);
  assert.match(chatTools, /tool\("update_account"/);
  assert.match(chatTools, /apiTool\("\/email\/addresses"/);
  assert.match(chatTools, /apiTool\(`\/accounts\/\$\{encodeURIComponent\(id\)\}`/);
  assert.doesNotMatch(chatTools, /window\.confirm/);
  assert.match(chatTools, /confirmationRequired: true/);
  assert.match(chatView, /confirm_pending_action/);
  assert.match(chatView, /cancel_pending_action/);
  assert.match(chatView, /approvedActionKey: confirmedAction\.actionKey/);
  assert.match(chatView, /approvedActionKey: pendingAction\?\.actionKey/);
  assert.doesNotMatch(chatTools, /tool\("(?:password|two_factor|backup)/);
});

test("Chat Ai exposes imagine for router registry image models", () => {
  assert.match(chatView, /function findImageModel\(models\)/);
  assert.match(chatView, /ag\/gemini-3\.1-flash-image/);
  assert.match(chatView, /cx\/gpt-5\.5-image/);
  assert.match(chatView, /imageGen: true/);
  assert.match(chatView, /capabilities: \["textToImage"\]/);
  assert.match(chatView, /\/imagine/);
  assert.match(chatView, /No image-generation model available/);
  assert.match(chatView, /providerUrl\(config\.baseUrl, "images\/generations"\)/);
  assert.match(chatView, /modalities: \["text", "image"\]/);
  assert.match(chatView, /setActiveCommand\("imagine"\)/);
  assert.match(chatView, /\/\{activeCommand\}/);
  assert.match(chatView, /Describe the image you want/);
});

test("Chat Ai lets the model invoke browser-side image generation", () => {
  assert.match(chatView, /name: "generate_image"/);
  assert.match(chatView, /resolution: \{ type: "string", enum: \["1k", "2k", "4k"\]/);
  assert.match(chatView, /IMAGE_SIZES/);
  assert.match(chatView, /Only one image can be generated per chat request/);
  assert.match(chatView, /imageUrl = completion\.imageUrl/);
  assert.match(chatTools, /user does not need to type \/imagine/);
});
