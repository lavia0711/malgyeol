import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline";

const sourceDirectory = resolve(
  process.argv[2] ?? "work/korean-dict-nikl/krdict",
);
const outputDirectory = resolve(process.argv[3] ?? "public/data");
const manifestFile = join(outputDirectory, "dictionary-manifest.json");
const metadataFile = join(outputDirectory, "dictionary-meta.json");
const ENTRIES_PER_CHUNK = 6_500;

const decodeXml = (value) =>
  value
    .replace(/&#x([\da-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

const attribute = (line, name) => {
  const match = line.match(new RegExp(`${name}="([^"]*)"`));
  return match ? decodeXml(match[1]) : "";
};

await mkdir(outputDirectory, { recursive: true });
const files = (await readdir(sourceDirectory))
  .filter((file) => /^\d{3}\.xml$/.test(file))
  .sort();

if (files.length === 0) {
  throw new Error(`No 한국어기초사전 XML files found in ${sourceDirectory}`);
}

let count = 0;
let entry = null;
let inFirstSense = false;
let pendingEntries = [];
const chunks = [];

async function flushChunk() {
  if (pendingEntries.length === 0) return;
  const fileName = `dictionary-${String(chunks.length + 1).padStart(3, "0")}.json`;
  await writeFile(
    join(outputDirectory, fileName),
    `${JSON.stringify(pendingEntries)}\n`,
    "utf8",
  );
  chunks.push({ path: fileName, count: pendingEntries.length });
  pendingEntries = [];
}

for (const file of files) {
  const lines = createInterface({
    input: createReadStream(join(sourceDirectory, file), { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const sourceLine of lines) {
    const line = sourceLine.trim();

    if (line.startsWith("<LexicalEntry ")) {
      entry = {
        sourceId: attribute(line, "val"),
        lexicalUnit: "",
        word: "",
        pronunciation: "",
        partOfSpeech: "",
        definition: "",
      };
      inFirstSense = false;
      continue;
    }

    if (!entry) continue;

    if (line.startsWith('<feat att="lexicalUnit"')) {
      entry.lexicalUnit = attribute(line, "val");
    } else if (line.startsWith('<feat att="partOfSpeech"')) {
      entry.partOfSpeech ||= attribute(line, "val");
    } else if (line.startsWith('<feat att="writtenForm"')) {
      entry.word ||= attribute(line, "val");
    } else if (line.startsWith('<feat att="pronunciation"')) {
      entry.pronunciation ||= attribute(line, "val");
    } else if (line.startsWith("<Sense ")) {
      inFirstSense = !entry.definition;
    } else if (inFirstSense && line.startsWith('<feat att="definition"')) {
      entry.definition = attribute(line, "val");
      inFirstSense = false;
    } else if (line === "</LexicalEntry>") {
      if (
        entry.lexicalUnit === "단어" &&
        entry.sourceId &&
        entry.word &&
        entry.definition
      ) {
        pendingEntries.push([
          `d-${entry.sourceId}`,
          entry.word,
          entry.pronunciation || null,
          entry.partOfSpeech || "품사 없음",
          entry.definition,
        ]);
        count += 1;
        if (pendingEntries.length >= ENTRIES_PER_CHUNK) await flushChunk();
      }
      entry = null;
      inFirstSense = false;
    }
  }
}

await flushChunk();

await writeFile(
  manifestFile,
  `${JSON.stringify({ version: 1, entryCount: count, chunks }, null, 2)}\n`,
  "utf8",
);

let sourceCommit = "unknown";
try {
  const gitDirectory = resolve(sourceDirectory, "..", ".git");
  const head = (await readFile(join(gitDirectory, "HEAD"), "utf8")).trim();
  if (head.startsWith("ref: ")) {
    const reference = head.slice(5);
    try {
      sourceCommit = (
        await readFile(join(gitDirectory, ...reference.split("/")), "utf8")
      ).trim();
    } catch {
      const packedRefs = await readFile(join(gitDirectory, "packed-refs"), "utf8");
      const packedReference = packedRefs
        .split(/\r?\n/)
        .find((line) => line.endsWith(` ${reference}`));
      sourceCommit = packedReference?.split(" ")[0] ?? "unknown";
    }
  } else if (/^[\da-f]{40}$/i.test(head)) {
    sourceCommit = head;
  }
} catch {
  // A manually downloaded source snapshot may not include Git metadata.
}

const metadata = {
  name: "한국어기초사전",
  provider: "국립국어원",
  sourceRepository: "https://github.com/spellcheck-ko/korean-dict-nikl",
  sourceCommit,
  sourceDirectory: basename(sourceDirectory),
  license: "CC BY-SA 2.0 KR",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/kr/",
  generatedAt: new Date().toISOString(),
  entryCount: count,
  excludedFields: ["SenseExample", "sound", "image", "video"],
};

await writeFile(metadataFile, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
console.log(
  `Wrote ${count.toLocaleString("ko-KR")} entries in ${chunks.length} chunks to ${outputDirectory}`,
);
