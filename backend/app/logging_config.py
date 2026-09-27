import json
import logging


class SafeFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({"level": record.levelname, "event": record.getMessage(),
                           **{key: getattr(record, key) for key in
                              ("run_id", "stage", "duration_ms", "error_code", "estimated_credits",
                               "cache_status", "input_tokens", "output_tokens") if hasattr(record, key)}})


def configure_logging():
    handler = logging.StreamHandler()
    handler.setFormatter(SafeFormatter())
    logger = logging.getLogger("rivalpulse")
    logger.handlers = [handler]
    logger.setLevel(logging.INFO)
    logging.getLogger("httpx").setLevel(logging.WARNING)
