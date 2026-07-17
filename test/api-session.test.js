import assert from "node:assert/strict";
import test from "node:test";
import { usesDevelopmentToken } from "../src/apiSession.js";

test("shared-data development mode ignores local bearer sessions", () => {
  assert.equal(usesDevelopmentToken("development"), false);
  assert.equal(usesDevelopmentToken("remote"), false);
});

test("explicit local development mode uses local bearer sessions", () => {
  assert.equal(usesDevelopmentToken("local-dev"), true);
});
