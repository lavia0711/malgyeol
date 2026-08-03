"use client";

import * as Dialog from "@radix-ui/react-dialog";
import MiniSearch from "minisearch";
import {
  ArrowRight,
  Bookmark,
  Check,
  Feather,
  Heart,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  balancedCuratedWords,
  curatedWords,
  getTodayWord,
  MOODS,
  wordById,
  type Mood,
  type WordEntry,
} from "./data/words";

const FAVORITES_KEY = "malgyeol:favorites:v2";
const LEGACY_FAVORITES_KEY = "malgyeol:favorites:v1";
const PAGE_SIZE = 32;
const SEARCH_FIELDS = ["word", "definition", "editorialNote", "moods", "creativeUses"];

type DictionaryState = "idle" | "loading" | "ready" | "unavailable";
type LookupKind = "favorites" | "url";

type DictionaryMessage =
  | {
      type: "status";
      state: DictionaryState;
      loadedChunks: number;
      totalChunks: number;
      loadedEntries: number;
      totalEntries: number;
    }
  | { type: "search-results"; requestId: number; results: WordEntry[] }
  | { type: "lookup-results"; requestId: number; results: WordEntry[] };

function normalize(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isWordEntry(value: unknown): value is WordEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<WordEntry>;
  return typeof entry.id === "string" && typeof entry.word === "string" && typeof entry.definition === "string";
}

function createSearchIndex(entries: WordEntry[]) {
  const index = new MiniSearch<WordEntry>({
    idField: "id",
    fields: SEARCH_FIELDS,
    storeFields: ["id"],
    extractField(document, fieldName) {
      const value = document[fieldName as keyof WordEntry];
      return Array.isArray(value) ? value.join(" ") : String(value ?? "");
    },
    processTerm: (term) => normalize(term),
    searchOptions: {
      boost: { word: 8, definition: 2, editorialNote: 1.6 },
      prefix: true,
      fuzzy: 0.18,
    },
  });
  index.addAll(entries);
  return index;
}

const curatedSearchIndex = createSearchIndex(curatedWords);

function WordCard({
  entry,
  favorite,
  onOpen,
  onFavorite,
}: {
  entry: WordEntry;
  favorite: boolean;
  onOpen: (entry: WordEntry) => void;
  onFavorite: (entry: WordEntry) => void;
}) {
  return (
    <article className="word-card">
      <div className="word-card-topline">
        <span className="word-kind">{entry.moods[0] ?? "사전"}</span>
        <button
          className={`icon-button ${favorite ? "is-favorite" : ""}`}
          type="button"
          aria-label={`${entry.word} ${favorite ? "찜 해제" : "찜하기"}`}
          aria-pressed={favorite}
          onClick={() => onFavorite(entry)}
        >
          <Heart aria-hidden="true" size={18} fill={favorite ? "currentColor" : "none"} />
        </button>
      </div>
      <button className="word-card-body" type="button" onClick={() => onOpen(entry)}>
        <span className="word-card-title">{entry.word}</span>
        <span className="word-card-definition">{entry.definition}</span>
        <span className="word-card-link">
          단어의 결 보기 <ArrowRight aria-hidden="true" size={15} />
        </span>
      </button>
    </article>
  );
}

export default function Home() {
  const wordsRef = useRef(new Map(curatedWords.map((entry) => [entry.id, entry])));
  const workerRef = useRef<Worker | null>(null);
  const workerRequestRef = useRef(0);
  const latestSearchRequestRef = useRef(0);
  const lookupKindsRef = useRef(new Map<number, LookupKind>());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalize(deferredQuery);
  const [selectedMoods, setSelectedMoods] = useState<Set<Mood>>(new Set());
  const [favorites, setFavorites] = useState<Map<string, WordEntry>>(new Map());
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedWord, setSelectedWord] = useState<WordEntry | null>(null);
  const [todayWord] = useState(getTodayWord);
  const [dictionaryResults, setDictionaryResults] = useState<WordEntry[]>([]);
  const [dictionaryState, setDictionaryState] = useState<DictionaryState>("idle");
  const [dictionaryProgress, setDictionaryProgress] = useState({ loaded: 0, total: 0 });
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [announcement, setAnnouncement] = useState("");

  const removeWordParameter = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("word");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;

    const dictionaryWorker = new Worker(new URL("./dictionary.worker.ts", import.meta.url), {
      type: "module",
      name: "malgyeol-dictionary",
    });
    dictionaryWorker.addEventListener("message", (event: MessageEvent<DictionaryMessage>) => {
      const message = event.data;
      if (message.type === "status") {
        setDictionaryState(message.state);
        setDictionaryProgress({ loaded: message.loadedChunks, total: message.totalChunks });
        return;
      }

      if (message.type === "search-results") {
        if (message.requestId !== latestSearchRequestRef.current) return;
        message.results.forEach((entry) => wordsRef.current.set(entry.id, entry));
        setDictionaryResults(message.results);
        return;
      }

      const kind = lookupKindsRef.current.get(message.requestId);
      lookupKindsRef.current.delete(message.requestId);
      message.results.forEach((entry) => wordsRef.current.set(entry.id, entry));

      if (kind === "favorites") {
        setFavorites((current) => {
          const next = new Map(current);
          message.results.forEach((entry) => next.set(entry.id, entry));
          return next;
        });
        localStorage.removeItem(LEGACY_FAVORITES_KEY);
      }

      if (kind === "url") {
        const wordId = new URLSearchParams(window.location.search).get("word");
        const entry = message.results.find((result) => result.id === wordId);
        if (entry) setSelectedWord(entry);
        else {
          setSelectedWord(null);
          removeWordParameter();
        }
      }
    });
    workerRef.current = dictionaryWorker;
    return dictionaryWorker;
  }, [removeWordParameter, setFavorites, setSelectedWord]);

  const lookupWords = useCallback(
    (ids: string[], kind: LookupKind) => {
      if (ids.length === 0) return;
      const requestId = ++workerRequestRef.current;
      lookupKindsRef.current.set(requestId, kind);
      ensureWorker().postMessage({ type: "lookup", ids, requestId });
    },
    [ensureWorker],
  );

  const syncDialogWithUrl = useCallback(() => {
    const wordId = new URLSearchParams(window.location.search).get("word");
    if (!wordId) {
      setSelectedWord(null);
      return;
    }
    const knownWord = wordsRef.current.get(wordId);
    if (knownWord) setSelectedWord(knownWord);
    else lookupWords([wordId], "url");
  }, [lookupWords, setSelectedWord]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const restored = new Map<string, WordEntry>();
      try {
        const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]") as unknown;
        if (Array.isArray(stored)) {
          stored.filter(isWordEntry).forEach((entry) => {
            restored.set(entry.id, entry);
            wordsRef.current.set(entry.id, entry);
          });
        }

        const legacy = JSON.parse(localStorage.getItem(LEGACY_FAVORITES_KEY) ?? "[]") as unknown;
        if (Array.isArray(legacy)) {
          const unresolved: string[] = [];
          legacy.filter((id): id is string => typeof id === "string").forEach((id) => {
            const entry = wordsRef.current.get(id);
            if (entry) restored.set(id, entry);
            else unresolved.push(id);
          });
          if (unresolved.length > 0) lookupWords(unresolved, "favorites");
          else if (legacy.length > 0) localStorage.removeItem(LEGACY_FAVORITES_KEY);
        }
      } catch {
        // Storage may be disabled or contain legacy malformed data.
      }
      setFavorites(restored);
      setFavoritesReady(true);
      syncDialogWithUrl();
    });

    window.addEventListener("popstate", syncDialogWithUrl);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("popstate", syncDialogWithUrl);
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [lookupWords, syncDialogWithUrl]);

  useEffect(() => {
    if (!favoritesReady) return;
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites.values()]));
    } catch {
      // The page remains usable when browser storage is disabled.
    }
  }, [favorites, favoritesReady]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase("en-US") === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    if (!normalizedQuery) return;
    const requestId = ++workerRequestRef.current;
    latestSearchRequestRef.current = requestId;
    ensureWorker().postMessage({ type: "search", query: normalizedQuery, requestId });
  }, [ensureWorker, normalizedQuery]);

  const collection = useMemo(() => {
    let entries: WordEntry[];

    if (!normalizedQuery) {
      entries = favoritesOnly ? [...favorites.values()] : balancedCuratedWords;
    } else {
      const curatedResults = curatedSearchIndex
        .search(normalizedQuery, {
          prefix: true,
          fuzzy: normalizedQuery.length >= 3 ? 0.2 : false,
          combineWith: "AND",
        })
        .map((result) => wordById.get(String(result.id)))
        .filter((entry): entry is WordEntry => Boolean(entry));
      entries = [...curatedResults, ...dictionaryResults];
    }

    if (selectedMoods.size > 0) {
      entries = entries.filter((entry) => entry.moods.some((mood) => selectedMoods.has(mood)));
    }

    const seen = new Set<string>();
    const unique = entries.filter((entry) => {
      const key = `${entry.word}:${entry.definition}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return {
      total: unique.length,
      visible: unique.slice(0, normalizedQuery || favoritesOnly ? 80 : visibleLimit),
    };
  }, [dictionaryResults, favorites, favoritesOnly, normalizedQuery, selectedMoods, visibleLimit]);

  const relatedWords = useMemo(() => {
    if (!selectedWord) return [];
    return curatedWords
      .filter(
        (entry) =>
          entry.id !== selectedWord.id &&
          entry.moods.some((mood) => selectedWord.moods.includes(mood)),
      )
      .slice(0, 3);
  }, [selectedWord]);

  function toggleMood(mood: Mood) {
    setSelectedMoods((current) => {
      const next = new Set(current);
      if (next.has(mood)) next.delete(mood);
      else next.add(mood);
      return next;
    });
    setVisibleLimit(PAGE_SIZE);
    setFavoritesOnly(false);
  }

  function toggleFavorite(entry: WordEntry) {
    setFavorites((current) => {
      const next = new Map(current);
      if (next.has(entry.id)) {
        next.delete(entry.id);
        setAnnouncement(`${entry.word} 찜을 해제했습니다.`);
      } else {
        next.set(entry.id, entry);
        wordsRef.current.set(entry.id, entry);
        setAnnouncement(`${entry.word}을 찜했습니다.`);
      }
      return next;
    });
  }

  function openWord(entry: WordEntry) {
    if (!selectedWord) lastTriggerRef.current = document.activeElement as HTMLElement | null;
    const url = new URL(window.location.href);
    url.searchParams.set("word", entry.id);
    if (selectedWord) window.history.replaceState(window.history.state, "", url);
    else window.history.pushState({ ...window.history.state, malgyeolDialog: true }, "", url);
    setSelectedWord(entry);
  }

  function closeWord() {
    if (window.history.state?.malgyeolDialog) window.history.back();
    else {
      removeWordParameter();
      setSelectedWord(null);
    }
  }

  async function copyShareLink(entry: WordEntry) {
    const url = new URL(window.location.href);
    url.searchParams.set("word", entry.id);
    await navigator.clipboard.writeText(url.toString());
    setAnnouncement(`${entry.word} 공유 주소를 복사했습니다.`);
  }

  async function shareWord(entry: WordEntry) {
    const url = new URL(window.location.href);
    url.searchParams.set("word", entry.id);
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${entry.word} — 말결`,
          text: entry.definition,
          url: url.toString(),
        });
        setAnnouncement(`${entry.word}을 공유했습니다.`);
      } else await copyShareLink(entry);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      try {
        await copyShareLink(entry);
      } catch {
        setAnnouncement("공유 주소를 복사하지 못했습니다.");
      }
    }
  }

  function resetSearch() {
    setQuery("");
    setDictionaryResults([]);
    setSelectedMoods(new Set());
    setFavoritesOnly(false);
    setVisibleLimit(PAGE_SIZE);
  }

  function retryDictionary() {
    const worker = ensureWorker();
    worker.postMessage({ type: "retry" });
    const requestId = ++workerRequestRef.current;
    latestSearchRequestRef.current = requestId;
    worker.postMessage({ type: "search", query: normalizedQuery, requestId });
  }

  return (
    <Dialog.Root open={Boolean(selectedWord)} onOpenChange={(open) => !open && selectedWord && closeWord()}>
      <main>
        <p className="sr-only" aria-live="polite">{announcement}</p>

        <header className="site-header">
          <Link className="brand" href="/" aria-label="말결 홈">
            <span className="brand-mark" aria-hidden="true">ㅁ</span>
            <span>말결</span>
          </Link>
          <button
            className={`favorites-button ${favoritesOnly ? "is-active" : ""}`}
            type="button"
            aria-pressed={favoritesOnly}
            onClick={() => {
              setFavoritesOnly((current) => !current);
              setSelectedMoods(new Set());
            }}
          >
            <Bookmark aria-hidden="true" size={17} fill={favoritesOnly ? "currentColor" : "none"} />
            찜한 낱말 <span>{favorites.size}</span>
          </button>
        </header>

        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow"><Feather aria-hidden="true" size={15} />우리말 발견 사전</p>
            <h1 id="hero-title">마음에 오래 남는<br /><em>단어의 결</em>을 찾으세요.</h1>
            <p className="hero-description">
              쓰임을 기다리는 아름다운 한국어를 뜻과 분위기로 살펴보세요.
              이름과 문장에 꼭 맞는 한 단어가 여기 있습니다.
            </p>
          </div>
          <div className="hero-glyph" aria-hidden="true"><span>말</span><i>결</i></div>
        </section>

        <section className="search-section" aria-label="낱말 검색">
          <label className="search-box">
            <Search aria-hidden="true" size={22} />
            <span className="sr-only">뜻이나 느낌으로 검색</span>
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (!normalize(event.target.value)) setDictionaryResults([]);
                setFavoritesOnly(false);
                setVisibleLimit(PAGE_SIZE);
              }}
              placeholder="뜻이나 느낌을 입력해 보세요"
              autoComplete="off"
            />
            {query ? (
              <button type="button" aria-label="검색어 지우기" onClick={() => setQuery("")}>
                <X aria-hidden="true" size={18} />
              </button>
            ) : <kbd aria-hidden="true">Ctrl/⌘ K</kbd>}
          </label>

          {normalizedQuery && dictionaryState === "loading" && (
            <p className="search-status" role="status">
              전체 사전 {dictionaryProgress.total ? `${dictionaryProgress.loaded}/${dictionaryProgress.total} 묶음` : "준비"} 색인 중 · 현재 결과부터 보여 드려요.
            </p>
          )}
          {normalizedQuery && dictionaryState === "unavailable" && (
            <p className="search-status is-error" role="status">
              전체 사전을 불러오지 못했어요. 선별 결과는 계속 볼 수 있습니다.
              <button type="button" onClick={retryDictionary}>다시 시도</button>
            </p>
          )}

          <div className="mood-row" aria-label="분위기 필터">
            <span>분위기로 찾기</span>
            <div className="mood-list">
              {MOODS.map((mood) => (
                <button
                  key={mood}
                  type="button"
                  aria-pressed={selectedMoods.has(mood)}
                  className={selectedMoods.has(mood) ? "is-selected" : ""}
                  onClick={() => toggleMood(mood)}
                >
                  {selectedMoods.has(mood) && <Check aria-hidden="true" size={13} />}{mood}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="featured-section" aria-labelledby="today-title">
          <article className="today-card">
            <div>
              <p className="card-label" id="today-title"><Sparkles aria-hidden="true" size={15} />오늘의 단어</p>
              <button type="button" className="today-word" onClick={() => openWord(todayWord)}>{todayWord.word}</button>
              <p>{todayWord.definition}</p>
            </div>
            <div className="today-actions">
              <button type="button" onClick={() => openWord(todayWord)}>자세히 보기 <ArrowRight aria-hidden="true" size={16} /></button>
              <button type="button" aria-label={`${todayWord.word} ${favorites.has(todayWord.id) ? "찜 해제" : "찜하기"}`} onClick={() => toggleFavorite(todayWord)}>
                <Heart aria-hidden="true" size={17} fill={favorites.has(todayWord.id) ? "currentColor" : "none"} />
              </button>
              <button type="button" aria-label={`${todayWord.word} 공유`} onClick={() => void shareWord(todayWord)}>
                <Share2 aria-hidden="true" size={17} />
              </button>
            </div>
          </article>

          <aside className="editor-note">
            <p className="card-label">말결의 제안</p>
            <blockquote>“{todayWord.editorialNote}”</blockquote>
            <div className="use-list">{todayWord.creativeUses.map((use) => <span key={use}># {use}</span>)}</div>
          </aside>
        </section>

        <section className="collection-section" aria-labelledby="collection-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">고른 낱말 120</p>
              <h2 id="collection-title">
                {favoritesOnly ? "내가 고른 낱말" : deferredQuery ? `‘${deferredQuery}’ 검색 결과` : selectedMoods.size ? "선택한 분위기의 낱말" : "오늘 펼쳐 볼 낱말"}
              </h2>
            </div>
            <p>{collection.visible.length}/{collection.total}개의 낱말{dictionaryState === "ready" && normalizedQuery && <span> · 사전 전체 검색</span>}</p>
          </div>

          {collection.visible.length > 0 ? (
            <>
              <div className="word-grid">
                {collection.visible.map((entry) => (
                  <WordCard key={entry.id} entry={entry} favorite={favorites.has(entry.id)} onOpen={openWord} onFavorite={toggleFavorite} />
                ))}
              </div>
              {!normalizedQuery && !favoritesOnly && collection.visible.length < collection.total && (
                <button className="load-more-button" type="button" onClick={() => setVisibleLimit((current) => current + PAGE_SIZE)}>
                  더 보기 <span>{Math.min(PAGE_SIZE, collection.total - collection.visible.length)}개</span>
                </button>
              )}
            </>
          ) : (
            <div className="empty-state">
              <span aria-hidden="true">빈</span>
              <h3>{favoritesOnly ? "아직 찜한 낱말이 없어요." : "아직 맞는 낱말을 찾지 못했어요."}</h3>
              <p>{favoritesOnly ? "마음에 드는 낱말의 하트를 눌러 이곳에 모아 보세요." : "검색어를 조금 짧게 쓰거나 다른 분위기를 골라 보세요."}</p>
              <button type="button" onClick={resetSearch}><RotateCcw aria-hidden="true" size={16} />{favoritesOnly ? "전체 낱말 보기" : "처음부터 다시 찾기"}</button>
            </div>
          )}
        </section>

        <footer>
          <div>
            <Link className="brand footer-brand" href="/"><span className="brand-mark" aria-hidden="true">ㅁ</span><span>말결</span></Link>
            <p>우리말의 좋은 결을 오래 들여다봅니다.</p>
          </div>
          <p className="license-copy">사전 자료: 국립국어원 한국어기초사전 · CC BY-SA 2.0 KR<br />예문과 음성·이미지 자료는 포함하지 않습니다.</p>
          <div className="footer-links">
            <a href="https://github.com/spellcheck-ko/korean-dict-nikl">데이터 출처</a>
            <a href="https://creativecommons.org/licenses/by-sa/2.0/kr/">라이선스</a>
          </div>
        </footer>
      </main>

      {selectedWord && (
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-backdrop" />
          <Dialog.Content
            className="word-dialog"
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              if (!lastTriggerRef.current) return;
              event.preventDefault();
              lastTriggerRef.current.focus();
            }}
          >
            <div className="dialog-header">
              <span>{selectedWord.curated ? "말결이 고른 낱말" : "한국어기초사전"}</span>
              <Dialog.Close asChild>
                <button className="dialog-close" type="button" aria-label="단어 상세 닫기"><X aria-hidden="true" size={21} /></button>
              </Dialog.Close>
            </div>
            <div className="dialog-content">
              <div className="dialog-word-row">
                <div>
                  <p className="part-of-speech">{selectedWord.partOfSpeech}</p>
                  <Dialog.Title asChild><h2>{selectedWord.word}</h2></Dialog.Title>
                  {selectedWord.pronunciation && <p>[{selectedWord.pronunciation}]</p>}
                </div>
                <button className={`dialog-heart ${favorites.has(selectedWord.id) ? "is-favorite" : ""}`} type="button" aria-label={`${selectedWord.word} ${favorites.has(selectedWord.id) ? "찜 해제" : "찜하기"}`} aria-pressed={favorites.has(selectedWord.id)} onClick={() => toggleFavorite(selectedWord)}>
                  <Heart aria-hidden="true" size={22} fill={favorites.has(selectedWord.id) ? "currentColor" : "none"} />
                </button>
              </div>

              <div className="definition-block"><span>뜻</span><p>{selectedWord.definition}</p></div>
              {selectedWord.editorialNote && <div className="editorial-block"><span>말결의 해설</span><p>{selectedWord.editorialNote}</p></div>}
              {selectedWord.moods.length > 0 && (
                <div className="tag-block">
                  <span>분위기</span>
                  <div>{selectedWord.moods.map((mood) => <button type="button" key={mood} onClick={() => { setSelectedMoods(new Set([mood])); closeWord(); }}>{mood}</button>)}</div>
                </div>
              )}
              {selectedWord.creativeUses.length > 0 && <div className="tag-block"><span>이런 곳에 어울려요</span><div>{selectedWord.creativeUses.map((use) => <em key={use}># {use}</em>)}</div></div>}
              <button className="share-button" type="button" onClick={() => void shareWord(selectedWord)}><Share2 aria-hidden="true" size={17} />이 낱말 공유하기</button>
              {relatedWords.length > 0 && (
                <div className="related-block"><span>같은 결의 낱말</span><div>{relatedWords.map((entry) => <button type="button" key={entry.id} onClick={() => openWord(entry)}>{entry.word}<ArrowRight aria-hidden="true" size={14} /></button>)}</div></div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      )}
    </Dialog.Root>
  );
}
