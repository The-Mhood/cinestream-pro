# Open-content catalogue integration

CineStream's open catalogue importer discovers Internet Archive movie items with
an explicitly declared Creative Commons or Public Domain licence, then indexes a
public MP4 rendition only after its download URL passes a one-byte HTTP Range
probe.

## Scope and rights

"All movies" cannot mean every movie ever made: most films are copyrighted and
are not available for unrestricted redistribution. This importer covers the
discoverable Internet Archive movie records whose metadata declares one of the
commercially reusable licences in `app/services/open_catalog.py` and whose
metadata exposes a publicly reachable MP4 file.

The initial allowlist includes CC0, Public Domain Mark, CC BY and CC BY-SA
versions 2.0, 2.5, 3.0 and 4.0. NonCommercial and NoDerivatives variants are
excluded. Review each item's licence and attribution before production use;
metadata supplied by an archive uploader is not a legal guarantee.

The importer stores the Internet Archive identifier, exact licence URL and
creator attribution on `media_items`. The watch page displays this provenance.
It does not download or mirror the film: playback uses the Archive's original
file URL.

## Local use

Run from the repository's `scraper/` directory with the Python 3.12 virtual
environment activated and `DATABASE_URL` pointing at the same PostgreSQL
database used by Next.js:

```bash
python -m app --open-catalog --limit 10
```

Check the first import and playback in the browser. To import every eligible
search result returned by the Internet Archive query:

```bash
python -m app --open-catalog --limit 0
```

The default limit is 100. Imports are idempotent by Internet Archive identifier
and merge with an existing CineStream record when title and release year match.
The importer marks the known placeholder `.example.com` and `.invalid`
stream URLs offline before adding verified Archive sources.

## Data source and API

- Internet Archive Advanced Search API:
  `https://archive.org/advancedsearch.php`
- Item metadata API:
  `https://archive.org/metadata/{identifier}`
- Item detail page:
  `https://archive.org/details/{identifier}`

The catalog search is not a promise that every result has a playable MP4. Items
without an allowlisted licence, public MP4 metadata or a successful range probe
are skipped and counted in the import summary.
