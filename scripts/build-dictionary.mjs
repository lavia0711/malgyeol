import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline";

const sourceDirectory = resolve(
  process.argv[2] ?? "work/korean-dict-nikl/krdict",
);
const outputDirectory = resolve(process.argv[3] ?? "public/data");
const outputFile = join(outputDirectory, "dictionary.json");
const metadataFile = join(outputDirectory, "dictionary-meta.json");

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

async function writeChunk(stream, chunk) {
  if (!stream.write(chunk)) await once(stream, "drain");
}

await mkdir(outputDirectory, { recursive: true });
const files = (await readdir(sourceDirectory))
  .filter((file) => /^\d{3}\.xml$/.test(file))
  .sort();

if (files.length === 0) {
  throw new Error(`No 한국어기초사전 XML files found in ${sourceDirectory}`);
}

const output = createWriteStream(outputFile, { encoding: "utf8" });
await writeChunk(output, "[\n");

let count = 0;
let entry = null;
let inFirstSense = false;

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
        const compactEntry = {
          id: `d-${entry.sourceId}`,
          word: entry.word,
          ...(entry.pronunciation
            ? { pronunciation: entry.pronunciation }
            : {}),
          partOfSpeech: entry.partOfSpeech || "품사 없음",
          definition: entry.definition,
          moods: [],
          creativeUses: [],
          curated: false,
          source: "krdict",
        };
        await writeChunk(
          output,
          `${count === 0 ? "" : ",\n"}${JSON.stringify(compactEntry)}`,
        );
        count += 1;
      }
      entry = null;
      inFirstSense = false;
    }
  }
}

await writeChunk(output, "\n]\n");
output.end();
await once(output, "finish");

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
console.log(`Wrote ${count.toLocaleString("ko-KR")} entries to ${outputFile}`);
