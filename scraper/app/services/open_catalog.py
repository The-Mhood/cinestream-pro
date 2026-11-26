"""Import openly licensed feature films and shorts from Internet Archive.

Only records with an explicitly recognized, commercially reusable licence and a
public MP4 file are imported. Internet Archive metadata is not itself a blanket
licence; every imported item retains its source identifier and licence URL.
"""
from __future__ import annotations

import argparse
import logging
import re
import unicodedata
from typing import Any
from urllib.parse import quote

import requests

from app.db import Database

logger = logging.getLogger(__name__)

ADVANCED_SEARCH_URL = "https://archive.org/advancedsearch.php"
METADATA_URL = "https://archive.org/metadata/{identifier}"
ARCHIVE_DOWNLOAD_URL = "https://archive.org/download/{identifier}/{filename}"

# These licences permit redistribution, including commercial use, subject to
# their terms. NonCommercial and NoDerivatives licences are intentionally
# excluded from this first production-safe import.
ALLOWED_LICENSES = {
    "http://creativecommons.org/publicdomain/mark/1.0/",
    "https://creativecommons.org/publicdomain/mark/1.0/",
    "http://creativecommons.org/publicdomain/zero/1.0/",
    "https://creativecommons.org/publicdomain/zero/1.0/",
    "http://creativecommons.org/licenses/by/2.0/",
    "https://creativecommons.org/licenses/by/2.0/",
    "http://creativecommons.org/licenses/by/2.5/",
    "https://creativecommons.org/licenses/by/2.5/",
    "http://creativecommons.org/licenses/by/3.0/",
    "https://creativecommons.org/licenses/by/3.0/",
    "http://creativecommons.org/licenses/by/4.0/",
    "https://creativecommons.org/licenses/by/4.0/",
    "http://creativecommons.org/licenses/by-sa/2.0/",
    "https://creativecommons.org/licenses/by-sa/2.0/",
    "http://creativecommons.org/licenses/by-sa/2.5/",
    "https://creativecommons.org/licenses/by-sa/2.5/",
    "http://creativecommons.org/licenses/by-sa/3.0/",
    "https://creativecommons.org/licenses/by-sa/3.0/",
    "http://creativecommons.org/licenses/by-sa/4.0/",
    "https://creativecommons.org/licenses/by-sa/4.0/",
}


def _plain_text(value: Any) -> str:
    if isinstance(value, list):
        return " ".join(str(part) for part in value if part)
    if isinstance(value, dict):
        return " ".join(str(part) for part in value.values() if part)
    return str(value or "").strip()


def _slug(value: str, identifier: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    stem = re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-") or "open-film"
    suffix = re.sub(r"[^a-zA-Z0-9_-]", "", identifier.lower())[:48]
    return f"ia-{stem[:150]}-{suffix}"


def _is_public_mp4(file_record: dict[str, Any]) -> bool:
    name = str(file_record.get("name", ""))
    fmt = str(file_record.get("format", "")).lower()
    return (
        name.lower().endswith(".mp4")
        and (not fmt or "mpeg4" in fmt or "mpeg-4" in fmt or fmt == "unknown")
        and str(file_record.get("private", "")).lower() not in {"true", "1"}
        and not file_record.get("source") == "metadata"
    )


class InternetArchiveOpenCatalog:
    def __init__(self, database: Database, timeout: int = 25):
        self.db = database
        self.http = requests.Session()
        self.http.headers.update({
            "User-Agent": "CineStreamPro/1.0 (open-media-catalog)"
        })
        self.timeout = timeout

    def prepare_schema(self) -> None:
        """Add provenance/licensing columns without disturbing existing rows."""
        self.db.execute("""
            ALTER TABLE media_items
              ADD COLUMN IF NOT EXISTS source_identifier TEXT,
              ADD COLUMN IF NOT EXISTS license_url TEXT,
              ADD COLUMN IF NOT EXISTS attribution TEXT;
            CREATE UNIQUE INDEX IF NOT EXISTS media_items_source_identifier_idx
              ON media_items(source_identifier)
              WHERE source_identifier IS NOT NULL;
        """)
        self.db.execute("""
            INSERT INTO providers
              (slug, name, base_url, status, avg_latency_ms, uptime_percent, total_streams_indexed)
            VALUES
              ('internet-archive', 'Internet Archive — Openly Licensed Films',
               'https://archive.org', 'active', 0, 100.0, 0)
            ON CONFLICT (slug) DO UPDATE
              SET name = EXCLUDED.name, base_url = EXCLUDED.base_url;
            UPDATE stream_sources
              SET status = 'offline', is_active = FALSE
              WHERE url LIKE '%example.com%'
                 OR url LIKE '%offline-mirror.invalid%'
                 OR url LIKE '%stream.example.com%';
            UPDATE providers
              SET status = 'offline'
              WHERE base_url LIKE '%example.com%';
        """)

    def search(self, page: int, rows: int) -> tuple[list[dict[str, Any]], int]:
        params = [
            ("q", "mediatype:movies AND licenseurl:*"),
            ("fl[]", "identifier"),
            ("fl[]", "title"),
            ("fl[]", "year"),
            ("fl[]", "description"),
            ("fl[]", "creator"),
            ("fl[]", "licenseurl"),
            ("rows", str(rows)),
            ("page", str(page)),
            ("output", "json"),
            ("sort[]", "downloads desc"),
        ]
        response = self.http.get(ADVANCED_SEARCH_URL, params=params, timeout=self.timeout)
        response.raise_for_status()
        payload = response.json()
        response_data = payload.get("response", {})
        return response_data.get("docs", []), int(response_data.get("numFound", 0))

    def get_item(self, identifier: str) -> dict[str, Any]:
        response = self.http.get(
            METADATA_URL.format(identifier=quote(identifier, safe="")),
            timeout=self.timeout,
        )
        response.raise_for_status()
        return response.json()

    def _verified_mp4_url(self, identifier: str, candidates: list[dict[str, Any]]) -> tuple[str, str] | None:
        """Return the first publicly reachable MP4, checking the actual file endpoint."""
        for entry in candidates:
            filename = str(entry.get("name", ""))
            url = ARCHIVE_DOWNLOAD_URL.format(
                identifier=quote(identifier, safe=""),
                filename=quote(filename, safe="/"),
            )
            try:
                response = self.http.get(
                    url,
                    headers={"Range": "bytes=0-0"},
                    stream=True,
                    timeout=self.timeout,
                )
                try:
                    content_type = response.headers.get("Content-Type", "").split(";")[0].lower()
                    if response.status_code in (200, 206) and content_type in {
                        "video/mp4", "application/mp4", "application/octet-stream"
                    }:
                        return filename, response.url
                finally:
                    response.close()
            except requests.RequestException as exc:
                logger.debug("MP4 probe failed for %s/%s: %s", identifier, filename, exc)
        return None

    def import_item(self, record: dict[str, Any]) -> bool:
        identifier = str(record.get("identifier", "")).strip()
        title = _plain_text(record.get("title"))
        license_url = _plain_text(record.get("licenseurl"))

        if not identifier or not title or license_url not in ALLOWED_LICENSES:
            return False

        metadata = self.get_item(identifier)
        item_metadata = metadata.get("metadata", {})
        # Prefer the canonical item metadata licence over search-index data.
        canonical_license = _plain_text(item_metadata.get("licenseurl")) or license_url
        if canonical_license not in ALLOWED_LICENSES:
            return False

        files = metadata.get("files", [])
        candidates = [entry for entry in files if isinstance(entry, dict) and _is_public_mp4(entry)]
        if not candidates:
            logger.info("Skipping %s: no public MP4 file", identifier)
            return False

        # Prefer the largest rendition, but only store a URL that answers a
        # one-byte HTTP range request as actual MP4 content.
        candidates.sort(key=lambda entry: int(entry.get("size", 0) or 0), reverse=True)
        verified = self._verified_mp4_url(identifier, candidates)
        if not verified:
            logger.info("Skipping %s: no publicly reachable MP4 rendition", identifier)
            return False
        filename, playback_url = verified
        creator = _plain_text(item_metadata.get("creator") or record.get("creator"))
        attribution = creator or "Creator not specified in Internet Archive metadata"
        year_value = _plain_text(item_metadata.get("year") or item_metadata.get("date") or record.get("year"))
        year_match = re.search(r"(18|19|20)\d{2}", year_value)
        release_year = int(year_match.group(0)) if year_match else 0
        description = _plain_text(item_metadata.get("description") or record.get("description"))
        description = description[:12000] or f"Openly licensed film hosted by Internet Archive. Archive identifier: {identifier}."
        media_slug = _slug(title, identifier)
        poster_url = f"https://archive.org/services/img/{quote(identifier, safe='')}"

        provider = self.db.execute_one(
            "SELECT id, name FROM providers WHERE slug = %s",
            ("internet-archive",),
        )
        if not provider:
            raise RuntimeError("Internet Archive provider row was not created")

        with self.db.connection.cursor() as cursor:
            # Merge by archive identifier first, then title/year, so the
            # existing CineStream sample entries become licensed records
            # instead of appearing as duplicate titles.
            cursor.execute("""
                SELECT id FROM media_items
                WHERE source_identifier = %s
                   OR (LOWER(title) = LOWER(%s) AND release_year = %s)
                ORDER BY CASE WHEN source_identifier = %s THEN 0 ELSE 1 END
                LIMIT 1
            """, (identifier, title, release_year, identifier))
            existing = cursor.fetchone()

            if existing:
                media_id = existing[0]
                cursor.execute("""
                    UPDATE media_items
                    SET source_identifier = COALESCE(source_identifier, %s),
                        license_url = %s,
                        attribution = %s,
                        poster_path = %s,
                        backdrop_path = %s,
                        discovered_via = 'Internet Archive Open Catalog',
                        overview = CASE WHEN overview = '' THEN %s ELSE overview END
                    WHERE id = %s
                """, (
                    identifier, canonical_license, attribution, poster_url,
                    poster_url, description, media_id,
                ))
            else:
                cursor.execute("""
                    INSERT INTO media_items
                      (slug, title, type, poster_path, backdrop_path, overview,
                       release_year, duration_minutes, rating, genres, cast_list,
                       seasons_count, episodes_count, tmdb_id, is_trending,
                       discovered_via, source_identifier, license_url, attribution)
                    VALUES
                      (%s, %s, 'movie', %s, %s, %s, %s, 0, 0, 'Openly Licensed',
                       %s, 1, 1, NULL, FALSE, 'Internet Archive Open Catalog',
                       %s, %s, %s)
                    RETURNING id
                """, (
                    media_slug, title, poster_url, poster_url, description,
                    release_year, attribution, identifier, canonical_license, attribution,
                ))
                media_id = cursor.fetchone()[0]

            cursor.execute("""
                INSERT INTO stream_sources
                  (media_id, provider_id, provider_name, server_label, url,
                   quality, format, language, season, episode, status, is_active)
                SELECT %s, %s, %s, %s, %s, 'Source', 'MP4', 'Original', 1, 1, 'active', TRUE
                WHERE NOT EXISTS (
                  SELECT 1 FROM stream_sources WHERE media_id = %s AND url = %s
                )
            """, (
                media_id, provider["id"], provider["name"],
                f"Internet Archive · {filename}", playback_url, media_id, playback_url,
            ))
            self.db.connection.commit()

        return True

    def run(self, limit: int = 100, page_size: int = 50, start_page: int = 1) -> dict[str, int]:
        if limit < 0 or page_size < 1 or start_page < 1:
            raise ValueError("limit must be zero (unlimited) or positive; page_size and start_page must be positive")
        self.prepare_schema()
        imported = 0
        examined = 0
        rejected_or_unplayable = 0
        page = start_page
        total_available = None

        while limit == 0 or imported < limit:
            remaining = page_size if limit == 0 else max(page_size, limit - imported + rejected_or_unplayable)
            records, total = self.search(page=page, rows=min(page_size, remaining))
            total_available = total
            if not records:
                break
            for record in records:
                examined += 1
                try:
                    if self.import_item(record):
                        imported += 1
                    else:
                        rejected_or_unplayable += 1
                except requests.RequestException as exc:
                    rejected_or_unplayable += 1
                    logger.warning("Archive item %s could not be retrieved: %s", record.get("identifier"), exc)
                if limit > 0 and imported >= limit:
                    break
            logger.info(
                "Open catalog progress: imported=%s examined=%s indexed_total=%s",
                imported, examined, total_available,
            )
            if page * page_size >= total:
                break
            page += 1

        return {
            "imported": imported,
            "examined": examined,
            "skipped": rejected_or_unplayable,
            "archive_search_matches": total_available or 0,
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="Import openly licensed Internet Archive films")
    parser.add_argument("--limit", type=int, default=100, help="Maximum number of films to import (default: 100)")
    parser.add_argument("--page-size", type=int, default=50, help="Internet Archive search page size (default: 50)")
    parser.add_argument("--start-page", type=int, default=1, help="Search page to start from (default: 1)")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    database = Database()
    try:
        result = InternetArchiveOpenCatalog(database).run(
            limit=args.limit,
            page_size=args.page_size,
            start_page=args.start_page,
        )
        logger.info("Open catalogue import complete: %s", result)
        return 0
    except Exception:
        logger.exception("Open catalogue import failed")
        return 1
    finally:
        database.close()


if __name__ == "__main__":
    raise SystemExit(main())
