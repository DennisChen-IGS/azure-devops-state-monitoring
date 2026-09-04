import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../C4143-DVScale-Dashboard.user.js", import.meta.url), "utf8");

test("Re-run query refreshes the authenticated API entry in live userscript mode", () => {
  assert.match(source, /D\.authBootstrapUrl\s*=\s*function/);
  assert.match(source, /D\.reRunQuery\s*=\s*function/);
  assert.match(source, /location\.replace\(D\.authBootstrapUrl\(\)\)/);
  assert.match(source, /rb\.addEventListener\('click',\s*D\.reRunQuery\)/);
});

test("authentication bootstrap uses the Azure DevOps projects API entry", () => {
  assert.match(source, /D\.authBootstrapUrl\s*=\s*function[^\n]+\/_apis\/projects\?api-version=6\.0#dvdash/);
});
