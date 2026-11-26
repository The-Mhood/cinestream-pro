"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  Clock,
  Play,
  Sparkles,
  Trash2,
  UserCheck,
} from "lucide-react";
import { useAuth } from "@/components/AuthContext";
import MovieCard, { CatalogItem } from "@/components/MovieCard";

interface WatchlistEntry {
  id: number;
  mediaId: number;
  inWatchlist: boolean;
  progressSeconds: number;
  lastWatchedAt: string;
  media: CatalogItem;
}

export default function WatchlistPage() {
  const { user, loading: authLoading, openAuthModal, loginDemo } = useAuth();
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/watchlist", { cache: "no-store" });
      const data = await res.json();
      setEntries(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading) {
      loadLibrary();
    }
  }, [authLoading, user, loadLibrary]);

  const handleRemove = async (mediaId: number) => {
    await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId, action: "toggle" }),
    });
    setEntries((prev) =>
      prev.map((e) =>
        e.mediaId === mediaId ? { ...e, inWatchlist: false } : e
      )
    );
  };

  const savedItems = entries.filter((e) => e.inWatchlist);
  const continueWatching = entries.filter((e) => e.progressSeconds > 5);

  if (!authLoading && !user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <div className="rounded-3xl border border-slate-800 bg-[#0f172a] p-10 shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-400">
            <Bookmark className="h-7 w-7" />
          </div>
          <h1 className="mt-5 font-display text-3xl font-extrabold text-white">
            Your Personal CineStream Library
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            Sign in to save your multi-provider watchlist, sync resume
            timestamps across sessions, and manage your preferred streaming
            mirrors.
          </p>

          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN === "true" && (
              <button
                type="button"
                onClick={loginDemo}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-300"
              >
                <Sparkles className="h-4 w-4" />
                Instant Demo Sign-In
              </button>
            )}
            <button
              type="button"
              onClick={() => openAuthModal("login")}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:border-slate-500"
            >
              <UserCheck className="h-4 w-4" />
              Sign In / Register
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-white">
            My Streaming Library
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Synced watchlist &amp; resume timestamps for{" "}
            <span className="font-semibold text-amber-400">{user?.name}</span>
          </p>
        </div>
        <Link
          href="/"
          className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-300"
        >
          Discover More Titles
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-72 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60"
            />
          ))}
        </div>
      ) : (
        <>
          {/* Continue Watching */}
          {continueWatching.length > 0 && (
            <section className="mb-12">
              <div className="mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-400" />
                <h2 className="font-display text-xl font-bold text-white">
                  Continue Watching
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {continueWatching.map((entry) => (
                  <Link
                    key={`cw-${entry.id}`}
                    href={`/watch/${entry.media.slug}`}
                    className="group flex overflow-hidden rounded-2xl border border-slate-800 bg-[#0f172a] transition hover:border-amber-400/50"
                  >
                    <img
                      src={entry.media.posterPath}
                      alt={entry.media.title}
                      className="h-32 w-24 shrink-0 object-cover"
                    />
                    <div className="flex flex-1 flex-col justify-between p-4">
                      <div>
                        <h3 className="font-display text-sm font-bold text-white group-hover:text-amber-400">
                          {entry.media.title}
                        </h3>
                        <p className="mt-1 text-xs text-slate-400">
                          Paused at {Math.floor(entry.progressSeconds / 60)}m{" "}
                          {entry.progressSeconds % 60}s
                        </p>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400">
                          <Play className="h-3.5 w-3.5 fill-amber-400" />
                          Resume Stream
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {(entry.media.activeSourceCount ?? 0) > 0 ? `${entry.media.activeSourceCount} verified servers` : "No verified servers"}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Saved Watchlist */}
          <section>
            <div className="mb-4 flex items-center gap-2">
              <Bookmark className="h-5 w-5 text-amber-400" />
              <h2 className="font-display text-xl font-bold text-white">
                Saved Watchlist ({savedItems.length})
              </h2>
            </div>

            {savedItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
                <p className="text-sm text-slate-400">
                  Your watchlist is empty. Browse the catalog and click{" "}
                  <strong className="text-white">Add to Watchlist</strong> on
                  any title.
                </p>
                <Link
                  href="/"
                  className="mt-4 inline-block rounded-xl bg-amber-400 px-5 py-2 text-xs font-bold text-slate-950"
                >
                  Browse Catalog
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {savedItems.map((entry) => (
                  <div key={entry.id} className="relative">
                    <MovieCard item={entry.media} />
                    <button
                      type="button"
                      onClick={() => handleRemove(entry.mediaId)}
                      title="Remove from watchlist"
                      className="absolute bottom-14 right-3 z-10 rounded-lg border border-slate-700 bg-slate-950/90 p-1.5 text-slate-400 transition hover:border-red-500/50 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
