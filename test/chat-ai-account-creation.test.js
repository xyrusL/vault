import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const tools = await readFile(new URL("../src/dashboard/chatAiTools.js", import.meta.url), "utf8");

test("AI account creation generates and stores a local-only password", () => {
  assert.match(tools, /tool\("create_account"/);
  assert.match(tools, /generatePassword: \{ type: "boolean", default: true/);
  assert.match(tools, /function generateSecurePassword/);
  assert.match(tools, /crypto\.getRandomValues/);
  assert.match(tools, /\.\.\.\(generatePassword \? \{ password \} : \{\}\)/);
  assert.match(tools, /stageSecureValue\(password/);
  assert.match(tools, /passwordGenerated: generatePassword, secureContainerDelivered: generatePassword/);
  assert.doesNotMatch(tools, /credentials: \{[^}]*password[,}]/);
});

test("Vault assistant prefers tools over manual account entry", () => {
  assert.match(tools, /use create_account instead of explaining the manual form/);
  assert.match(tools, /call create_temp_email first/);
  assert.match(tools, /Generated passwords are copied locally and never visible to you/);
});
