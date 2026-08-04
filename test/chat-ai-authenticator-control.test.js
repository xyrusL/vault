import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const tools = await readFile(new URL("../src/dashboard/chatAiTools.js", import.meta.url), "utf8");

test("AI imports authenticator setup locally without returning secrets", () => {
  assert.match(tools, /tool\("import_authenticator_from_clipboard"/);
  assert.match(tools, /tool\("import_authenticator_from_vault"/);
  assert.match(tools, /navigator\.clipboard\.readText\(\)/);
  assert.match(tools, /vaultAuthenticatorValue\(secret\.data\)/);
  assert.match(tools, /data: safeAuthenticatorData\(created\.data\)/);
  assert.doesNotMatch(tools, /safeAuthenticatorData[\s\S]{0,250}\[.*"secret"/);
});

test("AI authenticator changes require confirmation and support account linking", () => {
  assert.match(tools, /name === "import_authenticator_from_clipboard"/);
  assert.match(tools, /name === "import_authenticator_from_vault"/);
  assert.match(tools, /name === "delete_authenticator_account"/);
  assert.match(tools, /use the exact account email or username as accountName/);
  assert.match(tools, /live code links automatically on the Accounts page/);
});
