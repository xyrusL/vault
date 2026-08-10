import assert from "node:assert/strict";
import test from "node:test";
import {
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

test("remote development cookies persist on the local HTTP host", () => {
  assert.equal(
    localizeDevelopmentCookie(
      "vault_session=token; Path=/; HttpOnly; Domain=.vault.deze.me; Secure; SameSite=Strict; Max-Age=2592000",
    ),
    "vault_session=token; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000",
  );
});
