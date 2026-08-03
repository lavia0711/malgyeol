import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readProjectFile = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("uses a fixed canonical origin instead of forwarded request headers", async () => {
  const layout = await readProjectFile("app/layout.tsx");

  assert.match(layout, /https:\/\/malgyeol\.geonwoomoon\.chatgpt\.site/);
  assert.doesNotMatch(layout, /x-forwarded-host|x-forwarded-proto|headers\(\)/i);
});

test("declares the required response security headers", async () => {
  const config = await readProjectFile("security-headers.ts");

  for (const header of [
    "Content-Security-Policy",
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
  ]) {
    assert.match(config, new RegExp(header));
  }

  assert.match(config, /frame-ancestors 'none'/);
  assert.match(config, /object-src 'none'/);
  assert.match(config, /worker-src 'self' blob:/);
});

test("pins every GitHub Action to a full commit SHA", async () => {
  const workflows = await Promise.all([
    readProjectFile(".github/workflows/ci.yml"),
    readProjectFile(".github/workflows/codeql.yml"),
  ]);

  for (const workflow of workflows) {
    const actionRefs = [...workflow.matchAll(/uses:\s+[^@\s]+@([^\s#]+)/g)];
    assert.ok(actionRefs.length > 0);
    for (const [, ref] of actionRefs) assert.match(ref, /^[\da-f]{40}$/);
  }
});

test("configures dependency updates and private vulnerability reporting", async () => {
  const [dependabot, securityPolicy] = await Promise.all([
    readProjectFile(".github/dependabot.yml"),
    readProjectFile("SECURITY.md"),
  ]);

  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(dependabot, /package-ecosystem: github-actions/);
  assert.match(securityPolicy, /Report a vulnerability/);
  assert.match(securityPolicy, /do not open a public issue/i);
});
