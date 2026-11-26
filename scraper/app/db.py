"""Database connection utilities."""
import os
import psycopg2
from psycopg2.extras import RealDictCursor
import logging

logger = logging.getLogger(__name__)


class Database:
    def __init__(self):
        self.connection = None
        self.connect()
    
    def connect(self):
        """Connect to PostgreSQL database."""
        db_url = os.getenv('DATABASE_URL')
        if not db_url:
            raise ValueError("DATABASE_URL environment variable not set")
        
        try:
            self.connection = psycopg2.connect(db_url)
            logger.info("Connected to database")
        except psycopg2.Error as e:
            logger.error(f"Failed to connect to database: {e}")
            raise
    
    def execute(self, query, params=None):
        """Execute a query and return results (for SELECT statements)."""
        try:
            with self.connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(query, params or ())
                self.connection.commit()
                # Only try to fetch if it's a SELECT query
                if query.strip().upper().startswith('SELECT'):
                    return cursor.fetchall()
                return []
        except psycopg2.Error as e:
            logger.error(f"Query execution error: {e}")
            self.connection.rollback()
            raise
    
    def execute_one(self, query, params=None):
        """Execute a query and return a single row."""
        results = self.execute(query, params)
        return results[0] if results else None
    
    def insert(self, table, data):
        """Insert a record into the database."""
        columns = ', '.join(data.keys())
        values = ', '.join(['%s'] * len(data))
        query = f"INSERT INTO {table} ({columns}) VALUES ({values}) RETURNING id"
        
        try:
            with self.connection.cursor() as cursor:
                cursor.execute(query, tuple(data.values()))
                self.connection.commit()
                return cursor.fetchone()[0]
        except psycopg2.Error as e:
            logger.error(f"Insert error: {e}")
            self.connection.rollback()
            raise
    
    def close(self):
        """Close database connection."""
        if self.connection:
            self.connection.close()
            logger.info("Database connection closed")
