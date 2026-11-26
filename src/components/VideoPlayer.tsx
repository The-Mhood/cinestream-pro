"use client";

import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import {
  AlertTriangle,
  CheckCircle2,
  Gauge,
  PictureInPicture2,
  RefreshCw,
  Settings2,
  Subtitles,
} from "lucide-react";

export interface StreamSourceItem {
  id: number;
  mediaId: number;
  providerName: string;
  serverLabel: string;
  url: string;
  quality: string;
  format: string;
  language: string;
  season: number;
  episode: number;
  status: string;
  latencyMs: number;
  isActive: boolean;
  successCount: number;
  failCount: number;
}

interface VideoPlayerProps {
  source: StreamSourceItem;
  poster: string;
  title: string;
  initialTime?: number;
  autoPlay?: boolean;
  failoverNotice?: string | null;
  onServerError: (failedSource: StreamSourceItem) => void;
  onServerHealthy?: (source: StreamSourceItem) => void;
  onProgressUpdate?: (seconds: number) => void;
}

interface HlsLevelOption {
  index: number;
  label: string;
}

export default function VideoPlayer({
  source,
  poster,
  title,
  initialTime = 0,
  autoPlay = false,
  failoverNotice,
  onServerError,
  onServerHealthy,
  onProgressUpdate,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hasReportedHealthyRef = useRef(false);
  const lastSavedProgressRef = useRef(0);
  const initialSeekAppliedRef = useRef(false);

  const [loadingStream, setLoadingStream] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [hlsLevels, setHlsLevels] = useState<HlsLevelOption[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<number>(-1); // -1 = Auto
  const [captionsOn, setCaptionsOn] = useState(false);
  const [streamStatusText, setStreamStatusText] = useState("Initializing...");

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;

    setLoadingStream(true);
    setHlsLevels([]);
    setSelectedLevel(-1);
    hasReportedHealthyRef.current = false;
    initialSeekAppliedRef.current = false;
    setStreamStatusText(`Connecting to ${source.providerName}...`);

    // Clean up previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHls =
      source.format.toUpperCase() === "HLS" ||
      source.url.toLowerCase().includes(".m3u8");

    // Immediately trigger failover if known offline invalid mirror
    if (
      source.url.includes(".invalid") ||
      source.url.includes("offline-mirror")
    ) {
      const timer = setTimeout(() => {
        setLoadingStream(false);
        onServerError(source);
      }, 650);
      return () => clearTimeout(timer);
    }

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        manifestLoadingTimeOut: 8000,
        levelLoadingTimeOut: 8000,
      });
      hlsRef.current = hls;

      hls.loadSource(source.url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setLoadingStream(false);
        setStreamStatusText("Adaptive HLS Ready");
        const levels: HlsLevelOption[] = data.levels.map((lvl, idx) => ({
          index: idx,
          label: lvl.height ? `${lvl.height}p` : `Stream ${idx + 1}`,
        }));
        setHlsLevels(levels);

        if (initialTime > 5 && !initialSeekAppliedRef.current) {
          video.currentTime = initialTime;
          initialSeekAppliedRef.current = true;
        }
        if (autoPlay) {
          video.play().catch(() => {});
        }
        if (!hasReportedHealthyRef.current) {
          hasReportedHealthyRef.current = true;
          onServerHealthy?.(source);
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setLoadingStream(false);
          setStreamStatusText("Stream error — triggering failover");
          hls.destroy();
          onServerError(source);
        }
      });

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    } else {
      // Native HLS (Safari) or MP4
      video.src = source.url;
      const handleLoaded = () => {
        setLoadingStream(false);
        setStreamStatusText(`${source.format} Direct Ready`);
        if (initialTime > 5 && !initialSeekAppliedRef.current) {
          video.currentTime = initialTime;
          initialSeekAppliedRef.current = true;
        }
        if (autoPlay) {
          video.play().catch(() => {});
        }
        if (!hasReportedHealthyRef.current) {
          hasReportedHealthyRef.current = true;
          onServerHealthy?.(source);
        }
      };
      const handleError = () => {
        setLoadingStream(false);
        setStreamStatusText("Mirror failed — switching server");
        onServerError(source);
      };

      video.addEventListener("loadedmetadata", handleLoaded);
      video.addEventListener("error", handleError);
      return () => {
        video.removeEventListener("loadedmetadata", handleLoaded);
        video.removeEventListener("error", handleError);
      };
    }
  }, [source, autoPlay, initialTime, onServerError, onServerHealthy]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  const handleQualityChange = (levelIndex: number) => {
    setSelectedLevel(levelIndex);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
    }
  };

  const handlePip = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch {
      // ignore PiP restrictions
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !onProgressUpdate) return;
    const current = Math.floor(video.currentTime);
    if (Math.abs(current - lastSavedProgressRef.current) >= 10) {
      lastSavedProgressRef.current = current;
      onProgressUpdate(current);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-black shadow-2xl">
      {/* Failover Toast Banner */}
      {failoverNotice && (
        <div className="flex items-center gap-2.5 border-b border-amber-500/30 bg-amber-500/15 px-4 py-2.5 text-xs font-medium text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
          <span>{failoverNotice}</span>
        </div>
      )}

      {/* Video Surface */}
      <div className="relative aspect-video w-full bg-black">
        <video
          ref={videoRef}
          poster={poster}
          controls
          playsInline
          crossOrigin="anonymous"
          onTimeUpdate={handleTimeUpdate}
          className="h-full w-full object-contain"
        />

        {/* Top-left Active Source HUD */}
        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-950/80 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-md">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            {source.serverLabel}
          </span>
          <span className="rounded-lg border border-amber-400/30 bg-amber-400/15 px-2 py-1 text-[11px] font-bold text-amber-300 backdrop-blur-md">
            {source.quality} • {source.format}
          </span>
        </div>

        {/* Loading Overlay */}
        {loadingStream && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-slate-950/60 backdrop-blur-[2px]">
            <RefreshCw className="h-8 w-8 animate-spin text-amber-400" />
            <p className="mt-2.5 text-xs font-semibold text-slate-200">
              {streamStatusText}
            </p>
          </div>
        )}

        {/* Simulated Subtitles Overlay when toggled */}
        {captionsOn && !loadingStream && (
          <div className="pointer-events-none absolute bottom-14 left-1/2 -translate-x-1/2 rounded-lg bg-black/80 px-3.5 py-1.5 text-center text-xs font-medium text-white shadow">
            [CC • {source.language}] {title} — Adaptive Audio Track Active
          </div>
        )}
      </div>

      {/* Player Utility Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 bg-[#0d1424] px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2 text-slate-400">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          <span className="font-medium text-slate-300">
            {streamStatusText}
          </span>
          <span className="hidden text-slate-600 sm:inline">•</span>
          <span className="hidden text-slate-400 sm:inline">
            Latency {source.latencyMs}ms
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* HLS Quality Selector */}
          {hlsLevels.length > 0 && (
            <label className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900 px-2.5 py-1 text-slate-200">
              <Settings2 className="h-3.5 w-3.5 text-amber-400" />
              <select
                aria-label="Stream quality"
                value={selectedLevel}
                onChange={(e) => handleQualityChange(Number(e.target.value))}
                className="bg-transparent text-xs font-semibold text-white outline-none"
              >
                <option value={-1} className="bg-slate-900">
                  Auto (ABR)
                </option>
                {hlsLevels.map((lvl) => (
                  <option
                    key={lvl.index}
                    value={lvl.index}
                    className="bg-slate-900"
                  >
                    {lvl.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Playback Speed */}
          <label className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900 px-2.5 py-1 text-slate-200">
            <Gauge className="h-3.5 w-3.5 text-amber-400" />
            <select
              aria-label="Playback speed"
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
              className="bg-transparent text-xs font-semibold text-white outline-none"
            >
              {[0.5, 1, 1.25, 1.5, 2].map((spd) => (
                <option key={spd} value={spd} className="bg-slate-900">
                  {spd}x
                </option>
              ))}
            </select>
          </label>

          {/* Subtitles Toggle */}
          <button
            type="button"
            onClick={() => setCaptionsOn((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-semibold transition ${
              captionsOn
                ? "border-amber-400/50 bg-amber-400/15 text-amber-300"
                : "border-slate-700/80 bg-slate-900 text-slate-300 hover:text-white"
            }`}
          >
            <Subtitles className="h-3.5 w-3.5" />
            <span>CC</span>
          </button>

          {/* Picture-in-Picture */}
          <button
            type="button"
            onClick={handlePip}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900 px-2.5 py-1 font-semibold text-slate-300 transition hover:text-white"
          >
            <PictureInPicture2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">PiP</span>
          </button>
        </div>
      </div>
    </div>
  );
}
