# /config.py

#------- IMPORTS -------------------------------------------------
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


'''
Class Setting to read variable from env files.
We are using pydantic class so if any variable is missing our app not crashed just a simple error message for that variable
'''

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="/var/www/html/python/second-brain/backend/.env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

   # ── Neo4j ────────────────────────────────────────────
    neo4j_uri: str
    neo4j_username: str
    neo4j_password: str

    # ── NVIDIA NIM ───────────────────────────────────────
    nvidia_api_key: str

    # ── AWS ──────────────────────────────────────────────
    aws_region: str = "ap-south-1"
    s3_bucket_uploads: str = "second-brain-uploads"
    s3_bucket_frontend: str = "second-brain-frontend"
    sqs_queue_url: str = ""          # empty in dev — SQS not set up yet

    # ── App ──────────────────────────────────────────────
    app_env: str = "development"
    allowed_origins: str = "http://localhost:5173"

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"
    
    @property
    def cors_origin(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]
    
@lru_cache
def get_settings() -> Settings:
    """
    Return same setting instance every time.
    It only read setting from env one time not 
    every funtion call.
    """
    return Settings()

settings = get_settings()