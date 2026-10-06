import httpx
import pytest

from scripts.check_browser_auth import check


@pytest.mark.parametrize("fault", [None, "login-challenge", "api-challenge", "html-error", "unprotected", "cached", "redirect"])
def test_browser_gateway_release_check(monkeypatch, fault):
    client_type = httpx.Client

    def gateway(request):
        assert request.url.host == "rivalpulse.example.com"
        assert "authorization" not in request.headers and "cookie" not in request.headers
        if request.url.path == "/login":
            headers = {"WWW-Authenticate": 'Basic realm="gateway"'} if fault == "login-challenge" else {}
            return httpx.Response(307 if fault == "redirect" else 200,
                                  text="<html><form>Log in</form></html>",
                                  headers={"Content-Type": "text/html", **headers})
        headers = {"Cache-Control": "public" if fault == "cached" else "no-store"}
        if fault == "api-challenge":
            headers["WWW-Authenticate"] = 'Basic realm="legacy upstream"'
        if fault == "html-error":
            return httpx.Response(401, text="<html>Unauthorized</html>", headers=headers)
        return httpx.Response(200 if fault == "unprotected" else 401,
                              json={"code": "UNAUTHORIZED", "message": "Please log in to continue"}, headers=headers)

    monkeypatch.setattr(httpx, "Client", lambda **kwargs: client_type(transport=httpx.MockTransport(gateway), **kwargs))
    failures = check("https://rivalpulse.example.com")
    assert bool(failures) == (fault is not None)


@pytest.mark.parametrize("origin", ["https://name:password@example.com", "https://example.com/backend", "file:///tmp"])
def test_release_check_rejects_credentials_and_non_origin_urls(origin):
    with pytest.raises(ValueError):
        check(origin)
