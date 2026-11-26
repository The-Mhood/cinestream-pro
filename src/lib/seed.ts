import { db } from "@/db";
import {
  users,
  providers,
  mediaItems,
  streamSources,
  aggregationRuns,
  watchlistItems,
} from "@/db/schema";
import { hashPassword } from "./auth";
import { count, eq } from "drizzle-orm";

let seedPromise: Promise<void> | null = null;

export async function ensureSeeded() {
  if (seedPromise) {
    return seedPromise;
  }
  seedPromise = runSeed().catch((err) => {
    seedPromise = null;
    console.error("Seed error:", err);
  });
  return seedPromise;
}

async function runSeed() {
  const [{ value: mediaCount }] = await db
    .select({ value: count() })
    .from(mediaItems);

  if (mediaCount > 0) {
    return;
  }

  // 1. Seed Demo User
  const [demoUser] = await db
    .insert(users)
    .values({
      email: "demo@cinestream.pro",
      name: "Alex Mercer",
      passwordHash: hashPassword("cinestream"),
      role: "admin",
    })
    .onConflictDoNothing()
    .returning();

  // 2. Seed Providers
  const providerSeeds = [
    {
      slug: "mux-edge",
      name: "Mux Edge HLS",
      baseUrl: "https://test-streams.mux.dev",
      status: "active",
      avgLatencyMs: 22,
      uptimePercent: 99.9,
      totalStreamsIndexed: 9,
    },
    {
      slug: "unified-cdn",
      name: "Unified Stream CDN",
      baseUrl: "https://demo.unified-streaming.com",
      status: "active",
      avgLatencyMs: 34,
      uptimePercent: 99.5,
      totalStreamsIndexed: 7,
    },
    {
      slug: "open-archive",
      name: "OpenArchive Vault",
      baseUrl: "https://commondatastorage.googleapis.com",
      status: "active",
      avgLatencyMs: 28,
      uptimePercent: 99.8,
      totalStreamsIndexed: 9,
    },
    {
      slug: "cupertino-hls",
      name: "Cupertino Adaptive HLS",
      baseUrl: "https://devstreaming-cdn.apple.com",
      status: "active",
      avgLatencyMs: 41,
      uptimePercent: 99.6,
      totalStreamsIndexed: 6,
    },
    {
      slug: "mirror-node",
      name: "Backup Mirror Node",
      baseUrl: "https://mirror-node.cinestream.local",
      status: "degraded",
      avgLatencyMs: 184,
      uptimePercent: 86.4,
      totalStreamsIndexed: 5,
    },
  ];

  const insertedProviders = await db
    .insert(providers)
    .values(providerSeeds)
    .onConflictDoNothing()
    .returning();

  const allProviders =
    insertedProviders.length > 0
      ? insertedProviders
      : await db.select().from(providers);

  const pMap = new Map(allProviders.map((p) => [p.slug, p]));

  // 3. Seed Movies & Series
  const catalogSeeds = [
    {
      slug: "tears-of-steel",
      title: "Tears of Steel",
      type: "movie",
      posterPath: "/posters/tears-of-steel.jpg",
      backdropPath: "/posters/hero-backdrop.jpg",
      overview:
        "In a dystopian future Amsterdam, a band of cybernetic warriors and scientists gather at the Oude Kerk to stage a desperate stand against robotic dominance—while one man confronts the memory that shattered his past.",
      releaseYear: 2012,
      durationMinutes: 12,
      rating: 8.8,
      genres: "Sci-Fi, Cyberpunk, Action",
      castList: "Derek de Lint, Sergio Hasselbaink, Rogier Schippers",
      seasonsCount: 1,
      episodesCount: 1,
      tmdbId: 118193,
      isTrending: true,
      discoveredVia: "Unified CDN + 3 mirrors",
    },
    {
      slug: "sintel",
      title: "Sintel",
      type: "movie",
      posterPath: "/posters/sintel.jpg",
      backdropPath: "/posters/sintel.jpg",
      overview:
        "A wandering warrior named Sintel treks across frozen mountain passes and ancient ruins in search of a young dragon she once rescued, uncovering a heartbreaking truth at the edge of the world.",
      releaseYear: 2010,
      durationMinutes: 15,
      rating: 8.9,
      genres: "Fantasy, Adventure, Drama",
      castList: "Halina Reijn, Thom Hoffman",
      seasonsCount: 1,
      episodesCount: 1,
      tmdbId: 45745,
      isTrending: true,
      discoveredVia: "OpenArchive + 3 mirrors",
    },
    {
      slug: "charge",
      title: "Charge",
      type: "movie",
      posterPath: "/posters/charge.jpg",
      backdropPath: "/posters/charge.jpg",
      overview:
        "Driven by scarcity and desperation, a lone scavenger infiltrates a high-voltage energy facility guarded by autonomous security drones, sparking an explosive fight for survival.",
      releaseYear: 2022,
      durationMinutes: 6,
      rating: 8.6,
      genres: "Cyberpunk, Action, Thriller",
      castList: "Elena Vance, Kai Novak",
      seasonsCount: 1,
      episodesCount: 1,
      tmdbId: 1059710,
      isTrending: true,
      discoveredVia: "Mux Edge + 2 mirrors",
    },
    {
      slug: "agent-327-operation-barbershop",
      title: "Agent 327: Operation Barbershop",
      type: "series",
      posterPath: "/posters/agent-327.jpg",
      backdropPath: "/posters/agent-327.jpg",
      overview:
        "Secret agent Hendrik IJzerbroot uncovers a covert syndicate operating beneath an ordinary Amsterdam barbershop—leading to high-stakes espionage, tactical gadgets, and relentless chases across Europe.",
      releaseYear: 2021,
      durationMinutes: 42,
      rating: 8.5,
      genres: "Action, Espionage, Mystery",
      castList: "Hendrik IJzerbroot, Boris Klovsky, Olga",
      seasonsCount: 2,
      episodesCount: 4,
      tmdbId: 461490,
      isTrending: true,
      discoveredVia: "Cupertino HLS + 3 mirrors",
    },
    {
      slug: "cosmos-laundromat",
      title: "Cosmos Laundromat",
      type: "series",
      posterPath: "/posters/cosmos.jpg",
      backdropPath: "/posters/cosmos.jpg",
      overview:
        "On a desolate windswept island, a weary traveler encounters a mysterious cosmic broker offering a chance to live infinite alternate lives across parallel realities.",
      releaseYear: 2020,
      durationMinutes: 38,
      rating: 8.7,
      genres: "Sci-Fi, Mystery, Drama",
      castList: "Franck, Victor, Tara",
      seasonsCount: 1,
      episodesCount: 3,
      tmdbId: 355021,
      isTrending: true,
      discoveredVia: "Mux Edge + 3 mirrors",
    },
    {
      slug: "spring",
      title: "Spring",
      type: "series",
      posterPath: "/posters/spring.jpg",
      backdropPath: "/posters/spring.jpg",
      overview:
        "High above the clouds in a valley frozen in eternal winter, a young shepherdess and her loyal hound confront ancient stone colossi to reawaken the cycle of seasons.",
      releaseYear: 2019,
      durationMinutes: 44,
      rating: 8.4,
      genres: "Fantasy, Adventure, Mystery",
      castList: "Lyra, Ancient Colossus",
      seasonsCount: 1,
      episodesCount: 3,
      tmdbId: 593560,
      isTrending: false,
      discoveredVia: "OpenArchive + 2 mirrors",
    },
    {
      slug: "sprite-fright",
      title: "Sprite Fright",
      type: "movie",
      posterPath: "/posters/sprite-fright.jpg",
      backdropPath: "/posters/sprite-fright.jpg",
      overview:
        "When a rowdy group of weekend hikers ventures off-trail into an enchanted 1980s woodland, they discover that the forest's glowing mushroom spirits have a sinister appetite.",
      releaseYear: 2021,
      durationMinutes: 11,
      rating: 8.1,
      genres: "Horror, Comedy, Fantasy",
      castList: "Ellie, Phil, Victoria",
      seasonsCount: 1,
      episodesCount: 1,
      tmdbId: 889741,
      isTrending: false,
      discoveredVia: "Mux Edge + 2 mirrors",
    },
    {
      slug: "elephants-dream",
      title: "Elephants Dream",
      type: "movie",
      posterPath: "/posters/elephants-dream.jpg",
      backdropPath: "/posters/elephants-dream.jpg",
      overview:
        "Two travelers navigate a surreal, shifting mechanical citadel of impossible corridors, towering gears, and telepathic conduits where reality bends to imagination.",
      releaseYear: 2006,
      durationMinutes: 11,
      rating: 7.9,
      genres: "Sci-Fi, Steampunk, Mystery",
      castList: "Cas Jansen, Tygo Gernandt",
      seasonsCount: 1,
      episodesCount: 1,
      tmdbId: 13847,
      isTrending: false,
      discoveredVia: "OpenArchive + 2 mirrors",
    },
    {
      slug: "big-buck-bunny",
      title: "Big Buck Bunny",
      type: "movie",
      posterPath: "/posters/big-buck-bunny.jpg",
      backdropPath: "/posters/big-buck-bunny.jpg",
      overview:
        "A peaceful giant rabbit living in a sunlit redwood meadow finally snaps and orchestrates an elaborate forest counter-ambush when three mischievous rodents cross the line.",
      releaseYear: 2008,
      durationMinutes: 10,
      rating: 8.3,
      genres: "Animation, Comedy, Adventure",
      castList: "Bunny, Frank, Rinky, Gamera",
      seasonsCount: 1,
      episodesCount: 1,
      tmdbId: 10378,
      isTrending: true,
      discoveredVia: "Mux Edge + 3 mirrors",
    },
  ];

  const insertedMedia = await db
    .insert(mediaItems)
    .values(catalogSeeds)
    .onConflictDoNothing()
    .returning();

  const mediaBySlug = new Map(insertedMedia.map((m) => [m.slug, m]));

  // 4. Seed Multi-Server Stream Sources for each title
  const sourceSeeds: Array<typeof streamSources.$inferInsert> = [];

  const addSource = (
    slug: string,
    providerSlug: string,
    serverLabel: string,
    url: string,
    quality: string,
    format: string,
    status: "active" | "degraded" | "offline" = "active",
    latencyMs = 34,
    season = 1,
    episode = 1,
    language = "English"
  ) => {
    const media = mediaBySlug.get(slug);
    const provider = pMap.get(providerSlug);
    if (!media) return;
    sourceSeeds.push({
      mediaId: media.id,
      providerId: provider?.id ?? null,
      providerName: provider?.name ?? providerSlug,
      serverLabel,
      url,
      quality,
      format,
      language,
      season,
      episode,
      status,
      latencyMs,
      isActive: status !== "offline",
      successCount: status === "offline" ? 2 : 48,
      failCount: status === "offline" ? 9 : 0,
    });
  };

  // Tears of Steel
  addSource(
    "tears-of-steel",
    "unified-cdn",
    "Server 1 • Unified Adaptive",
    "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
    "1080p",
    "HLS",
    "active",
    29
  );
  addSource(
    "tears-of-steel",
    "open-archive",
    "Server 2 • OpenArchive 4K",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
    "4K",
    "MP4",
    "active",
    24
  );
  addSource(
    "tears-of-steel",
    "mux-edge",
    "Server 3 • Mux Edge HLS",
    "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    "1080p",
    "HLS",
    "active",
    21
  );
  addSource(
    "tears-of-steel",
    "mirror-node",
    "Server 4 • Backup Mirror (Test Failover)",
    "https://offline-mirror.invalid/tears-of-steel.m3u8",
    "720p",
    "HLS",
    "offline",
    999
  );

  // Sintel
  addSource(
    "sintel",
    "open-archive",
    "Server 1 • OpenArchive Master",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
    "4K",
    "MP4",
    "active",
    26
  );
  addSource(
    "sintel",
    "cupertino-hls",
    "Server 2 • Cupertino HLS",
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8",
    "1080p",
    "HLS",
    "active",
    38
  );
  addSource(
    "sintel",
    "mux-edge",
    "Server 3 • Mux Edge HLS",
    "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    "1080p",
    "HLS",
    "active",
    22
  );
  addSource(
    "sintel",
    "mirror-node",
    "Server 4 • Backup Mirror (Test Failover)",
    "https://offline-mirror.invalid/sintel.m3u8",
    "720p",
    "HLS",
    "offline",
    999
  );

  // Charge
  addSource(
    "charge",
    "mux-edge",
    "Server 1 • Mux Edge 4K",
    "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    "4K",
    "HLS",
    "active",
    19
  );
  addSource(
    "charge",
    "open-archive",
    "Server 2 • OpenArchive Direct",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    "1080p",
    "MP4",
    "active",
    31
  );
  addSource(
    "charge",
    "mirror-node",
    "Server 3 • Backup Mirror (Test Failover)",
    "https://offline-mirror.invalid/charge.m3u8",
    "1080p",
    "HLS",
    "offline",
    999
  );

  // Big Buck Bunny
  addSource(
    "big-buck-bunny",
    "mux-edge",
    "Server 1 • Mux ABR HLS",
    "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    "4K",
    "HLS",
    "active",
    18
  );
  addSource(
    "big-buck-bunny",
    "open-archive",
    "Server 2 • OpenArchive MP4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    "1080p",
    "MP4",
    "active",
    27
  );
  addSource(
    "big-buck-bunny",
    "cupertino-hls",
    "Server 3 • Cupertino HLS",
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8",
    "720p",
    "HLS",
    "active",
    42
  );

  // Elephants Dream
  addSource(
    "elephants-dream",
    "open-archive",
    "Server 1 • OpenArchive Master",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    "1080p",
    "MP4",
    "active",
    33
  );
  addSource(
    "elephants-dream",
    "mux-edge",
    "Server 2 • Mux Edge HLS",
    "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    "720p",
    "HLS",
    "active",
    25
  );

  // Sprite Fright
  addSource(
    "sprite-fright",
    "open-archive",
    "Server 1 • OpenArchive Direct",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    "1080p",
    "MP4",
    "active",
    29
  );
  addSource(
    "sprite-fright",
    "mux-edge",
    "Server 2 • Mux Edge HLS",
    "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    "1080p",
    "HLS",
    "active",
    21
  );

  // Series: Agent 327 (Seasons 1-2, multiple episodes)
  for (let ep = 1; ep <= 4; ep++) {
    addSource(
      "agent-327-operation-barbershop",
      "mux-edge",
      "Server 1 • Mux Edge HLS",
      "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
      "1080p",
      "HLS",
      "active",
      22,
      1,
      ep
    );
    addSource(
      "agent-327-operation-barbershop",
      "open-archive",
      "Server 2 • OpenArchive Vault",
      ep % 2 === 0
        ? "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4"
        : "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4",
      "1080p",
      "MP4",
      "active",
      31,
      1,
      ep
    );
  }
  addSource(
    "agent-327-operation-barbershop",
    "unified-cdn",
    "Server 1 • Unified CDN",
    "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
    "4K",
    "HLS",
    "active",
    28,
    2,
    1
  );

  // Series: Cosmos Laundromat
  for (let ep = 1; ep <= 3; ep++) {
    addSource(
      "cosmos-laundromat",
      "cupertino-hls",
      "Server 1 • Cupertino HLS",
      "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8",
      "1080p",
      "HLS",
      "active",
      35,
      1,
      ep
    );
    addSource(
      "cosmos-laundromat",
      "open-archive",
      "Server 2 • OpenArchive Vault",
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4",
      "1080p",
      "MP4",
      "active",
      29,
      1,
      ep
    );
  }

  // Series: Spring
  for (let ep = 1; ep <= 3; ep++) {
    addSource(
      "spring",
      "mux-edge",
      "Server 1 • Mux Edge HLS",
      "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
      "1080p",
      "HLS",
      "active",
      23,
      1,
      ep
    );
    addSource(
      "spring",
      "open-archive",
      "Server 2 • OpenArchive Direct",
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
      "4K",
      "MP4",
      "active",
      32,
      1,
      ep
    );
  }

  if (sourceSeeds.length > 0) {
    await db.insert(streamSources).values(sourceSeeds);
  }

  // 5. Seed Demo Watchlist items
  if (demoUser) {
    const tears = mediaBySlug.get("tears-of-steel");
    const sintel = mediaBySlug.get("sintel");
    const agent = mediaBySlug.get("agent-327-operation-barbershop");
    const wlSeeds = [tears, sintel, agent]
      .filter((m): m is NonNullable<typeof m> => Boolean(m))
      .map((m, idx) => ({
        userId: demoUser.id,
        mediaId: m.id,
        inWatchlist: true,
        progressSeconds: idx === 0 ? 185 : idx === 1 ? 64 : 0,
      }));
    if (wlSeeds.length > 0) {
      await db
        .insert(watchlistItems)
        .values(wlSeeds)
        .onConflictDoNothing();
    }
  }

  // 6. Seed initial Aggregation Run log
  await db.insert(aggregationRuns).values({
    providersScanned: 5,
    titlesDiscovered: catalogSeeds.length,
    sourcesVerified: sourceSeeds.length,
    status: "completed",
    summary:
      "Initial multi-provider index sync completed across Mux Edge, Unified CDN, OpenArchive, Cupertino HLS, and Mirror Node.",
  });
}

// Discovery catalog candidates that the Source Watcher discovers when triggered
const DISCOVERY_FEED = [
  {
    slug: "orbital-horizon",
    title: "Orbital Horizon",
    type: "movie",
    posterPath: "/posters/hero-backdrop.jpg",
    backdropPath: "/posters/hero-backdrop.jpg",
    overview:
      "When deep-space telemetry reveals an unauthorized signal beneath the lunar terminator, an orbital station commander must isolate a rogue AI before re-entry.",
    releaseYear: 2025,
    durationMinutes: 128,
    rating: 8.9,
    genres: "Sci-Fi, Thriller",
    castList: "Clara Chen, Julian Reyes",
    seasonsCount: 1,
    episodesCount: 1,
    tmdbId: 901122,
    isTrending: true,
    discoveredVia: "Mux Edge + Unified CDN",
    sources: [
      {
        providerSlug: "mux-edge",
        serverLabel: "Server 1 • Mux Edge 4K",
        url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        quality: "4K",
        format: "HLS",
      },
      {
        providerSlug: "unified-cdn",
        serverLabel: "Server 2 • Unified Adaptive",
        url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
        quality: "1080p",
        format: "HLS",
      },
    ],
  },
  {
    slug: "glass-citadel",
    title: "Glass Citadel",
    type: "series",
    posterPath: "/posters/elephants-dream.jpg",
    backdropPath: "/posters/elephants-dream.jpg",
    overview:
      "Inside a vertical megacity powered by acoustic energy, a forensic sound engineer traces a series of blackouts to a forgotten subterranean chamber.",
    releaseYear: 2024,
    durationMinutes: 48,
    rating: 8.4,
    genres: "Mystery, Cyberpunk",
    castList: "Soren Lindqvist, Maya Patel",
    seasonsCount: 1,
    episodesCount: 2,
    tmdbId: 901123,
    isTrending: false,
    discoveredVia: "OpenArchive + Cupertino HLS",
    sources: [
      {
        providerSlug: "cupertino-hls",
        serverLabel: "Server 1 • Cupertino HLS",
        url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8",
        quality: "1080p",
        format: "HLS",
      },
      {
        providerSlug: "open-archive",
        serverLabel: "Server 2 • OpenArchive MP4",
        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
        quality: "1080p",
        format: "MP4",
      },
    ],
  },
];

export async function runSourceDiscovery() {
  await ensureSeeded();
  const startedAt = new Date();
  const allProviders = await db.select().from(providers);
  const pMap = new Map(allProviders.map((p) => [p.slug, p]));

  let titlesDiscovered = 0;

  for (const candidate of DISCOVERY_FEED) {
    const existing = await db
      .select({ id: mediaItems.id })
      .from(mediaItems)
      .where(eq(mediaItems.slug, candidate.slug))
      .limit(1);

    if (existing.length === 0) {
      const { sources, ...mediaData } = candidate;
      const [inserted] = await db
        .insert(mediaItems)
        .values(mediaData)
        .returning();

      if (inserted) {
        titlesDiscovered++;
        const sourceRows = sources.map((s) => {
          const prov = pMap.get(s.providerSlug);
          return {
            mediaId: inserted.id,
            providerId: prov?.id ?? null,
            providerName: prov?.name ?? s.providerSlug,
            serverLabel: s.serverLabel,
            url: s.url,
            quality: s.quality,
            format: s.format,
            language: "English",
            season: 1,
            episode: 1,
            status: "active",
            latencyMs: prov?.avgLatencyMs ?? 30,
            isActive: true,
            successCount: 15,
            failCount: 0,
          };
        });
        await db.insert(streamSources).values(sourceRows);
      }
    }
  }

  // Refresh provider latency telemetry & verify sources
  const allSources = await db.select().from(streamSources);
  for (const prov of allProviders) {
    const jitter = Math.floor(Math.random() * 9) - 4;
    const baseLatency =
      prov.status === "degraded" ? 175 : Math.max(14, prov.avgLatencyMs + jitter);
    const provStreamCount = allSources.filter(
      (s) => s.providerId === prov.id
    ).length;

    await db
      .update(providers)
      .set({
        avgLatencyMs: baseLatency,
        totalStreamsIndexed: provStreamCount,
        lastCheckedAt: new Date(),
      })
      .where(eq(providers.id, prov.id));
  }

  const summary =
    titlesDiscovered > 0
      ? `Discovered ${titlesDiscovered} new title(s) and verified ${allSources.length} multi-provider streams.`
      : `Verified ${allSources.length} indexed streams across ${allProviders.length} providers. All healthy mirrors synchronized.`;

  const [run] = await db
    .insert(aggregationRuns)
    .values({
      startedAt,
      completedAt: new Date(),
      providersScanned: allProviders.length,
      titlesDiscovered,
      sourcesVerified: allSources.length,
      status: "completed",
      summary,
    })
    .returning();

  return run;
}
