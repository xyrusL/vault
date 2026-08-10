import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../worker/api.js", import.meta.url), "utf8");
const tools = await readFile(new URL("../src/dashboard/chatAiTools.js", import.meta.url), "utf8");
const chat = await readFile(new URL("../src/dashboard/ChatAiView.jsx", import.meta.url), "utf8");
const chrome = await readFile(new URL("../src/dashboard/DashboardChrome.jsx", import.meta.url), "utf8");
const view = await readFile(new URL("../src/dashboard/VaultView.jsx", import.meta.url), "utf8");

test("Vault secrets use encrypted fields and authenticated routes", () => {
  assert.match(worker, /name_ciphertext/);
  assert.match(worker, /value_ciphertext/);
  assert.match(worker, /notes_ciphertext/);
  assert.match(worker, /url\.pathname === '\/v1\/vault'/);
  assert.doesNotMatch(worker, /vaultAiMatch/);
  assert.match(chrome, /id: "vault", label: "Vault"/);
});

test("AI secret access requires confirmation and keeps values local", () => {
  assert.match(tools, /tool\("list_vault_items"/);
  assert.match(tools, /tool\("copy_vault_secret"/);
  assert.match(tools, /name === "copy_vault_secret"/);
  assert.match(tools, /stageSecureValue\(clipboardValue/);
  assert.match(tools, /secureValueId/);
  assert.doesNotMatch(tools, /request_vault_secret/);
  assert.match(chat, /redactDisclosedSecrets/);
  assert.match(chat, /value: "\[secret redacted\]"/);
});

test("Each value in a Vault key set has an independent visibility toggle", () => {
  assert.match(view, /toggleEnvironmentEntryVisibility/);
  assert.match(view, /visibleEntries\[index\] \? "text" : "password"/);
  assert.match(view, /Show environment variable/);
});
