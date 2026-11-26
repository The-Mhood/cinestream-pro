"""Bounded crawler for domains the operator owns or is authorized to assess.

The crawler stays within an explicit hostname allowlist, validates DNS results,
limits response size/depth/page count, and never follows redirects without
revalidating their destination. It inventories page and media references for
security review; it does not fetch or proxy media payloads.
"""
from __future__ import annotations

import argparse
import ipaddress
import json
import logging
import os
import socket
import time
from collections import deque
from dataclasses import asdict, dataclass, field
from typing import Iterable
from urllib.parse import urldefrag, urljoin, urlsplit, urlunsplit

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger("cinestream.discovery")
MEDIA_EXTENSIONS = (".m3u8", ".mpd", ".mp4", ".m4v", ".webm", ".mov")
REDIRECT_CODES = {301, 302, 303, 307, 308}


class ScopeViolation(ValueError):
    """Raised when a URL falls outside the authorized crawl scope."""


@dataclass
class PageRecord:
    url: str
    title: str
    depth: int
    internal_links: list[str] = field(default_factory=list)
    media_references: list[str] = field(default_factory=list)
    external_embed_hosts: list[str] = field(default_factory=list)


@dataclass
class CrawlReport:
    start_urls: list[str]
    allowed_hosts: list[str]
    pages: list[PageRecord] = field(default_factory=list)
    skipped: int = 0
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "start_urls": self.start_urls,
            "allowed_hosts": self.allowed_hosts,
            "pages_crawled": len(self.pages),
            "skipped": self.skipped,
            "errors": self.errors,
            "pages": [asdict(page) for page in self.pages],
        }


def _host_allowlist(values: Iterable[str]) -> set[str]:
    return {value.strip().lower().rstrip(".") for value in values if value.strip()}


def _is_public_hostname(hostname: str) -> bool:
    """Reject IP literals and hostnames resolving to any non-global address."""
    try:
        ipaddress.ip_address(hostname)
        return False
    except ValueError:
        pass

    if (
        hostname == "localhost"
        or hostname.endswith((".localhost", ".local", ".internal", ".test", ".invalid"))
    ):
        return False

    try:
        addresses = socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return False

    if not addresses:
        return False

    for address in addresses:
        try:
            parsed = ipaddress.ip_address(address[4][0])
        except ValueError:
            return False
        if not parsed.is_global:
            return False
    return True


def normalize_scoped_url(value: str, allowed_hosts: set[str]) -> str:
    """Normalize an HTTPS URL and enforce exact hostname scope."""
    try:
        parsed = urlsplit(value)
        hostname = (parsed.hostname or "").lower().rstrip(".")
        port = parsed.port
    except ValueError as exc:
        raise ScopeViolation("Malformed URL") from exc

    if parsed.scheme.lower() != "https":
        raise ScopeViolation("Only HTTPS URLs are allowed")
    if parsed.username or parsed.password:
        raise ScopeViolation("URLs containing credentials are not allowed")
    if port not in (None, 443):
        raise ScopeViolation("Non-standard ports are not allowed")
    if hostname not in allowed_hosts:
        raise ScopeViolation("Hostname is outside DISCOVERY_ALLOWED_HOSTS")
    if not _is_public_hostname(hostname):
        raise ScopeViolation("Hostname does not resolve exclusively to public IPs")

    clean = parsed._replace(fragment="")
    return urlunsplit(clean)


class AuthorizedSiteCrawler:
    def __init__(
        self,
        allowed_hosts: Iterable[str],
        max_pages: int = 100,
        max_depth: int = 2,
        timeout: float = 8.0,
        delay_seconds: float = 0.5,
        max_response_bytes: int = 2_000_000,
        user_agent: str = "CineStreamProSecurityResearch/1.0",
    ) -> None:
        self.allowed_hosts = _host_allowlist(allowed_hosts)
        if not self.allowed_hosts:
            raise ValueError("At least one DISCOVERY_ALLOWED_HOSTS entry is required")
        self.max_pages = max(1, min(max_pages, 500))
        self.max_depth = max(0, min(max_depth, 5))
        self.timeout = max(1.0, min(timeout, 20.0))
        self.delay_seconds = max(0.0, min(delay_seconds, 5.0))
        self.max_response_bytes = max(64_000, min(max_response_bytes, 5_000_000))
        self.session = requests.Session()
        self.session.trust_env = False
        self.session.headers.update({"User-Agent": user_agent})

    def close(self) -> None:
        self.session.close()

    def _get_html(self, initial_url: str) -> tuple[str, str] | None:
        current = normalize_scoped_url(initial_url, self.allowed_hosts)

        for _ in range(4):
            response = self.session.get(
                current,
                timeout=self.timeout,
                allow_redirects=False,
                stream=True,
            )
            if response.status_code in REDIRECT_CODES:
                location = response.headers.get("Location")
                response.close()
                if not location:
                    return None
                current = normalize_scoped_url(
                    urljoin(current, location), self.allowed_hosts
                )
                continue

            if response.status_code != 200:
                response.close()
                return None

            content_type = response.headers.get("Content-Type", "").lower()
            if "text/html" not in content_type and "application/xhtml+xml" not in content_type:
                response.close()
                return None

            chunks: list[bytes] = []
            total = 0
            try:
                for chunk in response.iter_content(chunk_size=32_768):
                    if not chunk:
                        continue
                    total += len(chunk)
                    if total > self.max_response_bytes:
                        return None
                    chunks.append(chunk)
            finally:
                response.close()

            encoding = response.encoding or "utf-8"
            return current, b"".join(chunks).decode(encoding, errors="replace")

        return None

    def _extract(self, page_url: str, html: str, depth: int) -> PageRecord:
        soup = BeautifulSoup(html, "lxml")
        title = soup.title.get_text(" ", strip=True) if soup.title else ""
        if not title:
            heading = soup.find(["h1", "h2"])
            title = heading.get_text(" ", strip=True) if heading else ""

        internal_links: set[str] = set()
        media_references: set[str] = set()
        external_embed_hosts: set[str] = set()

        for anchor in soup.find_all("a", href=True):
            candidate = urljoin(page_url, anchor["href"])
            try:
                normalized = normalize_scoped_url(candidate, self.allowed_hosts)
            except ScopeViolation:
                continue
            path = urlsplit(normalized).path.lower()
            if not path.endswith(MEDIA_EXTENSIONS):
                internal_links.add(normalized)

        for tag in soup.find_all(["video", "source"]):
            raw = tag.get("src")
            if not raw:
                continue
            candidate = urljoin(page_url, raw)
            try:
                normalized = normalize_scoped_url(candidate, self.allowed_hosts)
            except ScopeViolation:
                continue
            if urlsplit(normalized).path.lower().endswith(MEDIA_EXTENSIONS):
                media_references.add(normalized)

        for frame in soup.find_all("iframe", src=True):
            candidate = urljoin(page_url, frame["src"])
            host = (urlsplit(candidate).hostname or "").lower().rstrip(".")
            if host in self.allowed_hosts:
                try:
                    normalized = normalize_scoped_url(candidate, self.allowed_hosts)
                    internal_links.add(normalized)
                except ScopeViolation:
                    pass
            elif host:
                # Record only the external host for triage; do not fetch or
                # persist the third-party embed URL outside the authorized scope.
                external_embed_hosts.add(host)

        for meta in soup.find_all("meta"):
            key = (meta.get("property") or meta.get("name") or "").lower()
            value = meta.get("content")
            if key in {"og:video", "og:video:url"} and value:
                candidate = urljoin(page_url, value)
                try:
                    normalized = normalize_scoped_url(candidate, self.allowed_hosts)
                except ScopeViolation:
                    continue
                if urlsplit(normalized).path.lower().endswith(MEDIA_EXTENSIONS):
                    media_references.add(normalized)

        return PageRecord(
            url=page_url,
            title=title[:300],
            depth=depth,
            internal_links=sorted(internal_links),
            media_references=sorted(media_references),
            external_embed_hosts=sorted(external_embed_hosts),
        )

    def crawl(self, start_urls: Iterable[str]) -> CrawlReport:
        starts = [
            normalize_scoped_url(url, self.allowed_hosts) for url in start_urls
        ]
        report = CrawlReport(start_urls=starts, allowed_hosts=sorted(self.allowed_hosts))
        queue = deque((url, 0) for url in starts)
        visited: set[str] = set()

        try:
            while queue and len(report.pages) < self.max_pages:
                url, depth = queue.popleft()
                if url in visited:
                    continue
                visited.add(url)

                try:
                    fetched = self._get_html(url)
                    if fetched is None:
                        report.skipped += 1
                        continue
                    final_url, html = fetched
                    if final_url in visited and final_url != url:
                        report.skipped += 1
                        continue
                    visited.add(final_url)
                    page = self._extract(final_url, html, depth)
                    report.pages.append(page)

                    if depth < self.max_depth:
                        for link in page.internal_links:
                            if link not in visited:
                                queue.append((link, depth + 1))
                except ScopeViolation as exc:
                    report.skipped += 1
                    report.errors.append(f"{url}: {exc}")
                except requests.RequestException as exc:
                    report.errors.append(f"{url}: request failed ({type(exc).__name__})")
                except Exception as exc:
                    logger.exception("Unexpected crawl failure for %s", url)
                    report.errors.append(f"{url}: unexpected failure ({type(exc).__name__})")

                if queue and self.delay_seconds:
                    time.sleep(self.delay_seconds)
        finally:
            self.close()

        return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Crawl an authorized website scope")
    parser.add_argument("--start-url", action="append", required=True)
    parser.add_argument("--max-pages", type=int, default=100)
    parser.add_argument("--max-depth", type=int, default=2)
    args = parser.parse_args()

    allowed = os.getenv("DISCOVERY_ALLOWED_HOSTS", "").split(",")
    crawler = AuthorizedSiteCrawler(
        allowed_hosts=allowed,
        max_pages=args.max_pages,
        max_depth=args.max_depth,
    )
    report = crawler.crawl(args.start_url)
    print(json.dumps(report.to_dict(), indent=2))


if __name__ == "__main__":
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    main()
