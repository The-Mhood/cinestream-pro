"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Play,
  Bookmark,
  Check,
  Radar,
  Server,
  Star,
  Search,
  Sparkles,
  Film,
  Tv,
  SlidersHorizontal,
} from "lucide-react";
import MovieCard, { CatalogItem } from "./MovieCard";
import { useAuth } from "./AuthContext";

const GENRES = [
  "All",
  "Sci-Fi",
  "Action",
  "Fantasy",
  "Cyberpunk",
  "Mystery",
  "Animation",
  "Horror",
];

export default function CatalogExplorer({
  initialItems,
}: {
  initialItems: CatalogItem[];
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, openAuthModal } = useAuth();

  const urlType = searchParams.get("type") || "all";
  const urlQuery = searchParams.get("q") || "";

  const [items, setItems] = useState<CatalogItem[]>(initialItems);
  const [selectedType, setSelectedType] = useState<string>(urlType);
  const [selectedGenre, setSelectedGenre] = useState<string>("All");
  const [query, setQuery] = useState<string>(urlQuery);
  const [heroSaved, setHeroSaved] = useState(false);
  const [syncingHero, setSyncingHero] = useState(false);

  useEffect(() => {
    setSelectedType(urlType);
  }, [urlType]);

  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

  // Keep fresh catalog when navigating back after discovery sync
  useEffect(() => {
    fetch("/api/movies", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.items)) {
          setItems(data.items);
        }
      })
      .catch(() => {});
  }, []);

  const heroItem = useMemo(() => {
    return items.find((i) => i.slug === "tears-of-steel") ?? items[0];
  }, [items]);

  // Check if heroItem is in user's watchlist
  useEffect(() => {
    if (!user || !heroItem) {
      setHeroSaved(false);
      return;
    }
    fetch(`/api/movies/${heroItem.id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setHeroSaved(Boolean(d.inWatchlist)))
      .catch(() => {});
  }, [user, heroItem]);

  const handleToggleHeroWatchlist = async () => {
    if (!heroItem) return;
    if (!user) {
      openAuthModal("login");
      return;
    }
    setSyncingHero(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId: heroItem.id, action: "toggle" }),
      });
      const data = await res.json();
      if (res.ok) {
        setHeroSaved(Boolean(data.inWatchlist));
      }
    } finally {
      setSyncingHero(false);
    }
  };

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (selectedType !== "all" && item.type !== selectedType) return false;
      if (
        selectedGenre !== "All" &&
        !item.genres.toLowerCase().includes(selectedGenre.toLowerCase())
      ) {
        return false;
      }
      if (q) {
        const hay =
          `${item.title} ${item.overview} ${item.genres} ${item.castList}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, selectedType, selectedGenre, query]);

  const trendingItems = useMemo(
    () => items.filter((i) => i.isTrending),
    [items]
  );

  const showHero =
    !query.trim() && selectedType === "all" && selectedGenre === "All" && heroItem;

  return (
    <div className="pb-12">
      {/* Hero Banner */}
      {showHero && (
        <section className="relative overflow-hidden border-b border-slate-800/80 bg-[#060913]">
          <div className="relative mx-auto max-w-7xl">
            <div className="relative min-h-[460px] sm:min-h-[520px] flex items-end">
              <img
                src={heroItem.backdropPath}
                alt={heroItem.title}
                className="absolute inset-0 h-full w-full object-cover object-center opacity-55"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#090e1a] via-[#090e1a]/70 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#090e1a] via-[#090e1a]/75 to-transparent" />

              <div className="relative z-10 w-full max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-300 backdrop-blur-md">
                    <Sparkles className="h-3 w-3" />
                    Featured title
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-[11px] font-semibold text-emerald-300 backdrop-blur-md">
                    <Server className="h-3 w-3" />
                    {heroItem.activeSourceCount ?? 0} Active Mirrors
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] font-bold text-amber-400">
                    <Star className="h-3 w-3 fill-amber-400" />
                    {heroItem.rating.toFixed(1)}
                  </span>
                </div>

                <h1 className="font-display text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
                  {heroItem.title}
                </h1>

                <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-300 sm:text-base">
                  {heroItem.overview}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                  <span>{heroItem.releaseYear}</span>
                  <span>•</span>
                  <span>{heroItem.genres}</span>
                  <span>•</span>
                  <span className="font-semibold text-amber-400">
                    {heroItem.maxQuality && heroItem.maxQuality !== "Unverified" ? `${heroItem.maxQuality} verified` : "Sources unverified"}
                  </span>
                </div>

                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <Link
                    href={`/watch/${heroItem.slug}`}
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-6 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-300"
                  >
                    <Play className="h-4 w-4 fill-slate-950" />
                    Play Server 1
                  </Link>
                  <button
                    type="button"
                    onClick={handleToggleHeroWatchlist}
                    disabled={syncingHero}
                    className={`inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold transition ${
                      heroSaved
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                        : "border-slate-700 bg-slate-900/85 text-white hover:border-slate-500"
                    }`}
                  >
                    {heroSaved ? (
                      <>
                        <Check className="h-4 w-4" />
                        In Library
                      </>
                    ) : (
                      <>
                        <Bookmark className="h-4 w-4" />
                        Add to Watchlist
                      </>
                    )}
                  </button>
                  <Link
                    href="/aggregator"
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-xs font-semibold text-slate-300 transition hover:border-amber-400/40 hover:text-white"
                  >
                    <Radar className="h-4 w-4 text-amber-400" />
                    Source Watcher
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Main Content Container */}
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        {/* Trending Strip */}
        {showHero && trendingItems.length > 0 && (
          <section className="mb-12">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-5 w-1 rounded-full bg-amber-400" />
                <h2 className="font-display text-xl font-bold text-white">
                  Featured titles
                </h2>
              </div>
              <span className="text-xs font-medium text-slate-400">
                Featured catalogue selections
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {trendingItems.slice(0, 5).map((item) => (
                <MovieCard key={`trend-${item.id}`} item={item} />
              ))}
            </div>
          </section>
        )}

        {/* Filter & Search Bar */}
        <section className="mb-6 rounded-2xl border border-slate-800/90 bg-[#0f172a]/80 p-4 backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            {/* Type Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: "all", label: "All Titles", icon: SlidersHorizontal },
                { id: "movie", label: "Movies", icon: Film },
                { id: "series", label: "Series", icon: Tv },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = selectedType === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setSelectedType(tab.id);
                      if (tab.id === "all") {
                        router.replace("/");
                      } else {
                        router.replace(`/?type=${tab.id}`);
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                      active
                        ? "bg-amber-400 text-slate-950"
                        : "bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Inline Filter Input */}
            <div className="relative w-full md:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter catalog by title or cast..."
                className="w-full rounded-xl border border-slate-700/80 bg-slate-900 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-400 outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Genre Pills */}
          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
            {GENRES.map((genre) => {
              const active = selectedGenre === genre;
              return (
                <button
                  key={genre}
                  type="button"
                  onClick={() => setSelectedGenre(genre)}
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition ${
                    active
                      ? "border-amber-400/50 bg-amber-400/15 text-amber-300"
                      : "border-slate-800 bg-slate-900/70 text-slate-400 hover:border-slate-700 hover:text-white"
                  }`}
                >
                  {genre}
                </button>
              );
            })}
          </div>
        </section>

        {/* Full Catalog Grid */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-white">
              {query.trim()
                ? `Search Results for "${query.trim()}"`
                : selectedType === "movie"
                  ? "Aggregated Movies"
                  : selectedType === "series"
                    ? "Aggregated Series"
                    : "All Aggregated Releases"}
            </h2>
            <span className="text-xs text-slate-400">
              {filteredItems.length}{" "}
              {filteredItems.length === 1 ? "title" : "titles"} indexed
            </span>
          </div>

          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 py-16 text-center">
              <Film className="h-10 w-10 text-slate-600" />
              <h3 className="mt-3 font-display text-lg font-bold text-white">
                No matching titles found
              </h3>
              <p className="mt-1 max-w-md text-xs text-slate-400">
                Try clearing your genre or search filter, or run a fresh Source
                Discovery scan in the Aggregator Hub.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSelectedType("all");
                  setSelectedGenre("All");
                  router.replace("/");
                }}
                className="mt-4 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {filteredItems.map((item) => (
                <MovieCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
