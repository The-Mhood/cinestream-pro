"use client";

import React from "react";
import Link from "next/link";
import { Play, Server, Star } from "lucide-react";

export interface CatalogItem {
  id: number;
  slug: string;
  title: string;
  type: string;
  posterPath: string;
  backdropPath: string;
  overview: string;
  releaseYear: number;
  durationMinutes: number;
  rating: number;
  genres: string;
  castList: string;
  seasonsCount: number;
  episodesCount: number;
  isTrending: boolean;
  discoveredVia: string;
  sourceIdentifier?: string | null;
  licenseUrl?: string | null;
  attribution?: string | null;
  sourceCount?: number;
  activeSourceCount?: number;
  maxQuality?: string;
}

export default function MovieCard({ item }: { item: CatalogItem }) {
  const activeCount = item.activeSourceCount ?? item.sourceCount ?? 3;
  const maxQuality = item.maxQuality ?? "1080p";

  return (
    <Link
      href={`/watch/${item.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-800/80 bg-[#111827] transition duration-300 hover:-translate-y-1 hover:border-amber-400/50 hover:shadow-2xl hover:shadow-amber-500/10"
    >
      {/* Poster Container */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-slate-900">
        <img
          src={item.posterPath}
          alt={item.title}
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105 group-hover:brightness-75"
        />

        {/* Top Badges */}
        <div className="absolute left-2.5 right-2.5 top-2.5 flex items-center justify-between gap-2">
          <span
            className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow ${
              maxQuality === "4K"
                ? "bg-amber-400 text-slate-950"
                : "bg-slate-950/85 text-slate-100 backdrop-blur-md border border-slate-700/80"
            }`}
          >
            {maxQuality}
          </span>
          <span className="flex items-center gap-1 rounded-md border border-emerald-500/30 bg-slate-950/85 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 backdrop-blur-md">
            <Server className="h-3 w-3" />
            {activeCount} {activeCount === 1 ? "Server" : "Servers"}
          </span>
        </div>

        {/* Hover Overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/60 opacity-0 backdrop-blur-[2px] transition duration-300 group-hover:opacity-100">
          <span className="flex items-center gap-2 rounded-full bg-amber-400 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-amber-400/30 transition group-hover:scale-105">
            <Play className="h-4 w-4 fill-slate-950" />
            Watch Now
          </span>
          <span className="mt-2.5 text-[11px] font-medium text-slate-200">
            {item.discoveredVia}
          </span>
        </div>

        {/* Bottom Gradient */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#111827] via-[#111827]/60 to-transparent" />
      </div>

      {/* Info Footer */}
      <div className="flex flex-1 flex-col justify-between p-3.5">
        <div>
          <h3 className="line-clamp-1 font-display text-sm font-bold text-white transition group-hover:text-amber-400">
            {item.title}
          </h3>
          <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-400">
            {item.genres}
          </p>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>{item.releaseYear > 0 ? item.releaseYear : "Year unknown"}</span>
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-300">
              {item.type}
            </span>
          </div>
          {item.rating > 0 && (
            <div className="flex items-center gap-1 font-semibold text-amber-400">
              <Star className="h-3.5 w-3.5 fill-amber-400" />
              <span>{item.rating.toFixed(1)}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
