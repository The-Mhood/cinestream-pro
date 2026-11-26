"""Enhanced Scraper CLI with status and monitoring commands."""
import asyncio
import logging
import argparse
import sys
import signal
from datetime import datetime, timedelta
from sqlalchemy import func, and_

import schedule
from app.services.aggregator import run_aggregation_once
from app.database import SessionLocal
from app.db_models import AggregationRun, Movie, StreamSource, Provider

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ScraperScheduler:
    """Manages scheduled scraper tasks."""
    
    def __init__(self):
        self.running = True
        signal.signal(signal.SIGTERM, self._signal_handler)
        signal.signal(signal.SIGINT, self._signal_handler)
    
    def _signal_handler(self, sig, frame):
        """Handle shutdown signals gracefully."""
        logger.info("Received shutdown signal")
        self.running = False
    
    async def run_aggregation_job(self):
        """Run aggregation and log results."""
        logger.info("Running scheduled aggregation job...")
        try:
            results = await run_aggregation_once()
            logger.info(f"Job completed: {results}")
        except Exception as e:
            logger.error(f"Job failed: {e}", exc_info=True)
    
    def schedule_jobs(self, interval_minutes: int = 10):
        """Schedule background jobs."""
        logger.info(f"Scheduling aggregation every {interval_minutes} minutes")
        schedule.every(interval_minutes).minutes.do(
            lambda: asyncio.run(self.run_aggregation_job())
        )
    
    async def run_scheduler(self, interval_minutes: int = 10):
        """Run the scheduler loop."""
        self.schedule_jobs(interval_minutes)
        logger.info("Scheduler started, waiting for jobs...")
        
        while self.running:
            schedule.run_pending()
            await asyncio.sleep(60)
        
        logger.info("Scheduler stopped")


def show_status():
    """Show current aggregator status."""
    db = SessionLocal()
    try:
        # Get statistics
        total_movies = db.query(func.count(Movie.id)).scalar()
        total_sources = db.query(func.count(StreamSource.id)).scalar()
        total_providers = db.query(func.count(Provider.id)).scalar()
        
        # Get recent aggregation run
        latest_run = db.query(AggregationRun).order_by(
            AggregationRun.started_at.desc()
        ).first()
        
        # Get trending movies
        trending_count = db.query(func.count(Movie.id)).filter(
            Movie.is_trending == True
        ).scalar()
        
        # Get provider uptime stats
        providers = db.query(Provider).all()
        avg_uptime = sum(p.uptime_percent for p in providers) / len(providers) if providers else 0
        
        # Print status
        print("\n" + "=" * 60)
        print("CineStream Aggregator Status")
        print("=" * 60)
        
        print(f"\nDatabase Statistics:")
        print(f"  Total Movies:        {total_movies:,}")
        print(f"  Total Stream Sources: {total_sources:,}")
        print(f"  Total Providers:     {total_providers}")
        print(f"  Trending Movies:     {trending_count}")
        
        if latest_run:
            print(f"\nLatest Aggregation Run:")
            print(f"  Started:  {latest_run.started_at.isoformat()}")
            print(f"  Completed: {latest_run.completed_at.isoformat() if latest_run.completed_at else 'In Progress'}")
            print(f"  Status:   {latest_run.status.upper()}")
            print(f"  Discovered: {latest_run.titles_discovered}")
            print(f"  Verified: {latest_run.sources_verified}")
        
        print(f"\nProvider Health:")
        print(f"  Average Uptime:  {avg_uptime:.1f}%")
        
        if providers:
            print(f"\n  Provider Details:")
            for provider in providers:
                print(f"    - {provider.name}")
                print(f"      Status: {provider.status} | Uptime: {provider.uptime_percent:.1f}% | Latency: {provider.avg_latency_ms}ms")
        
        print("\n" + "=" * 60 + "\n")
        
    except Exception as e:
        logger.error(f"Error getting status: {e}")
        print(f"Error: {e}")
    finally:
        db.close()


def show_logs(hours: int = 1):
    """Show recent aggregation logs."""
    db = SessionLocal()
    try:
        cutoff_time = datetime.utcnow() - timedelta(hours=hours)
        runs = db.query(AggregationRun).filter(
            AggregationRun.started_at >= cutoff_time
        ).order_by(AggregationRun.started_at.desc()).all()
        
        print(f"\nAggregation Runs (Last {hours} hour(s)):")
        print("-" * 100)
        
        if not runs:
            print("No runs found in the specified timeframe.")
        else:
            for run in runs:
                duration = (run.completed_at - run.started_at).total_seconds() if run.completed_at else "In Progress"
                print(f"ID: {run.id} | Started: {run.started_at.isoformat()} | Status: {run.status}")
                print(f"  Discovered: {run.titles_discovered} | Verified: {run.sources_verified} | Duration: {duration}s")
                if run.error_details:
                    print(f"  Errors: {run.error_details}")
                print()
        
        print("-" * 100 + "\n")
        
    except Exception as e:
        logger.error(f"Error getting logs: {e}")
    finally:
        db.close()


async def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="CineStream Aggregator Worker",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run once and exit
  python -m app.services.scrapers_cli --once
  
  # Run scheduled every 10 minutes (default)
  python -m app.services.scrapers_cli
  
  # View current status
  python -m app.services.scrapers_cli --status
  
  # View recent logs (last 2 hours)
  python -m app.services.scrapers_cli --logs --hours 2
  
  # Run with custom interval (5 minutes)
  python -m app.services.scrapers_cli --interval 5
        """
    )
    
    parser.add_argument(
        '--once',
        action='store_true',
        help='Run aggregation once and exit'
    )
    parser.add_argument(
        '--interval',
        type=int,
        default=10,
        help='Interval in minutes between runs (default: 10)'
    )
    parser.add_argument(
        '--status',
        action='store_true',
        help='Show current aggregator status'
    )
    parser.add_argument(
        '--logs',
        action='store_true',
        help='Show recent aggregation logs'
    )
    parser.add_argument(
        '--hours',
        type=int,
        default=1,
        help='Number of hours to look back for logs (default: 1)'
    )
    parser.add_argument(
        '--log-level',
        choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'],
        default='INFO',
        help='Logging level'
    )
    
    args = parser.parse_args()
    
    # Set logging level
    logging.getLogger().setLevel(args.log_level)
    
    try:
        if args.status:
            show_status()
            return 0
        
        if args.logs:
            show_logs(hours=args.hours)
            return 0
        
        if args.once:
            logger.info("Running aggregation once...")
            results = await run_aggregation_once()
            logger.info(f"Completed: {results}")
            return 0
        
        else:
            logger.info(f"Starting scheduler with {args.interval} minute interval...")
            scheduler = ScraperScheduler()
            await scheduler.run_scheduler(interval_minutes=args.interval)
            return 0
    
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
        return 0
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
