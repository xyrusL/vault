import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const tools = await readFile(new URL("../src/dashboard/chatAiTools.js", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../src/Dashboard.jsx", import.meta.url), "utf8");
const chatView = await readFile(new URL("../src/dashboard/ChatAiView.jsx", import.meta.url), "utf8");
const accountsView = await readFile(new URL("../src/dashboard/AccountsViews.jsx", import.meta.url), "utf8");

test("AI knows and can open every application tab", () => {
  assert.match(tools, /tool\("open_app_tab"/);
  assert.match(tools, /"dashboard", "vault", "accounts", "authenticator", "email-generator", "chat-ai", "notes", "plugins", "activity", "backup", "settings"/);
  assert.match(tools, /new CustomEvent\("vault:navigate"/);
  assert.match(dashboard, /addEventListener\("vault:navigate", handleAiNavigation\)/);
  assert.match(chatView, /"chat-ai": "list_conversations and list_ai_profiles"/);
  assert.match(chatView, /backup: "get_dashboard_stats"/);
  assert.match(chatView, /settings: "get_profile"/);
});

test("AI exposes database-backed tools across every Vault workspace app", () => {
  for (const name of [
    "get_dashboard_stats",
    "list_accounts",
    "list_vault_items",
    "list_notes",
    "list_email_addresses",
    "list_authenticator_accounts",
    "list_plugins",
    "list_activity",
    "get_profile",
    "list_conversations",
  ]) {
    assert.match(tools, new RegExp(`tool\\("${name}"`));
    assert.match(tools, new RegExp(`name === "${name}"`));
  }
});

test("AI supports missing safe workspace mutations through authenticated APIs", () => {
  for (const name of [
    "copy_account_password",
    "rotate_account_password",
    "create_vault_item_from_clipboard",
    "update_vault_item",
    "delete_vault_item",
    "set_plugin_enabled",
    "delete_plugin",
    "create_forwarding_destination",
    "update_profile",
    "delete_conversation",
    "create_plugin_from_vault",
    "update_plugin_from_vault",
    "set_appearance_theme",
  ]) {
    assert.match(tools, new RegExp(`tool\\("${name}"`));
    assert.match(tools, new RegExp(`name === "${name}"`));
  }
});

test("AI keeps secret values local and confirms sensitive operations", () => {
  assert.match(tools, /function stageSecureValue/);
  assert.match(tools, /secureValues\.set\(id, \{ value, label, kind, expiresAt \}\)/);
  assert.match(tools, /data: \{ secureValueId: id, label, kind, expiresAt \}/);
  assert.match(tools, /Sensitive value delivered to a secure browser-only container/);
  assert.match(chatView, /getSecureValue/);
  assert.match(chatView, /function SecureValueCard/);
  assert.match(chatView, /Browser-only secure container/);
  assert.match(chatView, /secureCalls\.map\(\(call\) => \(/);
  assert.doesNotMatch(chatView, /<ToolActivityRow key=\{call\.id\} call=\{call\} \/>[\s\S]{0,200}<SecureValueCard/);
  assert.match(tools, /create_vault_item_from_clipboard.*read the local clipboard/s);
  assert.match(tools, /delete_vault_item.*permanently delete/s);
  assert.match(tools, /set_plugin_enabled.*plugin account/s);
  assert.match(tools, /update_profile.*signed-in profile/s);
  assert.match(tools, /delete_conversation.*permanently delete/s);
  assert.match(tools, /copy_plugin_credentials.*secure browser-only container/s);
  assert.match(tools, /copy_ai_provider_key.*secure browser-only container/s);
  assert.doesNotMatch(tools, /tool\("(?:password|two_factor|backup)/);
});

test("AI receives selected account context without receiving its password", () => {
  assert.match(accountsView, /selectedAccount: selectedAccount \? \{/);
  assert.match(accountsView, /hasPassword: Boolean/);
  assert.doesNotMatch(accountsView, /selectedAccount: selectedAccount \? \{[^}]*password[,}]/s);
  assert.match(dashboard, /onContextChange=\{handlePageContextChange\}/);
});

test("pending actions support trusted buttons and natural-language confirmation", () => {
  assert.match(chatView, /function PendingActionCard/);
  assert.match(chatView, /onDecision\("confirm"\)/);
  assert.match(chatView, /onDecision\("cancel"\)/);
  assert.match(chatView, /function naturalPendingDecision/);
  assert.match(chatView, /naturalPendingDecision\(prompt\)/);
  assert.doesNotMatch(chatView, /function pendingActionPresentation/);
  assert.match(chatView, />Yes<\/button>/);
  assert.match(chatView, />No<\/button>/);
  assert.match(tools, /Never ask for confirmation in prose before calling a requested tool/);
  assert.match(tools, /Do not ask for confirmation again or retry the tool/);
  assert.match(chatView, /message\.toolActivity\?\.some\(\(call\) => call\.status === "confirmation"\)/);
  assert.match(chatView, /pendingDecision === "confirm"/);
  assert.match(chatView, /approvedActionKey: pendingAction\.actionKey/);
  assert.match(chatView, /TRUSTED CONFIRMATION RESULT/);
  assert.match(chatView, /forceTextResponse \? \{\} : \{ tools: availableTools, tool_choice: "auto" \}/);
  assert.match(chatView, /forceTextResponse && toolCalls\.length/);
  assert.match(chatView, /This secure action is ready for approval in Vault's confirmation controls/);
  assert.match(chatView, /SECURE ACTION STATE: There is no action awaiting approval because the latest secure action was already approved and completed/);
  assert.match(chatView, /call\.status === "completed" && call\.result\?\.data\?\.secureValueId/);
  assert.match(tools, /A delivered secure container means its action is already approved and completed/);
});
