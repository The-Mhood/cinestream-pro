"use client";

import { useState } from "react";
import { Database, Loader2, RefreshCw } from "lucide-react";

type ImportResult = {
  imported: number;
  refreshed: number;
  uniqueFeedRecords: number;
  pagesPerType: number;
  note: string;
};

export default function CatalogImportPanel() {
  const [pages, setPages] = useState(5);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function runImport() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/discovery/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Catalogue import failed");
      setResult(payload as ImportResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Catalogue import failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="mb-8 rounded-2xl border border-amber-400/25 bg-[#151b2a] p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-300">
            <Database className="h-4 w-4" /> Catalogue ingestion
          </div>
          <h2 className="mt-2 font-display text-lg font-bold text-white">Import real movies and series</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">
            Imports the movie and TV catalogue feeds observed on Cinejoy, including popular and trending titles. This adds metadata and artwork only; it does not invent playable streams.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="text-xs text-slate-400" htmlFor="catalog-pages">Pages / type</label>
          <select id="catalog-pages" value={pages} onChange={(e) => setPages(Number(e.target.value))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
            {[1, 3, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button type="button" onClick={runImport} disabled={running} className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-60">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {running ? "Importing..." : "Import catalogue"}
          </button>
        </div>
      </div>
      {error && <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}
      {result && (
        <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
          <div className="flex flex-wrap gap-5 text-sm text-slate-200">
            <span><strong className="text-emerald-300">{result.imported}</strong> new titles</span>
            <span><strong className="text-sky-300">{result.refreshed}</strong> refreshed</span>
            <span><strong className="text-white">{result.uniqueFeedRecords}</strong> unique feed records</span>
          </div>
          <p className="mt-2 text-xs text-slate-400">{result.note}</p>
          <a href="/" className="mt-3 inline-block text-xs font-semibold text-amber-300 hover:underline">View imported catalogue →</a>
        </div>
      )}
    </section>
  );
}
