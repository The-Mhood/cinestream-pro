import unittest
from unittest.mock import patch

from app.services.authorized_crawler import (
    AuthorizedSiteCrawler,
    ScopeViolation,
    normalize_scoped_url,
)


class UrlScopeTests(unittest.TestCase):
    def setUp(self):
        self.allowed = {"media.example.org"}

    @patch("app.services.authorized_crawler._is_public_hostname", return_value=True)
    def test_accepts_allowlisted_https_host_and_removes_fragment(self, _dns):
        result = normalize_scoped_url(
            "https://media.example.org/catalog#section", self.allowed
        )
        self.assertEqual(result, "https://media.example.org/catalog")

    def test_rejects_http(self):
        with self.assertRaises(ScopeViolation):
            normalize_scoped_url("http://media.example.org/", self.allowed)

    def test_rejects_unlisted_host(self):
        with self.assertRaises(ScopeViolation):
            normalize_scoped_url("https://outside.example.net/", self.allowed)

    def test_rejects_credentials(self):
        with self.assertRaises(ScopeViolation):
            normalize_scoped_url(
                "https://user:secret@media.example.org/", self.allowed
            )

    def test_rejects_ip_literal(self):
        with self.assertRaises(ScopeViolation):
            normalize_scoped_url("https://127.0.0.1/", {"127.0.0.1"})

    def test_rejects_non_standard_port(self):
        with self.assertRaises(ScopeViolation):
            normalize_scoped_url("https://media.example.org:8443/", self.allowed)


class ExtractionTests(unittest.TestCase):
    @patch("app.services.authorized_crawler._is_public_hostname", return_value=True)
    def test_extracts_only_in_scope_media_and_records_external_embed_host(self, _dns):
        crawler = AuthorizedSiteCrawler(
            allowed_hosts={"media.example.org"},
            max_pages=5,
            max_depth=1,
            delay_seconds=0,
        )
        html = """
        <html>
          <head>
            <title>Authorized Test Film</title>
            <meta property="og:video" content="/assets/preview.mp4">
          </head>
          <body>
            <a href="/catalog/next">Next page</a>
            <a href="https://outside.example.net/movie">Out of scope</a>
            <video src="/media/clip.mp4"></video>
            <source src="https://outside.example.net/clip.mp4">
            <iframe src="/embed/player/123"></iframe>
            <iframe src="https://third-party.example/embed/abc"></iframe>
          </body>
        </html>
        """
        try:
            page = crawler._extract("https://media.example.org/watch/1", html, 0)
        finally:
            crawler.close()

        self.assertEqual(page.title, "Authorized Test Film")
        self.assertIn("https://media.example.org/catalog/next", page.internal_links)
        self.assertIn("https://media.example.org/embed/player/123", page.internal_links)
        self.assertEqual(
            page.media_references,
            [
                "https://media.example.org/assets/preview.mp4",
                "https://media.example.org/media/clip.mp4",
            ],
        )
        self.assertEqual(page.external_embed_hosts, ["third-party.example"])

    def test_crawler_requires_explicit_scope(self):
        with self.assertRaises(ValueError):
            AuthorizedSiteCrawler(allowed_hosts=[])



class DnsSafetyTests(unittest.TestCase):
    @patch(
        "app.services.authorized_crawler.socket.getaddrinfo",
        return_value=[(None, None, None, None, ("93.184.216.34", 443))],
    )
    def test_accepts_public_dns_address(self, _lookup):
        from app.services.authorized_crawler import _is_public_hostname

        self.assertTrue(_is_public_hostname("media.example.org"))

    @patch(
        "app.services.authorized_crawler.socket.getaddrinfo",
        return_value=[(None, None, None, None, ("127.0.0.1", 443))],
    )
    def test_rejects_private_dns_address(self, _lookup):
        from app.services.authorized_crawler import _is_public_hostname

        self.assertFalse(_is_public_hostname("media.example.org"))

    @patch(
        "app.services.authorized_crawler.socket.getaddrinfo",
        return_value=[
            (None, None, None, None, ("93.184.216.34", 443)),
            (None, None, None, None, ("10.0.0.8", 443)),
        ],
    )
    def test_rejects_hostname_with_mixed_public_and_private_dns(self, _lookup):
        from app.services.authorized_crawler import _is_public_hostname

        self.assertFalse(_is_public_hostname("media.example.org"))


if __name__ == "__main__":
    unittest.main()
