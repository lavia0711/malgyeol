"use client";

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
  curatedWords,
  getTodayWord,
  MOODS,
  type Mood,
  type WordEntry,
} from "./data/words";

const FAVORITES_KEY = "malgyeol:favorites:v1";
const SEARCH_FIELDS = ["word", "definition", "editorialNote", "moods", "creativeUses"];

function normalize(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function WordCard({
  entry,
  favorite,
  onOpen,
  onFavorite,
}: {
  entry: WordEntry;
  favorite: boolean;
  onOpen: (entry: WordEntry) => void;
  onFavorite: (id: string) => void;
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
          onClick={() => onFavorite(entry.id)}
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
  const indexRef = useRef(createSearchIndex(curatedWords));
  const wordsRef = useRef(new Map(curatedWords.map((entry) => [entry.id, entry])));
  const dictionaryPromiseRef = useRef<Promise<void> | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selectedMoods, setSelectedMoods] = useState<Set<Mood>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedWord, setSelectedWord] = useState<WordEntry | null>(null);
  const [todayWord] = useState(getTodayWord);
  const [dictionaryState, setDictionaryState] = useState<
    "idle" | "loading" | "ready" | "unavailable"
  >("idle");
  const [announcement, setAnnouncement] = useState("");

  const loadDictionary = useCallback(() => {
    if (dictionaryPromiseRef.current) return dictionaryPromiseRef.current;

    setDictionaryState("loading");
    dictionaryPromiseRef.current = fetch("/data/dictionary.json")
      .then(async (response) => {
        if (!response.ok) throw new Error("dictionary unavailable");
        const entries = (await response.json()) as WordEntry[];
        const freshEntries = entries.filter((entry) => !wordsRef.current.has(entry.id));
        freshEntries.forEach((entry) => wordsRef.current.set(entry.id, entry));
        indexRef.current.addAll(freshEntries);
        setDictionaryState("ready");
      })
      .catch(() => {
        setDictionaryState("unavailable");
      });

    return dictionaryPromiseRef.current;
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]") as string[];
        setFavorites(new Set(stored));
      } catch {
        setFavorites(new Set());
      } finally {
        setFavoritesReady(true);
      }

      const wordId = new URLSearchParams(window.location.search).get("word");
      if (!wordId) return;
      const knownWord = wordsRef.current.get(wordId);
      if (knownWord) {
        setSelectedWord(knownWord);
        return;
      }
      void loadDictionary().then(() => {
        const loadedWord = wordsRef.current.get(wordId);
        if (loadedWord) setSelectedWord(loadedWord);
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadDictionary]);

  useEffect(() => {
    if (!favoritesReady) return;
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
    } catch {
      // The page remains fully usable when browser storage is disabled.
    }
  }, [favorites, favoritesReady]);

  useEffect(() => {
    if (!selectedWord) return;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeWord();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [selectedWord]);

  useEffect(() => {
    if (normalize(deferredQuery).length > 0) void loadDictionary();
  }, [deferredQuery, loadDictionary]);

  const visibleWords = useMemo(() => {
    const normalizedQuery = normalize(deferredQuery);
    let entries: WordEntry[];

    if (!normalizedQuery) {
      entries = favoritesOnly
        ? [...favorites]
            .map((id) => wordsRef.current.get(id))
            .filter((entry): entry is WordEntry => Boolean(entry))
        : curatedWords;
    } else {
      const results = indexRef.current
        .search(normalizedQuery, {
          prefix: true,
          fuzzy: normalizedQuery.length >= 3 ? 0.2 : false,
          combineWith: "AND",
        })
        .slice(0, dictionaryState === "ready" ? 80 : 48);
      entries = results
        .map((result) => wordsRef.current.get(String(result.id)))
        .filter((entry): entry is WordEntry => Boolean(entry))
        .sort((a, b) => {
          const aWord = normalize(a.word);
          const bWord = normalize(b.word);
          const aRank = aWord === normalizedQuery ? 0 : aWord.startsWith(normalizedQuery) ? 1 : 2;
          const bRank = bWord === normalizedQuery ? 0 : bWord.startsWith(normalizedQuery) ? 1 : 2;
          if (aRank !== bRank) return aRank - bRank;
          if (a.curated !== b.curated) return a.curated ? -1 : 1;
          return a.word.localeCompare(b.word, "ko-KR");
        });
    }

    if (selectedMoods.size > 0) {
      entries = entries.filter((entry) =>
        entry.moods.some((mood) => selectedMoods.has(mood)),
      );
    }

    const seen = new Set<string>();
    return entries
      .filter((entry) => {
        const key = `${entry.word}:${entry.definition}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 36);
  }, [deferredQuery, favorites, favoritesOnly, selectedMoods, dictionaryState]);

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
    setFavoritesOnly(false);
  }

  function toggleFavorite(id: string) {
    setFavorites((current) => {
      const next = new Set(current);
      const word = wordsRef.current.get(id);
      if (next.has(id)) {
        next.delete(id);
        setAnnouncement(`${word?.word ?? "단어"} 찜을 해제했습니다.`);
      } else {
        next.add(id);
        setAnnouncement(`${word?.word ?? "단어"}을 찜했습니다.`);
      }
      return next;
    });
  }

  function openWord(entry: WordEntry) {
    setSelectedWord(entry);
    const url = new URL(window.location.href);
    url.searchParams.set("word", entry.id);
    window.history.pushState({}, "", url);
  }

  function closeWord() {
    setSelectedWord(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("word");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
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
      } else {
        await copyShareLink(entry);
      }
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
    setSelectedMoods(new Set());
    setFavoritesOnly(false);
  }

  return (
    <main>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <header className="site-header">
        <Link className="brand" href="/" aria-label="말결 홈">
          <span className="brand-mark" aria-hidden="true">
            ㅁ
          </span>
          <span>말결</span>
        </Link>
        <button
          className={`favorites-button ${favoritesOnly ? "is-active" : ""}`}
          type="button"
          aria-pressed={favoritesOnly}
          onClick={() => setFavoritesOnly((current) => !current)}
        >
          <Bookmark aria-hidden="true" size={17} fill={favoritesOnly ? "currentColor" : "none"} />
          찜한 낱말
          <span>{favorites.size}</span>
        </button>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">
            <Feather aria-hidden="true" size={15} />
            우리말 발견 사전
          </p>
          <h1 id="hero-title">
            마음에 오래 남는
            <br />
            <em>단어의 결</em>을 찾으세요.
          </h1>
          <p className="hero-description">
            쓰임을 기다리는 아름다운 한국어를 뜻과 분위기로 살펴보세요.
            이름과 문장에 꼭 맞는 한 단어가 여기 있습니다.
          </p>
        </div>
        <div className="hero-glyph" aria-hidden="true">
          <span>말</span>
          <i>결</i>
        </div>
      </section>

      <section className="search-section" aria-label="낱말 검색">
        <label className="search-box">
          <Search aria-hidden="true" size={22} />
          <span className="sr-only">뜻이나 느낌으로 검색</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setFavoritesOnly(false);
            }}
            onFocus={() => void loadDictionary()}
            placeholder="뜻이나 느낌을 입력해 보세요"
            autoComplete="off"
          />
          {query ? (
            <button type="button" aria-label="검색어 지우기" onClick={() => setQuery("")}>
              <X aria-hidden="true" size={18} />
            </button>
          ) : (
            <kbd>⌘ K</kbd>
          )}
        </label>

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
                {selectedMoods.has(mood) && <Check aria-hidden="true" size={13} />}
                {mood}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="featured-section" aria-labelledby="today-title">
        <article className="today-card">
          <div>
            <p className="card-label" id="today-title">
              <Sparkles aria-hidden="true" size={15} />
              오늘의 단어
            </p>
            <button type="button" className="today-word" onClick={() => openWord(todayWord)}>
              {todayWord.word}
            </button>
            <p>{todayWord.definition}</p>
          </div>
          <div className="today-actions">
            <button type="button" onClick={() => openWord(todayWord)}>
              자세히 보기 <ArrowRight aria-hidden="true" size={16} />
            </button>
            <button
              type="button"
              aria-label={`${todayWord.word} ${favorites.has(todayWord.id) ? "찜 해제" : "찜하기"}`}
              onClick={() => toggleFavorite(todayWord.id)}
            >
              <Heart
                aria-hidden="true"
                size={17}
                fill={favorites.has(todayWord.id) ? "currentColor" : "none"}
              />
            </button>
            <button
              type="button"
              aria-label={`${todayWord.word} 공유`}
              onClick={() => void shareWord(todayWord)}
            >
              <Share2 aria-hidden="true" size={17} />
            </button>
          </div>
        </article>

        <aside className="editor-note">
          <p className="card-label">말결의 제안</p>
          <blockquote>“{todayWord.editorialNote}”</blockquote>
          <div className="use-list">
            {todayWord.creativeUses.map((use) => (
              <span key={use}># {use}</span>
            ))}
          </div>
        </aside>
      </section>

      <section className="collection-section" aria-labelledby="collection-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">고른 낱말 120</p>
            <h2 id="collection-title">
              {favoritesOnly
                ? "내가 고른 낱말"
                : deferredQuery
                  ? `‘${deferredQuery}’ 검색 결과`
                  : selectedMoods.size
                    ? "선택한 분위기의 낱말"
                    : "오늘 펼쳐 볼 낱말"}
            </h2>
          </div>
          <p>
            {visibleWords.length}개의 낱말
            {dictionaryState === "loading" && <span> · 사전을 펼치는 중</span>}
            {dictionaryState === "ready" && deferredQuery && <span> · 사전 전체 검색</span>}
          </p>
        </div>

        {visibleWords.length > 0 ? (
          <div className="word-grid">
            {visibleWords.map((entry) => (
              <WordCard
                key={entry.id}
                entry={entry}
                favorite={favorites.has(entry.id)}
                onOpen={openWord}
                onFavorite={toggleFavorite}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span aria-hidden="true">빈</span>
            <h3>아직 맞는 낱말을 찾지 못했어요.</h3>
            <p>검색어를 조금 짧게 쓰거나 다른 분위기를 골라 보세요.</p>
            <button type="button" onClick={resetSearch}>
              <RotateCcw aria-hidden="true" size={16} />
              처음부터 다시 찾기
            </button>
          </div>
        )}
      </section>

      <footer>
        <div>
          <Link className="brand footer-brand" href="/">
            <span className="brand-mark" aria-hidden="true">
              ㅁ
            </span>
            <span>말결</span>
          </Link>
          <p>우리말의 좋은 결을 오래 들여다봅니다.</p>
        </div>
        <p className="license-copy">
          사전 자료: 국립국어원 한국어기초사전 · CC BY-SA 2.0 KR
          <br />
          예문과 음성·이미지 자료는 포함하지 않습니다.
        </p>
        <div className="footer-links">
          <a href="https://github.com/spellcheck-ko/korean-dict-nikl">데이터 출처</a>
          <a href="https://creativecommons.org/licenses/by-sa/2.0/kr/">라이선스</a>
        </div>
      </footer>

      {selectedWord && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={closeWord}>
          <section
            className="word-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-header">
              <span>{selectedWord.curated ? "말결이 고른 낱말" : "한국어기초사전"}</span>
              <button
                ref={closeButtonRef}
                className="dialog-close"
                type="button"
                aria-label="단어 상세 닫기"
                onClick={closeWord}
              >
                <X aria-hidden="true" size={21} />
              </button>
            </div>
            <div className="dialog-content">
              <div className="dialog-word-row">
                <div>
                  <p className="part-of-speech">{selectedWord.partOfSpeech}</p>
                  <h2 id="dialog-title">{selectedWord.word}</h2>
                  {selectedWord.pronunciation && <p>[{selectedWord.pronunciation}]</p>}
                </div>
                <button
                  className={`dialog-heart ${favorites.has(selectedWord.id) ? "is-favorite" : ""}`}
                  type="button"
                  aria-label={`${selectedWord.word} ${
                    favorites.has(selectedWord.id) ? "찜 해제" : "찜하기"
                  }`}
                  aria-pressed={favorites.has(selectedWord.id)}
                  onClick={() => toggleFavorite(selectedWord.id)}
                >
                  <Heart
                    aria-hidden="true"
                    size={22}
                    fill={favorites.has(selectedWord.id) ? "currentColor" : "none"}
                  />
                </button>
              </div>

              <div className="definition-block">
                <span>뜻</span>
                <p>{selectedWord.definition}</p>
              </div>

              {selectedWord.editorialNote && (
                <div className="editorial-block">
                  <span>말결의 해설</span>
                  <p>{selectedWord.editorialNote}</p>
                </div>
              )}

              {selectedWord.moods.length > 0 && (
                <div className="tag-block">
                  <span>분위기</span>
                  <div>
                    {selectedWord.moods.map((mood) => (
                      <button
                        type="button"
                        key={mood}
                        onClick={() => {
                          setSelectedMoods(new Set([mood]));
                          closeWord();
                        }}
                      >
                        {mood}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedWord.creativeUses.length > 0 && (
                <div className="tag-block">
                  <span>이런 곳에 어울려요</span>
                  <div>
                    {selectedWord.creativeUses.map((use) => (
                      <em key={use}># {use}</em>
                    ))}
                  </div>
                </div>
              )}

              <button
                className="share-button"
                type="button"
                onClick={() => void shareWord(selectedWord)}
              >
                <Share2 aria-hidden="true" size={17} />
                이 낱말 공유하기
              </button>

              {relatedWords.length > 0 && (
                <div className="related-block">
                  <span>같은 결의 낱말</span>
                  <div>
                    {relatedWords.map((entry) => (
                      <button type="button" key={entry.id} onClick={() => openWord(entry)}>
                        {entry.word}
                        <ArrowRight aria-hidden="true" size={14} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
