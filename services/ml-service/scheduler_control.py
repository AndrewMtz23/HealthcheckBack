"""Controls whether background scraping jobs run in the ML service."""

from collections.abc import Mapping


def scheduler_enabled(environ: Mapping[str, str]) -> bool:
    """Enable scraping only by explicit opt-in, and never in diagnostic mode."""
    if environ.get("HEALTHCHECK_DIAGNOSTIC") == "1":
        return False
    return environ.get("ML_SCHEDULER_ENABLED", "").strip().lower() in {
        "1", "true", "yes", "on"
    }
