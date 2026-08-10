import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const dashboard = await readFile(new URL("../src/Dashboard.jsx", import.meta.url), "utf8");
const chrome = await readFile(new URL("../src/dashboard/DashboardChrome.jsx", import.meta.url), "utf8");
const floatingChat = await readFile(new URL("../src/dashboard/FloatingAiChat.jsx", import.meta.url), "utf8");

test("dashboard keeps one persistent Chat Ai view across floating and full-page modes", () => {
  assert.match(dashboard, /import FloatingAiChat from "\.\/dashboard\/FloatingAiChat"/);
  assert.match(dashboard, /case "chat-ai":/);
  assert.match(dashboard, /<FloatingAiChat/);
  assert.match(dashboard, /fullPage=\{activePage === "chat-ai"\}/);
  assert.match(dashboard, /pageContext=\{pageContext\}/);
  assert.match(floatingChat, /import ChatAiView from "\.\/ChatAiView"/);
  assert.match(floatingChat, /<ChatAiView compact=\{!fullPage\} pageContext=\{pageContext\} \/>/);
  assert.match(floatingChat, /initialized &&/);
});

test("sidebar exposes the Chat Ai navigation item", () => {
  assert.match(chrome, /id: "chat-ai", label: "AI Chat"/);
});

const chatView = await readFile(new URL("../src/dashboard/ChatAiView.jsx", import.meta.url), "utf8");
const chatTools = await readFile(new URL("../src/dashboard/chatAiTools.js", import.meta.url), "utf8");
const worker = await readFile(new URL("../worker/api.js", import.meta.url), "utf8");

test("Chat Ai verifies providers directly from the browser", () => {
  assert.match(chatView, /selectedId === "new" \? "\/ai\/config"/);
  assert.match(chatView, /Saved profiles/);
  assert.match(chatView, /Search profiles/);
  assert.match(chatView, /discoverProviderModelIds/);
  assert.match(chatView, /Discovering models/);
  assert.match(chatView, /Retry models/);
  assert.match(chatView, /attempt < 2/);
  assert.match(chatView, /autoVerificationSignature/);
  assert.match(chatView, /checked automatically after you stop typing/);
  assert.match(chatView, /Use endpoint/);
  assert.match(chatView, /\/activate/);
  assert.match(chatView, /discoverProviderModelIds\(\s*verification\.baseUrl/);
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
  assert.match(chatView, /Select provider and AI model/);
  assert.match(chatView, /selectChatModel/);
  assert.match(chatView, /profileModelValue/);
  assert.match(chatView, /balancedModelTextClass/);
  assert.match(chatView, /textClassName=\{modelTextClassName\}/);
  assert.match(chatView, /Unable to load the selected provider/);
  assert.match(chatView, /Unable to change the active model/);
  assert.match(chatView, /providerName: config\.providerName/);
  assert.match(chatView, /message\.providerName \|\| "AI"/);
  assert.match(chatView, /message\.model/);
  assert.match(worker, /provider_name, model/);
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
  assert.match(chatTools, /tool\("search_chat_memory"/);
  assert.match(chatTools, /tool\("get_dashboard_stats"/);
  assert.match(chatTools, /apiTool\("\/dashboard\/stats"/);
  assert.match(chatTools, /\/chat\/memory\/search/);
  assert.match(chatTools, /excludeConversationId/);
  assert.match(chatTools, /untrusted historical data/);
  assert.match(worker, /async function searchChatMemory/);
  assert.match(worker, /conversations\.user_id = \?/);
  assert.match(worker, /LIMIT 16/);
  assert.match(worker, /async function getDashboardStats/);
  assert.match(worker, /url\.pathname === '\/v1\/dashboard\/stats'/);
  assert.doesNotMatch(worker, /FROM accounts WHERE user_id/);
  assert.match(worker, /read_at IS NULL/);
  assert.match(worker, /SUM\(raw_size_bytes\)/);
  assert.match(worker, /vaultItems: numeric\(other\.vault_items\)/);
  assert.match(worker, /enabled: numeric\(other\.enabled_plugins\)/);
  assert.match(chatTools, /apiTool\("\/email\/addresses"/);
  assert.match(chatTools, /apiTool\(`\/accounts\/\$\{encodeURIComponent\(id\)\}`/);
  assert.doesNotMatch(chatTools, /window\.confirm/);
  assert.match(chatTools, /confirmationRequired: true/);
  assert.match(chatView, /confirm_pending_action/);
  assert.match(chatView, /cancel_pending_action/);
  assert.match(chatView, /approvedActionKey: confirmedAction\.actionKey/);
  assert.doesNotMatch(chatView, /approvedActionKey: pendingAction\?\.actionKey/);
  assert.doesNotMatch(chatTools, /tool\("(?:password|two_factor|backup)/);
});

test("Chat Ai exposes natural-language image generation for router models", () => {
  assert.match(chatView, /function findImageModel\(models\)/);
  assert.match(chatView, /ag\/gemini-3\.1-flash-image/);
  assert.match(chatView, /cx\/gpt-5\.5-image/);
  assert.match(chatView, /imageGen: true/);
  assert.match(chatView, /capabilities: \["textToImage"\]/);
  assert.match(chatView, /providerUrl\(config\.baseUrl, "images\/generations"\)/);
  assert.match(chatView, /const apiBase =/);
  assert.match(chatView, /normalizedBase\}\/v1/);
  assert.doesNotMatch(chatView, /modalities: \["text", "image"\]/);
  assert.doesNotMatch(chatView, /imagine/i);
});

test("Chat Ai lets the model invoke browser-side image generation", () => {
  assert.match(chatView, /name: "generate_image"/);
  assert.match(chatView, /resolution: \{ type: "string", enum: \["1k", "2k", "4k"\]/);
  assert.match(chatView, /IMAGE_SIZES/);
  assert.match(chatView, /Only one image can be generated per chat request/);
  assert.match(chatView, /imageUrl = completion\.imageUrl/);
  assert.match(chatView, /Your generated image is ready/);
  assert.match(chatView, /activity\.name === "generate_image" && activity\.status === "completed"/);
  assert.match(chatTools, /natural-language image creation requests/);
});
