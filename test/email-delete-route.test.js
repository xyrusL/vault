import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const apiSource = await readFile(new URL("../worker/api.js", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("bulk email delete route is registered before address-id matching", () => {
  const collectionRoute = "if (url.pathname === '/v1/email/addresses')";
  const bulkHandler = "if (request.method === 'DELETE') return await deleteEmailAddresses";
  const itemMatcher = "const emailAddressMatch = url.pathname.match";

  assert.ok(apiSource.includes(collectionRoute));
  assert.ok(apiSource.includes(bulkHandler));
  assert.ok(apiSource.indexOf(bulkHandler) < apiSource.indexOf(itemMatcher));
});

test("default development uses the remote API for internet-deliverable email addresses", () => {
  assert.equal(packageJson.scripts.dev, "npm run dev:remote");
  assert.equal(packageJson.scripts["dev:remote"], "vite");
});

test("explicit local development keeps the local D1 API on the proxy port", () => {
  assert.match(packageJson.scripts["dev:local"], /vite --mode local-dev/);
  assert.match(packageJson.scripts["api:dev"], /--port 8788/);
});
