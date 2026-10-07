"""The platform's shell, in a real browser (Chromium): docker compose run --rm test-browser

  1. alice signs in to the platform once, with Keycloak's form;
  2. then opens notebooks, SQL, dashboards, pipelines and monitoring in the
     platform's frame, each signed in as alice, without another sign-in;
  3. the projects pages: alice sees the sales project, as a reader, and can't
     make projects; bob, an administrator, sees its members and the Access page;
  4. carol (in neither group) signs in, and the platform refuses her;
  5. signing out of the platform ends the Keycloak session too.

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
AUTH = f"{PLATFORM}/sso/"  # Keycloak, at the platform's /sso/
PASSWORD = os.environ["LAKEHOUSE_USER_PASSWORD"]

# Each tool, and where its frame should end up once alice is signed in to it.
TOOLS = {
    "notebooks": r"/notebooks/user/alice/lab",
    "sql": r"/dashboards/sqllab",
    "dashboards": r"/dashboards/dashboard/list",
    "pipelines": r"/pipelines/(\?.*)?$",
    "monitoring": r"/monitoring/(\?.*)?$",
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


def press(page, selector):
    """Click an element of the platform's own page through the page itself: with
    tools loaded in its frames, a headless browser on a busy machine can take
    longer than Playwright's click allows to confirm the element is clickable."""
    page.wait_for_selector(selector, timeout=60_000)
    page.eval_on_selector(selector, "e => e.click()")


def sign_in(page, user):
    """Keycloak's form, as a person fills it in."""
    page.wait_for_selector("#kc-form-login", timeout=60_000)
    page.fill("#username", user)
    page.fill("#password", PASSWORD)
    page.click("#kc-login")


def main():
    forward(PORT, "gateway")
    with sync_playwright() as p:
        for engine in os.environ.get("SHELL_BROWSERS", "chromium webkit").split():
            print(f"--- in {engine} ({'Safari' if engine == 'webkit' else 'Chrome, Edge'})", flush=True)
            # Switching between tools in one page holds several whole apps at
            # once: CI has the memory for it (SHELL_SWITCH=1); a laptop's Docker,
            # running the platform too, may not.
            run(getattr(p, engine).launch(), switch=os.environ.get("SHELL_SWITCH") == "1" and engine != "webkit")

    print()
    if failures:
        sys.exit(f"{len(failures)} of the checks failed")
    print("all checks passed")


def run(browser, switch=True):
    """The checks, in one browser. switch: open the tools one after another in
    the same page, as a person switching between them would; otherwise each in
    a page of its own (lighter: on a machine short of memory, a headless browser
    stalls with Grafana loading beside Airflow)."""
    # 1. alice signs in, once.
    ctx = browser.new_context(viewport={"width": 1400, "height": 900})
    sign_ins = []
    ctx.on("request", lambda r: sign_ins.append(r.url) if r.method == "POST" and r.url.startswith(AUTH)
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
        if switch:
            press(page, f"[data-testid=nav-{tool}]")
        else:
            page.goto(f"{PLATFORM}/tools/{tool}")
        frame, deadline = None, time.time() + 120
        while time.time() < deadline:
            try:  # the app may swap the element while it renders; look again
                el = page.query_selector(f"[data-testid=frame-{tool}]")
                frame = el.content_frame() if el else None
            except Exception:  # noqa: BLE001
                frame = None
            if frame and re.search(where, frame.url):
                break
            time.sleep(1)
        url = frame.url if frame and not frame.is_detached() else "no frame"
        shown = frame is not None and re.search(where, url) is not None
        if shown:
            frame.wait_for_load_state("load")
        on_keycloak = frame is not None and frame.url.startswith(AUTH)
        check(f"{tool} opens in the platform, signed in as alice", shown and not on_keycloak, url)
    check("one sign-in for all of them", len(sign_ins) == 1, f"{len(sign_ins)} Keycloak sign-in(s)")
    catalog = page.get_attribute("[data-testid=nav-catalog]", "href") or ""
    check("the catalog opens in a tab of its own, through the platform's launcher",
          catalog.endswith("/_storscale/launch.html") and page.get_attribute("[data-testid=nav-catalog]", "target") == "_blank", catalog)

    # 3. Projects, as alice.
    press(page, "[data-testid=nav-projects]")
    page.wait_for_selector("[data-testid=project-sales]", timeout=30_000)
    row = page.inner_text("[data-testid=project-sales]")
    check("alice sees the sales project, as a reader", "reader" in row, " ".join(row.split()))
    check("... and can't make projects", page.query_selector("[data-testid=new-project]") is None
          and page.query_selector("[data-testid=nav-access]") is None, "no New project button, no Access page")
    page.goto(f"{PLATFORM}/projects/sales/flow")
    page.wait_for_selector("[data-testid=table-orders]", timeout=120_000)
    names = [e.get_attribute("data-testid")[6:] for e in page.query_selector_all("[data-testid^=table-]")]
    check("... and its Flow: the project's tables, from the catalog", {"orders", "orders_by_region", "payroll"} <= set(names), names)

    # 5 (before carol, who has a context of her own). Signing out.
    press(page, "[data-testid=nav-sql]")
    page.goto(PLATFORM)
    press(page, "[data-testid=sign-out]")
    page.wait_for_selector("#kc-form-login", timeout=60_000)
    check("signing out ends the Keycloak session: the next visit asks for a password",
          page.url.startswith(AUTH), page.url.split("?")[0])
    ctx.close()

    # 3. Projects, as bob (an administrator).
    ctx = browser.new_context(viewport={"width": 1400, "height": 900})
    page = ctx.new_page()
    page.goto(f"{PLATFORM}/projects")
    sign_in(page, "bob")
    page.wait_for_selector("[data-testid=project-sales]", timeout=60_000)
    press(page, "[data-testid=project-sales] a")
    page.wait_for_selector("[data-testid=members]", timeout=30_000)
    members = page.inner_text("[data-testid=members]")
    check("bob opens the sales project and sees its members", "alice" in members and "reader" in members and "editor" in members,
          " ".join(members.split())[:120])
    check("... with what each role gets", "Read orders in iceberg.sales" in page.inner_text("main"), "")
    press(page, "[data-testid=semantic-link]")
    page.wait_for_selector("[data-testid=metrics]", timeout=60_000)
    metrics = page.inner_text("[data-testid=metrics]")
    check("... and its semantic layer: the metrics, editable by bob", "revenue" in metrics and "order_count" in metrics
          and page.get_attribute("[data-testid=semantic-yaml]", "readonly") is None, " ".join(metrics.split())[:80])
    press(page, "[data-testid=nav-access]")
    page.wait_for_selector("[data-testid=access]", timeout=30_000)
    access = page.inner_text("[data-testid=access]")
    check("... and the Access page: who has which role", "alice" in access and "reader" in access, " ".join(access.split())[:120])
    ctx.close()

    # 4. carol: signed in, and refused.
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


if __name__ == "__main__":
    main()
