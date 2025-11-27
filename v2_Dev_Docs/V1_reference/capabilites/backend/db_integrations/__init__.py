"""
Database Integrations Module

Provides Redis and Supabase integration for the QuFLX Trading Platform.
"""

from backend.db_integrations.redis_integration import RedisIntegration
from backend.db_integrations.redis_batch_processor import RedisBatchProcessor

try:
    from backend.db_integrations.supabase_csv_ingestion import SupabaseCSVIngestion
    from backend.db_integrations.supabase_data_queries import SupabaseDataQueries
except Exception:
    SupabaseCSVIngestion = None
    SupabaseDataQueries = None

__all__ = [
    'RedisIntegration',
    'RedisBatchProcessor',
    'SupabaseCSVIngestion',
    'SupabaseDataQueries',
]
