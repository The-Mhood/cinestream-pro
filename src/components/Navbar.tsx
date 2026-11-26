"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Film,
  Tv,
  Bookmark,
  Radar,
  Search,
  User as UserIcon,
  LogOut,
  Menu,
  X,
  Compass,
} from "lucide-react";
import { useAuth } from "./AuthContext";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, openAuthModal, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) {
      router.push(`/?q=${encodeURIComponent(q)}`);
    } else {
      router.push("/");
    }
    setMobileOpen(false);
  };

  const navLinks = [
    { href: "/", label: "Discover", icon: Compass },
    { href: "/?type=movie", label: "Movies", icon: Film },
    { href: "/?type=series", label: "Series", icon: Tv },
    { href: "/aggregator", label: "Source Watcher", icon: Radar },
    { href: "/watchlist", label: "Library", icon: Bookmark },
  ];

  return (
    <header className="fixed top-0 z-40 w-full border-b border-slate-800/80 bg-[#090e1a]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link href="/" className="flex shrink-0 items-center gap-2.5 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 shadow-lg shadow-amber-500/20 transition group-hover:scale-105">
            <span className="font-display text-base font-black">C</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-xl font-bold tracking-tight text-white">
              Cine<span className="text-amber-400">Stream</span>
            </span>
            <span className="hidden rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-400 sm:inline-block">
              AGGREGATOR
            </span>
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href.split("?")[0]) &&
                  link.href !== "/";
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-slate-800 text-amber-400"
                    : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Search + Auth */}
        <div className="flex items-center gap-3">
          <form
            onSubmit={handleSearch}
            className="relative hidden sm:block md:w-56 lg:w-64"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search titles, genres..."
              className="w-full rounded-xl border border-slate-700/80 bg-slate-900/90 py-1.5 pl-9 pr-3 text-sm text-white placeholder-slate-400 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-400/40"
            />
          </form>

          {user ? (
            <div className="hidden items-center gap-2 sm:flex">
              <Link
                href="/watchlist"
                className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-amber-400/50"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-slate-950">
                  {user.name.charAt(0).toUpperCase()}
                </span>
                <span className="max-w-[100px] truncate">{user.name}</span>
              </Link>
              <button
                onClick={logout}
                title="Sign out"
                className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-400 transition hover:border-slate-700 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => openAuthModal("login")}
              className="hidden items-center gap-1.5 rounded-xl bg-amber-400 px-3.5 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-amber-300 sm:flex"
            >
              <UserIcon className="h-3.5 w-3.5" />
              <span>Sign In</span>
            </button>
          )}

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle navigation menu"
            className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-300 hover:text-white lg:hidden"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="border-t border-slate-800 bg-[#090e1a] px-4 py-4 lg:hidden">
          <form onSubmit={handleSearch} className="relative mb-3 sm:hidden">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search titles, genres..."
              className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-400 outline-none focus:border-amber-400"
            />
          </form>

          <div className="space-y-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800"
                >
                  <Icon className="h-4 w-4 text-amber-400" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="mt-4 border-t border-slate-800 pt-3">
            {user ? (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-300">
                  Signed in as <strong className="text-white">{user.name}</strong>
                </span>
                <button
                  onClick={() => {
                    logout();
                    setMobileOpen(false);
                  }}
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setMobileOpen(false);
                  openAuthModal("login");
                }}
                className="w-full rounded-xl bg-amber-400 py-2 text-xs font-bold text-slate-950"
              >
                Sign In / Demo Account
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
