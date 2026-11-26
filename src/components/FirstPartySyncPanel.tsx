"use client";

import { useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";

type SyncResult = {
  ok?: boolean;
  providers?: number;
  titlesCreated?: number;
  titlesUpdated?: number;
  sourcesAdded?: number;
  sourcesSkipped?: number;
  missingProviders?: string[];
  errors?: string[];
  note?: string;
  error?: string;
};

export default function FirstPartySyncPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  async function runSync() {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/discovery/sync", { method: "POST", cache: "no-store" });
      const payload = await response.json() as SyncResult;
      setResult(payload);
    } catch {
      setResult({ error: "Could not reach the catalogue sync endpoint." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-8 rounded-2xl border border-emerald-500/25 bg-[#0c1b1a] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-300">
            <ShieldCheck className="h-4 w-4" />
            <h2 className="font-display text-lg font-bold text-white">First-party Catalogue & Playback Sync</h2>
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-300">
            Synchronizes your configured site feeds into one catalogue and registers their direct media sources.
            New sources remain pending until server-side verification succeeds.
          </p>
        </div>
        <button type="button" onClick={runSync} disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-xs font-bold text-slate-950 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Syncing feeds…" : "Sync all four sites"}
        </button>
      </div>
      {result && (
        <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950/70 p-4 text-xs text-slate-200">
          {result.error ? <p className="text-red-300">{result.error}</p> : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <p><strong className="block text-xl text-white">{result.providers ?? 0}</strong>Feeds synced</p>
                <p><strong className="block text-xl text-white">{result.titlesCreated ?? 0}</strong>Titles added</p>
                <p><strong className="block text-xl text-white">{result.titlesUpdated ?? 0}</strong>Titles updated</p>
                <p><strong className="block text-xl text-emerald-300">{result.sourcesAdded ?? 0}</strong>Sources queued</p>
              </div>
              <p className="mt-3 text-slate-400">{result.note}</p>
              {(result.missingProviders?.length ?? 0) > 0 && <p className="mt-2 text-amber-300">Not configured: {result.missingProviders?.join(", ")}</p>}
              {(result.errors?.length ?? 0) > 0 && <ul className="mt-2 list-disc space-y-1 pl-4 text-amber-200">{result.errors?.map((error, index) => <li key={index}>{error}</li>)}</ul>}
            </>
          )}
        </div>
      )}
    </section>
  );
}
