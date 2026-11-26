# First-party catalogue and playback feed contract

CineStream Pro can synchronize catalogue metadata and direct playback sources from operator-controlled sites through four server-configured HTTPS JSON feeds.

## Environment

Configure one feed URL per site on the CineStream Pro server:

- `CINEJOY_CATALOG_FEED_URL`
- `CINELITE_CATALOG_FEED_URL`
- `VIVARIUM_CATALOG_FEED_URL`
- `MOVY_CATALOG_FEED_URL`

Each feed URL hostname must be listed in `DISCOVERY_ALLOWED_HOSTS`. Every direct media URL hostname must be listed in `STREAM_PROBE_ALLOWED_HOSTS`. Include the relevant first-party media/CDN hostnames there. These are exact host allowlists, not wildcard patterns.

## Response format

Return JSON with this shape:

```json
{
  "version": 1,
  "provider": "Cinejoy",
  "items": [
    {
      "externalId": "film-123",
      "tmdbId": 12345,
      "title": "Example Film",
      "type": "movie",
      "overview": "Synopsis",
      "posterUrl": "https://cinejoy.pk/images/poster.jpg",
      "backdropUrl": "https://cinejoy.pk/images/backdrop.jpg",
      "releaseYear": 2025,
      "durationMinutes": 110,
      "rating": 7.8,
      "genres": ["Drama"],
      "cast": ["Actor One"],
      "sources": [
        {
          "url": "https://media.cinejoy.pk/film-123/master.m3u8",
          "quality": "1080p",
          "format": "HLS",
          "language": "English"
        }
      ]
    },
    {
      "externalId": "series-456",
      "title": "Example Series",
      "type": "series",
      "seasons": [
        {
          "season": 1,
          "episodes": [
            {
              "episode": 1,
              "title": "Pilot",
              "sources": [
                {
                  "url": "https://media.cinejoy.pk/series-456/s01e01/master.m3u8",
                  "quality": "1080p",
                  "format": "HLS",
                  "language": "English"
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

## Playback lifecycle

1. The sync endpoint accepts only HTTPS feed URLs on the configured discovery host allowlist and rejects redirects.
2. Direct media URLs must be HTTPS and their exact host must be listed in `STREAM_PROBE_ALLOWED_HOSTS`.
3. Imported sources are always created as `pending` and `isActive=false`.
4. An administrator must run the existing server-side source verification. Only a successful media signature check can activate a source for the existing player.
5. HLS (`.m3u8`), DASH (`.mpd`), and MP4 sources are supported by the existing playback component subject to browser/CORS/codec compatibility.

The feed must return direct media manifests/files, not a page URL, a player page, an embed wrapper, or a third-party URL that the operator is not authorized to distribute. Do not put credentials or expiring bearer tokens in a public feed. Use short-lived signed URLs or an authenticated source-resolution endpoint if the media origin requires authorization.

## Important

This connector does not guess undocumented site APIs or scrape player internals. If a site does not expose this contract yet, implement a small adapter on that site that maps its own catalogue and licensed media records into this JSON response. TMDB metadata alone is not a playback source.
