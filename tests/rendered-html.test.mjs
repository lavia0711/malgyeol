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
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("removes starter-only assets and dependencies", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /MiniSearch/);
  assert.match(page, /malgyeol:favorites:v1/);
  assert.match(page, /aria-modal="true"/);
  assert.match(layout, /lang="ko"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview|codex-preview/);
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});

test("ships a compact dictionary without restricted example or media fields", async () => {
  const [dictionaryText, metadataText] = await Promise.all([
    readFile(new URL("../public/data/dictionary.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/dictionary-meta.json", import.meta.url), "utf8"),
  ]);
  const dictionary = JSON.parse(dictionaryText);
  const metadata = JSON.parse(metadataText);

  assert.equal(dictionary.length, 51_555);
  assert.equal(metadata.entryCount, dictionary.length);
  assert.match(metadata.sourceCommit, /^[\da-f]{40}$/);
  assert.deepEqual(metadata.excludedFields, [
    "SenseExample",
    "sound",
    "image",
    "video",
  ]);

  for (const entry of dictionary) {
    assert.deepEqual(
      Object.keys(entry).filter((key) =>
        ["example", "sound", "image", "video"].includes(key),
      ),
      [],
    );
    assert.equal(entry.source, "krdict");
    assert.equal(entry.curated, false);
  }
});
