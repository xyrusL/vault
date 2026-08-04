import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../migrations/0022_create_plugins.sql", import.meta.url), "utf8");
const multipleAccountsMigration = await readFile(new URL("../migrations/0023_allow_multiple_plugin_accounts.sql", import.meta.url), "utf8");
const worker = await readFile(new URL("../worker/api.js", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../src/Dashboard.jsx", import.meta.url), "utf8");
const chrome = await readFile(new URL("../src/dashboard/DashboardChrome.jsx", import.meta.url), "utf8");
const view = await readFile(new URL("../src/dashboard/PluginsView.jsx", import.meta.url), "utf8");
const tools = await readFile(new URL("../src/dashboard/chatAiTools.js", import.meta.url), "utf8");

test("Plugins have separate encrypted user-scoped storage and support multiple accounts", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS plugins/);
  assert.match(migration, /config_ciphertext TEXT NOT NULL/);
  assert.match(migration, /UNIQUE \(user_id, platform\)/);
  assert.match(multipleAccountsMigration, /CREATE TABLE plugins_multiple_accounts/);
  assert.match(multipleAccountsMigration, /DROP TABLE plugins/);
  assert.doesNotMatch(multipleAccountsMigration, /UNIQUE \(user_id, platform\)/);
  assert.match(worker, /async function listPlugins/);
  assert.match(worker, /async function createPlugin/);
  assert.match(worker, /async function updatePlugin/);
  assert.match(worker, /async function deletePlugin/);
  assert.match(worker, /encryptPassword\(JSON\.stringify\(config\)/);
  assert.match(worker, /accountName: config\.accountName/);
  assert.match(worker, /url\.pathname === '\/v1\/plugins'/);
  assert.match(worker, /WHERE id = \? AND user_id = \?/);
});

test("Dashboard exposes four branded platform plugin configurations", () => {
  assert.match(dashboard, /import PluginsView/);
  assert.match(dashboard, /case "plugins"/);
  assert.match(chrome, /id: "plugins", label: "Plugins"/);
  for (const platform of ["spotify", "facebook", "discord", "google_workspace"]) {
    assert.match(view, new RegExp(`id: "${platform}"`));
  }
  assert.match(view, /getServiceLogoUrl\(platform\.url\)/);
  assert.match(view, /Open developer console/);
  assert.match(view, /Add \{platform\.name\} account/);
  assert.match(view, /plugin\.accountName/);
});

test("AI Chat discovers plugin metadata without receiving credentials", () => {
  assert.match(tools, /tool\("list_plugins"/);
  assert.match(tools, /apiTool\("\/plugins"/);
  assert.match(tools, /capabilities: pluginCapabilities/);
  assert.match(tools, /accountName: plugin\.accountName/);
  assert.match(tools, /configuredFields: plugin\.configuredFields/);
  assert.doesNotMatch(tools, /config: plugin\.config/);
  assert.match(tools, /Never ask for plugin client secrets or tokens in chat/);
});
