class AppError(Exception):
    def __init__(self, code, message, status=400, retryable=False):
        self.code, self.message, self.status, self.retryable = code, message, status, retryable
        super().__init__(message)


class ProviderError(AppError):
    def __init__(self, code="PROVIDER_UNAVAILABLE", message="Provider evidence is unavailable", retryable=True):
        super().__init__(code, message, 503, retryable)
