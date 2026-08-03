/// <reference lib="webworker" />

import MiniSearch from "minisearch";
import type { WordEntry } from "./data/words";

type DictionaryTuple = readonly [
  id: string,
  word: string,
  pronunciation: string | null,
  partOfSpeech: string,
  definition: string,
];

interface DictionaryManifest {
  entryCount: number;
  chunks: Array<{ path: string; count: number }>;
}

type IncomingMessage =
  | { type: "search"; query: string; requestId: number }
  | { type: "lookup"; ids: string[]; requestId: number }
  | { type: "retry" };

const worker = self as unknown as DedicatedWorkerGlobalScope;
const entries = new Map<string, WordEntry>();
const pendingLookups = new Map<number, Set<string>>();
const searchIndex = new MiniSearch<WordEntry>({
  idField: "id",
  fields: ["word", "definition"],
  storeFields: ["id"],
  processTerm: (term) => normalize(term),
  searchOptions: {
    boost: { word: 8, definition: 2 },
    prefix: true,
    fuzzy: 0.18,
  },
});

let manifest: DictionaryManifest | null = null;
let loadingPromise: Promise<void> | null = null;
let loadedChunks = 0;
let state: "idle" | "loading" | "ready" | "unavailable" = "idle";
let activeSearch: { query: string; requestId: number } | null = null;

function normalize(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tupleToEntry(tuple: DictionaryTuple): WordEntry {
  const [id, word, pronunciation, partOfSpeech, definition] = tuple;
  return {
    id,
    word,
    ...(pronunciation ? { pronunciation } : {}),
    partOfSpeech,
    definition,
    moods: [],
    creativeUses: [],
    curated: false,
    source: "krdict",
  };
}

function postStatus() {
  worker.postMessage({
    type: "status",
    state,
    loadedChunks,
    totalChunks: manifest?.chunks.length ?? 0,
    loadedEntries: entries.size,
    totalEntries: manifest?.entryCount ?? 0,
  });
}

function postSearchResults() {
  if (!activeSearch) return;
  const normalizedQuery = normalize(activeSearch.query);
  const results = normalizedQuery
    ? searchIndex
        .search(normalizedQuery, {
          prefix: true,
          fuzzy: normalizedQuery.length >= 3 ? 0.2 : false,
          combineWith: "AND",
        })
        .slice(0, 80)
        .map((result) => entries.get(String(result.id)))
        .filter((entry): entry is WordEntry => Boolean(entry))
        .sort((a, b) => {
          const aWord = normalize(a.word);
          const bWord = normalize(b.word);
          const aRank = aWord === normalizedQuery ? 0 : aWord.startsWith(normalizedQuery) ? 1 : 2;
          const bRank = bWord === normalizedQuery ? 0 : bWord.startsWith(normalizedQuery) ? 1 : 2;
          return aRank - bRank || a.word.localeCompare(b.word, "ko-KR");
        })
    : [];

  worker.postMessage({
    type: "search-results",
    requestId: activeSearch.requestId,
    results,
  });
}

function resolveLookups(final = false) {
  for (const [requestId, ids] of pendingLookups) {
    const results = [...ids]
      .map((id) => entries.get(id))
      .filter((entry): entry is WordEntry => Boolean(entry));
    if (final || results.length === ids.size) {
      worker.postMessage({ type: "lookup-results", requestId, results });
      pendingLookups.delete(requestId);
    }
  }
}

async function loadDictionary() {
  state = "loading";
  postStatus();

  try {
    const manifestResponse = await fetch("/data/dictionary-manifest.json");
    if (!manifestResponse.ok) throw new Error("dictionary manifest unavailable");
    manifest = (await manifestResponse.json()) as DictionaryManifest;
    postStatus();

    for (const chunk of manifest.chunks.slice(loadedChunks)) {
      const response = await fetch(`/data/${chunk.path}`);
      if (!response.ok) throw new Error(`dictionary chunk unavailable: ${chunk.path}`);
      const tuples = (await response.json()) as DictionaryTuple[];
      const freshEntries = tuples.map(tupleToEntry).filter((entry) => !entries.has(entry.id));
      freshEntries.forEach((entry) => entries.set(entry.id, entry));
      searchIndex.addAll(freshEntries);
      loadedChunks += 1;
      postStatus();
      postSearchResults();
      resolveLookups();
    }

    state = "ready";
    postStatus();
    postSearchResults();
    resolveLookups(true);
  } catch {
    state = "unavailable";
    postStatus();
    resolveLookups(true);
  } finally {
    loadingPromise = null;
  }
}

function ensureDictionary() {
  if (state === "ready") return Promise.resolve();
  if (!loadingPromise) loadingPromise = loadDictionary();
  return loadingPromise;
}

worker.addEventListener("message", (event: MessageEvent<IncomingMessage>) => {
  const message = event.data;

  if (message.type === "search") {
    activeSearch = { query: message.query, requestId: message.requestId };
    postSearchResults();
    if (normalize(message.query)) void ensureDictionary();
    return;
  }

  if (message.type === "lookup") {
    pendingLookups.set(message.requestId, new Set(message.ids));
    resolveLookups(state === "ready");
    if (state !== "ready") void ensureDictionary();
    return;
  }

  if (message.type === "retry" && state === "unavailable") {
    void ensureDictionary();
  }
});

export {};
