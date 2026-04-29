from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
import os


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # App
    APP_NAME: str = "DDoS Prefix Manager"
    SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION_USE_STRONG_RANDOM_STRING"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_HOURS: int = 8

    # Database
    DB_PATH: str = "/app/data/ddos.db"

    # TLS Cert paths
    CERT_DIR: str = "/app/data/certs"

    # Imperva API
    IMPERVA_API_BASE_URL: str = "https://api.imperva.com"
    IMPERVA_DEBUG: bool = False  # Set to True to log full API responses

    # Scheduler
    POLL_INTERVAL_SECONDS: int = 60

    @property
    def DATABASE_URL(self) -> str:
        return f"sqlite:///{self.DB_PATH}"

    @property
    def CERT_PATH(self) -> str:
        return os.path.join(self.CERT_DIR, "server.crt")

    @property
    def KEY_PATH(self) -> str:
        return os.path.join(self.CERT_DIR, "server.key")


@lru_cache()
def get_settings() -> Settings:
    return Settings()
