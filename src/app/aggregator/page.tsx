"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  Clock,
  Database,
  Globe,
  Loader2,
  Radar,
  RefreshCw,
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

interface AggregatorData {
  providers: ProviderRow[];
  runs: AggregationRunRow[];
  stats: {
    totalTitles: number;
    totalSources: number;
    activeSources: number;
    offlineSources: number;
    avgLatencyMs: number;
  };
}

export default function AggregatorPage() {
  const [data, setData] = useState<AggregatorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncMessage, setLastSyncMessage] = useState<string | null>(null);

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

  const handleRunDiscovery = async () => {
    setSyncing(true);
    setLastSyncMessage(null);
    try {
      const res = await fetch("/api/aggregator/sync", { method: "POST" });
      const json = await res.json();
      if (res.ok && json.run) {
        setLastSyncMessage(json.run.summary);
        await fetchTelemetry();
      }
    } finally {
      setSyncing(false);
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
            Monitor upstream stream nodes, inspect mirror health latency, and
            run automated discovery scans into PostgreSQL.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
          >
            View Catalog
          </Link>
          <button
            type="button"
            onClick={handleRunDiscovery}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-300 disabled:opacity-60"
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {syncing ? "Scanning Providers..." : "Run Discovery Scan"}
          </button>
        </div>
      </div>

      {/* Sync Result Banner */}
      {lastSyncMessage && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-emerald-200">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{lastSyncMessage}</span>
          </div>
          <Link
            href="/"
            className="shrink-0 font-bold text-emerald-300 underline hover:text-white"
          >
            Browse Updated Catalog →
          </Link>
        </div>
      )}

      {/* KPI Grid */}
      {loading || !data ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-28 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60"
            />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
                Verified HLS &amp; MP4 endpoints
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
                Across healthy CDN mirrors
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
                Auto-bypassed by player failover
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
                  {data.runs.map((run) => (
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
