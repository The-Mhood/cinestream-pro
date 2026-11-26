"use client";

import React, { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Bookmark,
  Check,
  Clock,
  Film,
  Plus,
  Server,
  ShieldAlert,
  Star,
  Tv,
  Wifi,
  WifiOff,
  Loader2,
} from "lucide-react";
import VideoPlayer, { StreamSourceItem } from "./VideoPlayer";
import { CatalogItem } from "./MovieCard";
import { useAuth } from "./AuthContext";

interface WatchViewProps {
  media: CatalogItem;
  initialSources: StreamSourceItem[];
  initialInWatchlist: boolean;
  initialProgressSeconds: number;
  initialServerId: number | null;
}

export default function WatchView({
  media,
  initialSources,
  initialInWatchlist,
  initialProgressSeconds,
  initialServerId,
}: WatchViewProps) {
  const { user, openAuthModal } = useAuth();
  const [sources, setSources] = useState<StreamSourceItem[]>(initialSources);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [selectedEpisode, setSelectedEpisode] = useState<number>(1);

  const episodeSources = useMemo(() => {
    if (media.type !== "series") return sources;
    const filtered = sources.filter(
      (s) => s.season === selectedSeason && s.episode === selectedEpisode
    );
    return filtered.length > 0 ? filtered : sources;
  }, [sources, media.type, selectedSeason, selectedEpisode]);

  const defaultSource = useMemo(() => {
    if (initialServerId) {
      const match = episodeSources.find((s) => s.id === initialServerId);
      if (match && match.status === "active") return match;
    }
    return (
      episodeSources.find((s) => s.status === "active") ?? episodeSources[0]
    );
  }, [episodeSources, initialServerId]);

  const [activeSourceId, setActiveSourceId] = useState<number>(
    defaultSource?.id ?? 0
  );
  const [autoPlay, setAutoPlay] = useState(false);
  const [failoverNotice, setFailoverNotice] = useState<string | null>(null);
  const [probingId, setProbingId] = useState<number | null>(null);
  const [inWatchlist, setInWatchlist] = useState(initialInWatchlist);
  const [togglingWatchlist, setTogglingWatchlist] = useState(false);

  // Add custom mirror state
  const [showAddSource, setShowAddSource] = useState(false);
  const [customProvider, setCustomProvider] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [customQuality, setCustomQuality] = useState("1080p");
  const [customFormat, setCustomFormat] = useState("HLS");
  const [addingSource, setAddingSource] = useState(false);

  const activeSource = useMemo(() => {
    return (
      episodeSources.find((s) => s.id === activeSourceId) ??
      episodeSources[0] ??
      sources[0]
    );
  }, [episodeSources, activeSourceId, sources]);

  const seasonsList = useMemo(() => {
    return Array.from({ length: media.seasonsCount || 1 }, (_, i) => i + 1);
  }, [media.seasonsCount]);

  const episodesList = useMemo(() => {
    const epsForSeason = sources.filter((s) => s.season === selectedSeason);
    const maxEp = Math.max(
      media.type === "series" ? 1 : 1,
      ...epsForSeason.map((s) => s.episode)
    );
    return Array.from({ length: maxEp }, (_, i) => i + 1);
  }, [sources, selectedSeason, media.type]);

  const handleSelectServer = (src: StreamSourceItem) => {
    setFailoverNotice(null);
    setActiveSourceId(src.id);
    setAutoPlay(true);
  };

  const handleServerError = useCallback(
    (failedSource: StreamSourceItem) => {
      // Mark source offline in UI & backend
      setSources((prev) =>
        prev.map((s) =>
          s.id === failedSource.id
            ? { ...s, status: "offline", isActive: false }
            : s
        )
      );

      // Find next healthy fallback server
      const fallback = episodeSources.find(
        (s) => s.id !== failedSource.id && s.status === "active"
      );

      if (fallback) {
        setFailoverNotice(
          `${failedSource.serverLabel} failed to respond — automatically failing over to ${fallback.serverLabel} (${fallback.quality}).`
        );
        setActiveSourceId(fallback.id);
        setAutoPlay(true);
      } else {
        setFailoverNotice(
          `${failedSource.serverLabel} is offline and no healthy backup mirror was found.`
        );
      }
    },
    [episodeSources]
  );

  const handleProgressUpdate = useCallback(
    (seconds: number) => {
      if (!user || !activeSource) return;
      fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaId: media.id,
          action: "progress",
          progressSeconds: seconds,
          lastServerId: activeSource.id,
        }),
      }).catch(() => {});
    },
    [user, media.id, activeSource]
  );

  const handleProbeHealth = async (sourceId: number) => {
    setProbingId(sourceId);
    try {
      const res = await fetch(`/api/stream/health?sourceId=${sourceId}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (data.source) {
        setSources((prev) =>
          prev.map((s) => (s.id === sourceId ? data.source : s))
        );
      }
    } finally {
      setProbingId(null);
    }
  };

  const handleToggleWatchlist = async () => {
    if (!user) {
      openAuthModal("login");
      return;
    }
    setTogglingWatchlist(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId: media.id, action: "toggle" }),
      });
      const data = await res.json();
      if (res.ok) {
        setInWatchlist(Boolean(data.inWatchlist));
      }
    } finally {
      setTogglingWatchlist(false);
    }
  };

  const handleAddCustomSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customProvider.trim() || !customUrl.trim()) return;
    setAddingSource(true);
    try {
      const res = await fetch("/api/movies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaId: media.id,
          providerName: customProvider.trim(),
          serverLabel: `Custom • ${customProvider.trim()}`,
          url: customUrl.trim(),
          quality: customQuality,
          format: customFormat,
          season: selectedSeason,
          episode: selectedEpisode,
        }),
      });
      const data = await res.json();
      if (res.ok && data.source) {
        setSources((prev) => [...prev, data.source]);
        setActiveSourceId(data.source.id);
        setCustomProvider("");
        setCustomUrl("");
        setShowAddSource(false);
      }
    } finally {
      setAddingSource(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 transition hover:text-amber-400"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Catalog
        </Link>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="rounded-md bg-slate-800/80 px-2 py-1 font-medium text-slate-300">
            Indexed via {media.discoveredVia}
          </span>
          {initialProgressSeconds > 10 && (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1 font-semibold text-amber-300">
              <Clock className="h-3.5 w-3.5" />
              Resuming at {Math.floor(initialProgressSeconds / 60)}m{" "}
              {initialProgressSeconds % 60}s
            </span>
          )}
        </div>
      </div>

      {/* Main Player */}
      {activeSource ? (
        <VideoPlayer
          source={activeSource}
          poster={media.backdropPath}
          title={
            media.type === "series"
              ? `${media.title} — S${selectedSeason}E${selectedEpisode}`
              : media.title
          }
          initialTime={initialProgressSeconds}
          autoPlay={autoPlay}
          failoverNotice={failoverNotice}
          onServerError={handleServerError}
          onProgressUpdate={handleProgressUpdate}
        />
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-sm text-slate-400">
          No streaming sources available for this selection.
        </div>
      )}

      {/* Series Season/Episode Selector */}
      {media.type === "series" && (
        <section className="mt-6 rounded-2xl border border-slate-800/90 bg-[#0f172a] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Tv className="h-4 w-4 text-amber-400" />
              <h2 className="font-display text-base font-bold text-white">
                Episodes &amp; Seasons
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {seasonsList.map((sNum) => (
                <button
                  key={sNum}
                  type="button"
                  onClick={() => {
                    setSelectedSeason(sNum);
                    setSelectedEpisode(1);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    selectedSeason === sNum
                      ? "bg-amber-400 text-slate-950"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  Season {sNum}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {episodesList.map((epNum) => {
              const active = selectedEpisode === epNum;
              return (
                <button
                  key={epNum}
                  type="button"
                  onClick={() => {
                    setSelectedEpisode(epNum);
                    const nextEpSource = sources.find(
                      (s) =>
                        s.season === selectedSeason &&
                        s.episode === epNum &&
                        s.status === "active"
                    );
                    if (nextEpSource) {
                      setActiveSourceId(nextEpSource.id);
                      setAutoPlay(true);
                    }
                  }}
                  className={`rounded-xl border px-4 py-2 text-xs font-semibold transition ${
                    active
                      ? "border-amber-400 bg-amber-400/15 text-amber-300"
                      : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700 hover:text-white"
                  }`}
                >
                  Episode {epNum}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Multi-Provider Server Switcher */}
      <section className="mt-6 rounded-2xl border border-slate-800/90 bg-[#0f172a] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-amber-400" />
              <h2 className="font-display text-lg font-bold text-white">
                Aggregated Streaming Servers
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Switch mirrors instantaneously. If a mirror fails, CineStream
              automatically fails over to the next healthy source.
            </p>
          </div>

          {user?.role === "admin" && (
            <button
              type="button"
              onClick={() => setShowAddSource((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:border-amber-400/50 hover:text-white"
            >
              <Plus className="h-3.5 w-3.5 text-amber-400" />
              Add Mirror URL
            </button>
          )}
        </div>

        {/* Optional Add Custom Mirror Drawer */}
        {user?.role === "admin" && showAddSource && (
          <form
            onSubmit={handleAddCustomSource}
            className="mb-5 grid grid-cols-1 gap-3 rounded-xl border border-slate-700/80 bg-slate-900/90 p-4 sm:grid-cols-2 lg:grid-cols-5"
          >
            <input
              type="text"
              required
              value={customProvider}
              onChange={(e) => setCustomProvider(e.target.value)}
              placeholder="Provider (e.g. FlixHQ)"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-400"
            />
            <input
              type="url"
              required
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="https://.../playlist.m3u8"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-400 lg:col-span-2"
            />
            <div className="flex gap-2">
              <select
                value={customQuality}
                onChange={(e) => setCustomQuality(e.target.value)}
                className="w-1/2 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white outline-none"
              >
                <option value="4K">4K</option>
                <option value="1080p">1080p</option>
                <option value="720p">720p</option>
              </select>
              <select
                value={customFormat}
                onChange={(e) => setCustomFormat(e.target.value)}
                className="w-1/2 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white outline-none"
              >
                <option value="HLS">HLS</option>
                <option value="MP4">MP4</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={addingSource}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-300 disabled:opacity-60"
            >
              {addingSource && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Mirror
            </button>
          </form>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {episodeSources.map((src) => {
            const isSelected = activeSource?.id === src.id;
            const isHealthy = src.status === "active";

            return (
              <div
                key={src.id}
                className={`flex flex-col justify-between rounded-xl border p-3.5 transition ${
                  isSelected
                    ? "border-amber-400 bg-amber-400/10 shadow-lg shadow-amber-500/5"
                    : isHealthy
                      ? "border-slate-800 bg-slate-900/70 hover:border-slate-700"
                      : "border-red-500/20 bg-red-950/15 hover:border-red-500/40"
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleSelectServer(src)}
                  className="flex w-full items-start justify-between gap-2 text-left"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      {isHealthy ? (
                        <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <WifiOff className="h-3.5 w-3.5 text-red-400" />
                      )}
                      <span className="text-sm font-bold text-white">
                        {src.serverLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {src.providerName} • {src.language}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-200">
                      {src.quality}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                        src.format === "HLS"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-sky-500/20 text-sky-300"
                      }`}
                    >
                      {src.format}
                    </span>
                  </div>
                </button>

                <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-2.5 text-[11px]">
                  <span
                    className={`font-medium ${
                      isHealthy ? "text-emerald-400" : src.status === "pending" ? "text-amber-300" : "text-red-400"
                    }`}
                  >
                    {isHealthy
                      ? `Server-verified • ${src.latencyMs}ms`
                      : src.status === "pending"
                        ? "Awaiting server verification"
                        : "Offline"}
                  </span>

                  {user?.role === "admin" && (
                    <button
                      type="button"
                      onClick={() => handleProbeHealth(src.id)}
                      disabled={probingId === src.id}
                      className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-300 transition hover:bg-slate-700 hover:text-white disabled:opacity-50"
                    >
                      <Activity
                        className={`h-3 w-3 ${
                          probingId === src.id ? "animate-pulse text-amber-400" : ""
                        }`}
                      />
                      {probingId === src.id ? "Verifying..." : "Verify Source"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Media Metadata & Cast */}
      <section className="mt-6 rounded-2xl border border-slate-800/90 bg-[#0f172a] p-6">
        <div className="flex flex-col gap-6 md:flex-row">
          <img
            src={media.posterPath}
            alt={media.title}
            className="h-64 w-44 shrink-0 rounded-xl border border-slate-800 object-cover shadow-lg"
          />

          <div className="flex-1">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold uppercase text-amber-300">
                    <Film className="h-3 w-3" />
                    {media.type}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-400">
                    <Star className="h-3.5 w-3.5 fill-amber-400" />
                    {media.rating.toFixed(1)} / 10
                  </span>
                  <span className="text-xs text-slate-400">
                    {media.releaseYear} • {media.durationMinutes} min
                  </span>
                </div>
                <h1 className="mt-2 font-display text-3xl font-extrabold text-white">
                  {media.title}
                </h1>
              </div>

              <button
                type="button"
                onClick={handleToggleWatchlist}
                disabled={togglingWatchlist}
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition ${
                  inWatchlist
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    : "border-slate-700 bg-slate-800 text-white hover:border-amber-400/50"
                }`}
              >
                {inWatchlist ? (
                  <>
                    <Check className="h-4 w-4" />
                    Saved in Library
                  </>
                ) : (
                  <>
                    <Bookmark className="h-4 w-4" />
                    Add to Watchlist
                  </>
                )}
              </button>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              {media.overview}
            </p>

            <div className="mt-6 grid grid-cols-1 gap-4 border-t border-slate-800 pt-4 text-xs sm:grid-cols-3">
              <div>
                <span className="block text-slate-500">Genres</span>
                <span className="mt-1 block font-semibold text-slate-200">
                  {media.genres}
                </span>
              </div>
              <div>
                <span className="block text-slate-500">Featured Cast</span>
                <span className="mt-1 block font-semibold text-slate-200">
                  {media.castList}
                </span>
              </div>
              <div>
                <span className="block text-slate-500">Aggregation Node</span>
                <span className="mt-1 inline-flex items-center gap-1 font-semibold text-emerald-300">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Ad-Free Verified Streams
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
