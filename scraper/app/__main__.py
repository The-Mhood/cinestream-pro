"""Scraper application entry point."""
import sys
import argparse
import logging

from app.db import Database
from app.services.scrapers import MediaScraper
from app.services.open_catalog import InternetArchiveOpenCatalog

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="CineStream Media Scraper")
    actions = parser.add_mutually_exclusive_group(required=True)
    actions.add_argument("--seed", action="store_true", help="Seed legacy sample media")
    actions.add_argument("--scrape", action="store_true", help="Run legacy scraper")
    actions.add_argument(
        "--open-catalog",
        action="store_true",
        help="Import openly licensed, publicly playable Internet Archive films",
    )
    parser.add_argument("--limit", type=int, default=100, help="Maximum open films to import; use 0 to import all eligible results")
    parser.add_argument("--page-size", type=int, default=50, help="Internet Archive search page size")
    parser.add_argument("--start-page", type=int, default=1, help="Internet Archive search page to start from")
    args = parser.parse_args()

    try:
        if args.open_catalog:
            database = Database()
            try:
                result = InternetArchiveOpenCatalog(database).run(
                    limit=args.limit,
                    page_size=args.page_size,
                    start_page=args.start_page,
                )
                logger.info("Open catalogue import complete: %s", result)
            finally:
                database.close()
        elif args.seed:
            scraper = MediaScraper()
            scraper.seed_database()
            logger.info("Legacy sample database seeding complete.")
        elif args.scrape:
            scraper = MediaScraper()
            scraper.scrape_sources()
            logger.info("Legacy scraping command completed.")

        return 0
    except Exception as exc:
        logger.error("Scraper error: %s", exc, exc_info=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
