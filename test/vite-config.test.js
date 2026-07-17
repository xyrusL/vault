import assert from "node:assert/strict";
import test from "node:test";
import viteConfig from "../vite.config.js";

test("default development mode proxies API requests to production data", () => {
  const config = viteConfig({ mode: "development" });
  const proxy = config.server.proxy["/api"];

  assert.equal(proxy.target, "https://api.vault.deze.me");
  assert.equal(proxy.changeOrigin, true);
  assert.equal(proxy.cookieDomainRewrite, "");
  assert.deepEqual(proxy.headers, {
    origin: "https://vault.deze.me",
  });
});

test("local development mode keeps API requests on the isolated local Worker", () => {
  const config = viteConfig({ mode: "local-dev" });

  assert.equal(config.server.proxy["/api"].target, "http://127.0.0.1:8788");
  assert.equal(config.server.proxy["/api"].cookieDomainRewrite, undefined);
});
