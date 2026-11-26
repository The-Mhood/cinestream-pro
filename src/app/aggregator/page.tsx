"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthContext";
import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  Clock,
  Database,
  Globe,
  Loader2,
  Radar,
  Server,
  Sparkles,
  WifiOff,
} from "lucide-react";

interface ProviderRow {
  id: number;
  slug: string;
  name: string;
  baseUrl: string;
  status: string;
  avgLatencyMs: number;
  uptimePercent: number;
  totalStreamsIndexed: number;
  lastCheckedAt: string;
}

interface AggregationRunRow {
  id: number;
  startedAt: string;
  completedAt: string;
  providersScanned: number;
  titlesDiscovered: number;
  sourcesVerified: number;
  status: string;
  summary: string;
}

interface DiscoveryPageResult {
  url: string;
  title: string;
  depth: number;
  internal_links: string[];
  media_references: string[];
  external_embed_hosts: string[];
}

interface DiscoveryReport {
  pages_crawled: number;
  skipped: number;
  errors: string[];
  pages: DiscoveryPageResult[];
}

interface AggregatorData {
  providers: ProviderRow[];
  runs: AggregationRunRow[];
  stats: {
    totalTitles: number;
    totalSources: number;
    activeSources: number;
    offlineSources: number;
    pendingSources: number;
    avgLatencyMs: number;
  };
}

export default function AggregatorPage() {
  const { user } = useAuth();
  const [data, setData] = useState<AggregatorData | null>(null);
  const [crawlStartUrl, setCrawlStartUrl] = useState("");
  const [crawlReport, setCrawlReport] = useState<DiscoveryReport | null>(null);
  const [crawlError, setCrawlError] = useState<string | null>(null);
  const [crawling, setCrawling] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchTelemetry = useCallback(async () => {
    try {
      const res = await fetch("/api/aggregator", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTelemetry();
  }, [fetchTelemetry]);

  const handleAuthorizedCrawl = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCrawling(true);
    setCrawlError(null);
    setCrawlReport(null);
    try {
      const response = await fetch("/api/discovery/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_urls: [crawlStartUrl.trim()],
          max_pages: 50,
          max_depth: 2,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Authorized discovery failed");
      setCrawlReport(result as DiscoveryReport);
    } catch (error) {
      setCrawlError(error instanceof Error ? error.message : "Authorized discovery failed");
    } finally {
      setCrawling(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 flex flex-col justify-between gap-4 border-b border-slate-800/80 pb-6 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-400">
            <Radar className="h-4 w-4" />
            Source Watcher Engine
          </div>
          <h1 className="mt-1 font-display text-3xl font-extrabold text-white">
            Multi-Provider Aggregator Hub
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Inspect stored provider telemetry and inventory websites within an
            explicitly authorized discovery scope.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
          >
            View Catalog
          </Link>
        </div>
      </div>

      {user?.role === "admin" && (
        <section className="mb-8 rounded-2xl border border-sky-500/25 bg-[#0c1628] p-6">
          <div className="mb-4">
            <h2 className="font-display text-lg font-bold text-white">Authorized Site Discovery</h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Crawl domains in the backend allowlist. Inventory page links, in-scope
              HLS/DASH/MP4/WebM references and third-party embed hostnames. External
              embeds are not fetched.
            </p>
          </div>
          <form onSubmit={handleAuthorizedCrawl} className="flex flex-col gap-3 sm:flex-row">
            <input
              type="url"
              required
              value={crawlStartUrl}
              onChange={(event) => setCrawlStartUrl(event.target.value)}
              placeholder="https://your-authorized-domain.example/"
              className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400"
            />
            <button
              type="submit"
              disabled={crawling}
              className="rounded-xl bg-sky-400 px-5 py-3 text-xs font-bold text-slate-950 disabled:opacity-60"
            >
              {crawling ? "Crawling..." : "Start authorized crawl (50 pages)"}
            </button>
          </form>
          <p className="mt-2 text-[11px] text-slate-500">
            Admin only. Scope is enforced by DISCOVERY_ALLOWED_HOSTS. Maximum depth: 2.
          </p>
          {crawlError && (
            <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
              {crawlError}
            </p>
          )}
          {crawlReport && (
            <div className="mt-5 space-y-3">
              <div className="flex flex-wrap gap-4 text-xs text-slate-300">
                <span><strong className="text-white">{crawlReport.pages_crawled}</strong> pages</span>
                <span><strong className="text-sky-300">{crawlReport.pages.reduce((n, p) => n + p.media_references.length, 0)}</strong> media references</span>
                <span><strong className="text-amber-300">{new Set(crawlReport.pages.flatMap((p) => p.external_embed_hosts)).size}</strong> external embed hosts</span>
                <span><strong className="text-white">{crawlReport.skipped}</strong> skipped</span>
              </div>
              {crawlReport.errors.map((error, index) => (
                <p key={index} className="text-[11px] text-amber-200">{error}</p>
              ))}
              {crawlReport.pages.map((page) => (
                <article key={page.url} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-sm font-semibold text-white">{page.title || "Untitled page"}</p>
                  <a href={page.url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-[11px] text-sky-300 hover:underline">
                    {page.url}
                  </a>
                  {page.media_references.map((mediaUrl) => (
                    <a key={mediaUrl} href={mediaUrl} target="_blank" rel="noreferrer" className="mt-2 block break-all text-[11px] text-emerald-300 hover:underline">
                      {mediaUrl}
                    </a>
                  ))}
                  {page.external_embed_hosts.length > 0 && (
                    <p className="mt-2 break-all text-[11px] text-amber-200/80">
                      External embed hosts (not fetched): {page.external_embed_hosts.join(", ")}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* KPI Grid */}
      {loading || !data ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((n) => (
            <div
              key={n}
              className="h-28 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60"
            />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Indexed Titles</span>
                <Database className="h-4 w-4 text-amber-400" />
              </div>
              <p className="mt-2 font-display text-3xl font-extrabold text-white">
                {data.stats.totalTitles}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Normalized movies &amp; series
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Active Mirrors</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="mt-2 font-display text-3xl font-extrabold text-emerald-400">
                {data.stats.activeSources}
                <span className="ml-1.5 text-sm font-medium text-slate-500">
                  / {data.stats.totalSources}
                </span>
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Configured HLS &amp; MP4 sources
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Avg Edge Latency</span>
                <Activity className="h-4 w-4 text-sky-400" />
              </div>
              <p className="mt-2 font-display text-3xl font-extrabold text-white">
                {data.stats.avgLatencyMs}
                <span className="ml-1 text-sm font-medium text-slate-400">
                  ms
                </span>
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Based on stored provider telemetry
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Degraded / Offline</span>
                <WifiOff className="h-4 w-4 text-red-400" />
              </div>
              <p className="mt-2 font-display text-3xl font-extrabold text-red-400">
                {data.stats.offlineSources}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Failed server-side verification
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Pending Verification</span>
                <Clock className="h-4 w-4 text-amber-400" />
              </div>
              <p className="mt-2 font-display text-3xl font-extrabold text-amber-300">
                {data.stats.pendingSources}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Not yet checked by the server
              </p>
            </div>
          </div>

          {/* Upstream Provider Registry */}
          <section className="mt-8 rounded-2xl border border-slate-800 bg-[#0f172a] p-6">
            <div className="mb-4 flex items-center gap-2">
              <Globe className="h-5 w-5 text-amber-400" />
              <h2 className="font-display text-lg font-bold text-white">
                Registered Upstream Providers
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {data.providers.map((prov) => {
                const isActive = prov.status === "active";
                return (
                  <div
                    key={prov.id}
                    className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-display text-sm font-bold text-white">
                          {prov.name}
                        </h3>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">
                          {prov.baseUrl}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                          isActive
                            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                            : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                        }`}
                      >
                        {prov.status}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-800 pt-3 text-center text-xs">
                      <div>
                        <span className="block text-[10px] text-slate-500">
                          Latency
                        </span>
                        <span className="font-bold text-slate-200">
                          {prov.avgLatencyMs}ms
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500">
                          Uptime
                        </span>
                        <span className="font-bold text-emerald-400">
                          {prov.uptimePercent}%
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500">
                          Streams
                        </span>
                        <span className="font-bold text-amber-400">
                          {prov.totalStreamsIndexed}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Aggregation Run History */}
          <section className="mt-8 rounded-2xl border border-slate-800 bg-[#0f172a] p-6">
            <div className="mb-4 flex items-center gap-2">
              <Server className="h-5 w-5 text-amber-400" />
              <h2 className="font-display text-lg font-bold text-white">
                Recent Source Watcher Runs
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="pb-3 font-semibold">Run ID</th>
                    <th className="pb-3 font-semibold">Timestamp</th>
                    <th className="pb-3 font-semibold">Providers</th>
                    <th className="pb-3 font-semibold">New Titles</th>
                    <th className="pb-3 font-semibold">Verified Streams</th>
                    <th className="pb-3 font-semibold">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {data.runs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500">
                        No aggregation runs have been recorded yet.
                      </td>
                    </tr>
                  ) : data.runs.map((run) => (
                    <tr key={run.id} className="text-slate-300">
                      <td className="py-3 font-mono text-amber-400">
                        #{run.id}
                      </td>
                      <td className="py-3 whitespace-nowrap text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(run.startedAt).toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3">{run.providersScanned}</td>
                      <td className="py-3 font-bold text-emerald-400">
                        +{run.titlesDiscovered}
                      </td>
                      <td className="py-3">{run.sourcesVerified}</td>
                      <td className="py-3 text-slate-300">{run.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
