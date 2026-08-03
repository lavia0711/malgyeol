import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Korean product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]*lang="ko"/i);
  assert.match(html, /<title>말결 — 아름다운 한국어 단어 찾기<\/title>/i);
  assert.match(html, /마음에 오래 남는/);
  assert.match(html, /우리말 발견 사전/);
  assert.match(html, /오늘의 단어/);
  assert.match(html, /고른 낱말 120/);
  assert.match(html, /국립국어원 한국어기초사전/);
  assert.match(html, /property="og:image"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(
    html,
    /https:\/\/malgyeol\.geonwoomoon\.chatgpt\.site\/og\.png/,
  );
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("removes starter-only assets and dependencies", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /MiniSearch/);
  assert.match(page, /malgyeol:favorites:v2/);
  assert.match(page, /@radix-ui\/react-dialog/);
  assert.match(page, /dictionary\.worker/);
  assert.match(layout, /lang="ko"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview|codex-preview/);
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});

test("ships a compact dictionary without restricted example or media fields", async () => {
  const [manifestText, metadataText] = await Promise.all([
    readFile(new URL("../public/data/dictionary-manifest.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/dictionary-meta.json", import.meta.url), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  const metadata = JSON.parse(metadataText);

  assert.equal(manifest.entryCount, 51_555);
  assert.equal(manifest.chunks.length, 8);
  assert.equal(metadata.entryCount, manifest.entryCount);
  assert.match(metadata.sourceCommit, /^[\da-f]{40}$/);
  assert.deepEqual(metadata.excludedFields, [
    "SenseExample",
    "sound",
    "image",
    "video",
  ]);

  let entryCount = 0;
  for (const chunk of manifest.chunks) {
    const tuples = JSON.parse(
      await readFile(new URL(`../public/data/${chunk.path}`, import.meta.url), "utf8"),
    );
    assert.equal(tuples.length, chunk.count);
    entryCount += tuples.length;
    for (const tuple of tuples) {
      assert.equal(tuple.length, 5);
      assert.match(tuple[0], /^d-/);
      assert.equal(typeof tuple[1], "string");
      assert.equal(typeof tuple[4], "string");
    }
  }
  assert.equal(entryCount, manifest.entryCount);
});

test("ships a standard 1200 by 630 PNG social card", async () => {
  const image = await readFile(new URL("../public/og.png", import.meta.url));

  assert.deepEqual(
    [...image.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  );
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
});
