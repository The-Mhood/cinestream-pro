"use client";

import { useState } from "react";
import { Clapperboard, RefreshCw } from "lucide-react";

type Result = {
  fetched?: number;
  created?: number;
  updated?: number;
  note?: string;
  error?: string;
};

export default function TmdbCatalogueSyncPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function sync() {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/discovery/tmdb-sync", { method: "POST", cache: "no-store" });
      const payload = await response.json() as Result;
      setResult(response.ok ? payload : { error: payload.error || "TMDB catalogue sync failed." });
    } catch {
      setResult({ error: "Could not reach the TMDB catalogue sync endpoint." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-8 rounded-2xl border border-sky-500/25 bg-[#0c1728] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sky-300">
            <Clapperboard className="h-4 w-4" />
            <h2 className="font-display text-lg font-bold text-white">Populate Movie & Series Catalogue</h2>
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-300">
            Import trending and popular movies and series from TMDB into the CineStream homepage.
            This fills the catalogue with real titles, posters and metadata; it does not create video streams.
          </p>
        </div>
        <button type="button" onClick={sync} disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-sky-400 px-5 py-3 text-xs font-bold text-slate-950 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Importing catalogue…" : "Import movies & series"}
        </button>
      </div>
      {result && (
        <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950/70 p-4 text-xs text-slate-200">
          {result.error ? <p className="text-red-300">{result.error}</p> : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <p><strong className="block text-xl text-white">{result.fetched ?? 0}</strong>Titles fetched</p>
                <p><strong className="block text-xl text-emerald-300">{result.created ?? 0}</strong>New titles</p>
                <p><strong className="block text-xl text-white">{result.updated ?? 0}</strong>Updated titles</p>
              </div>
              <p className="mt-3 text-slate-400">{result.note}</p>
              <p className="mt-2 text-sky-200">Open the homepage to see the imported catalogue.</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
