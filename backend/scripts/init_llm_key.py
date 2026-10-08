"""Create a private encryption key once. Never print or overwrite its contents."""
import os
from pathlib import Path

from cryptography.fernet import Fernet


def initialize(path):
    path = Path(path)
    if path.exists():
        if not path.is_file():
            raise ValueError("Encryption key path must be a private file")
        Fernet(path.read_bytes().strip())
        return False
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as output:
        output.write(Fernet.generate_key() + b"\n")
    return True


if __name__ == "__main__":
    initialize(Path(__file__).resolve().parents[1] / ".env.llm-encryption")
    print("Private LLM encryption key is ready; its contents were not displayed.")
