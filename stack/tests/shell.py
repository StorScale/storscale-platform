"""The platform's shell, in a real browser (Chromium): docker compose run --rm test-browser

  1. alice signs in to the platform once, with Keycloak's form;
  2. then opens notebooks, SQL, dashboards, pipelines and monitoring in the
     platform's frame, each signed in as alice, without another sign-in;
  3. carol (in neither group) signs in, and the platform refuses her;
  4. signing out of the platform ends the Keycloak session too.

Chromium resolves *.localhost names to its own machine, as every browser
does, so this listens on 127.0.0.1:STORSCALE_PORT and passes connections on
to the gateway: the browser uses the addresses a person's browser would.
"""
import os
import re
import socket
import sys
import threading
import time

from playwright.sync_api import sync_playwright

PORT = int(os.environ["STORSCALE_PORT"])
PLATFORM = f"http://{os.environ['STORSCALE_DOMAIN']}:{PORT}"
AUTH_HOST = f"auth.{os.environ['STORSCALE_DOMAIN']}:{PORT}"
PASSWORD = os.environ["LAKEHOUSE_USER_PASSWORD"]

# Each tool, and where its frame should end up once alice is signed in to it.
TOOLS = {
    "notebooks": r"//notebooks\.[^/]+/user/alice/lab",
    "sql": r"//dashboards\.[^/]+/sqllab",
    "dashboards": r"//dashboards\.[^/]+/dashboard/list",
    "pipelines": r"//pipelines\.[^/]+/(\?.*)?$",
    "monitoring": r"//monitoring\.[^/]+/(\?.*)?$",
}

failures = []


def check(name, ok, detail=""):
    print(f"{'ok  ' if ok else 'FAIL'} {name}{f'  ({detail})' if detail else ''}", flush=True)
    if not ok:
        failures.append(name)


def forward(port, host):
    """127.0.0.1:port -> host:port, for as long as this runs."""
    listener = socket.create_server(("127.0.0.1", port))

    def pipe(a, b):
        try:
            while data := a.recv(65536):
                b.sendall(data)
        except OSError:
            pass
        finally:
            for s in (a, b):
                try:
                    s.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass

    def serve():
        while True:
            client, _ = listener.accept()
            upstream = socket.create_connection((host, port))
            threading.Thread(target=pipe, args=(client, upstream), daemon=True).start()
            threading.Thread(target=pipe, args=(upstream, client), daemon=True).start()

    threading.Thread(target=serve, daemon=True).start()


def sign_in(page, user):
    """Keycloak's form, as a person fills it in."""
    page.wait_for_selector("#kc-form-login", timeout=60_000)
    page.fill("#username", user)
    page.fill("#password", PASSWORD)
    page.click("#kc-login")


def main():
    forward(PORT, "gateway")
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # 1. alice signs in, once.
        ctx = browser.new_context(viewport={"width": 1400, "height": 900})
        sign_ins = []
        ctx.on("request", lambda r: sign_ins.append(r.url) if r.method == "POST" and AUTH_HOST in r.url
               and "/login-actions/authenticate" in r.url else None)
        page = ctx.new_page()
        page.goto(PLATFORM)
        sign_in(page, "alice")
        page.wait_for_selector("[data-testid=greeting]", timeout=60_000)
        check("alice signs in to the platform with Keycloak", "Alice" in page.inner_text("[data-testid=greeting]"),
              page.inner_text("[data-testid=greeting]"))
        names = [a.inner_text() for a in page.query_selector_all(".sidebar a")]
        check("... and the platform lists her tools", all(n in names for n in ("Notebooks", "SQL", "Dashboards", "Pipelines", "Monitoring"))
              and "Access policies ↗" not in names, ", ".join(names))

        # 2. Each tool, in the platform's frame, without another sign-in.
        for tool, where in TOOLS.items():
            page.click(f"[data-testid=nav-{tool}]")
            frame, deadline = None, time.time() + 120
            while time.time() < deadline:
                el = page.query_selector(f"[data-testid=frame-{tool}]")
                frame = el.content_frame() if el else None
                if frame and re.search(where, frame.url):
                    break
                time.sleep(1)
            url = frame.url if frame else "no frame"
            shown = frame is not None and re.search(where, url) is not None
            if shown:
                frame.wait_for_load_state("load")
            on_keycloak = frame is not None and AUTH_HOST in frame.url
            check(f"{tool} opens in the platform, signed in as alice", shown and not on_keycloak, url)
        check("one sign-in for all of them", len(sign_ins) == 1, f"{len(sign_ins)} Keycloak sign-in(s)")

        # 4 (before carol, who has a context of her own). Signing out.
        page.click("[data-testid=nav-sql]")
        page.goto(PLATFORM)
        page.click("[data-testid=sign-out]")
        page.wait_for_selector("#kc-form-login", timeout=60_000)
        check("signing out ends the Keycloak session: the next visit asks for a password",
              AUTH_HOST in page.url, page.url.split("?")[0])
        ctx.close()

        # 3. carol: signed in, and refused.
        ctx = browser.new_context()
        page = ctx.new_page()
        page.goto(PLATFORM)
        sign_in(page, "carol")
        page.wait_for_selector("[data-testid=refused]", timeout=60_000)
        text = page.inner_text("[data-testid=refused]")
        check("people in neither group are refused", "No access" in text and page.query_selector(".sidebar") is None,
              text.splitlines()[0])
        ctx.close()
        browser.close()

    print()
    if failures:
        sys.exit(f"{len(failures)} of the checks failed")
    print("all checks passed")


if __name__ == "__main__":
    main()
