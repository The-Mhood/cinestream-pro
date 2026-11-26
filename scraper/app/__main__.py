"""Scraper application entry point."""
import sys
import argparse
import logging
from app.services.scrapers import MediaScraper

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description='CineStream Media Scraper')
    parser.add_argument('--seed', action='store_true', help='Seed database with sample media')
    parser.add_argument('--scrape', action='store_true', help='Scrape media sources')
    
    args = parser.parse_args()
    
    scraper = MediaScraper()
    
    try:
        if args.seed:
            logger.info("Seeding database with sample media...")
            scraper.seed_database()
            logger.info("Database seeding complete!")
        elif args.scrape:
            logger.info("Starting media scraping...")
            scraper.scrape_sources()
            logger.info("Media scraping complete!")
        else:
            logger.info("No action specified. Use --seed or --scrape")
            parser.print_help()
            return 1
        return 0
    except Exception as e:
        logger.error(f"Scraper error: {e}", exc_info=True)
        return 1


if __name__ == '__main__':
    sys.exit(main())
