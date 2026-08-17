import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getDevelopmentTokenStorage,
  localizeDevelopmentCookie,
  usesDevelopmentToken,
} from "../src/apiSession.js";

test("shared-data development mode ignores local bearer sessions", () => {
  assert.equal(usesDevelopmentToken("development"), false);
  assert.equal(usesDevelopmentToken("remote"), false);
});

test("explicit local development mode uses local bearer sessions", () => {
  assert.equal(usesDevelopmentToken("local-dev"), true);
});

test("development session storage follows the remember choice", () => {
  assert.equal(getDevelopmentTokenStorage(false), "session");
  assert.equal(getDevelopmentTokenStorage(true), "local");
});

test("non-remembered logins use a browser-session cookie", () => {
  const apiWorker = readFileSync(new URL("../worker/api.js", import.meta.url), "utf8");
  assert.match(
    apiWorker,
    /sessionCookie\(request, token, remember \? lifetime : null\)/,
  );
});

test("remote development cookies persist on the local HTTP host", () => {
  assert.equal(
    localizeDevelopmentCookie(
      "vault_session=token; Path=/; HttpOnly; Domain=.vault.deze.me; Secure; SameSite=Strict; Max-Age=2592000",
    ),
    "vault_session=token; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000",
  );
});
