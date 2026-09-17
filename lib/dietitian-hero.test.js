const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

test("hero bölümünde adres isim ve unvanın altında görünür", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/diyetisyen/[id]/page.tsx"), "utf8");

  assert.match(source, /lead\.address/);
  assert.match(source, /data-testid="hero-address"/);
  assert.match(source, /bg-gradient-to-br from-emerald-600/);
  assert.match(source, /{title}/);
});
