import os
from dotenv import load_dotenv

# Load from .env file if it exists (for local development)
# Replit Secrets will override these automatically
load_dotenv()

# Supabase Configuration for QuFLX Project
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
DB_PASSWORD = os.getenv("DB_PASSWORD")

# Database connection settings
DB_HOST = os.getenv("DB_HOST")
DB_PORT = int(os.getenv("DB_PORT", 5432))  # Convert to int
DB_NAME = "postgres"
DB_USER = os.getenv("DB_USER")

# Batch processing settings
BATCH_SIZE = 1000
MAX_RETRIES = 3
TIMEOUT_SECONDS = 30