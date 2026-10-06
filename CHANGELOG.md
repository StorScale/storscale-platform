# Changelog

All notable changes to StorScale Platform are recorded here, in the [Keep a Changelog](https://keepachangelog.com/) format. The project uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added
- The plan: a semantic layer that agents can use (phase 4). MetricFlow holds the definitions, there's an editor in the shell, and an MCP server lets agents query as the person or service account asking, under Ranger's rules.
- The plan: [docs/plan.md](docs/plan.md). It covers the architecture, the `Project` object, a map of Dataiku's features onto open-source tools, the phases and the decisions.
- **Phase 1:** the platform's web app at `http://storscale.localhost:8800`.
  - **What's in it:** one sign-in with Keycloak, a sidebar with every tool, a Home page with each person's tools and access, and sign-out (which also ends the Keycloak session). People in neither group are refused.
  - **The tools open inside it:** notebooks (JupyterLab), SQL (Superset's SQL Lab), dashboards, pipelines (Airflow) and monitoring (Grafana), each already signed in. A tool stays where it was when you switch to another.
  - **`platformd`:** the backend, in Go. It signs people in with OIDC (authorization code with PKCE), checks the ID token against the gateway's issuer, keeps sessions server-side, lists each person's tools, and serves the web app (React and TypeScript).
  - **The image:** `ghcr.io/storscale/platformd`, multi-arch, signed on release tags. `storscale up --dir stack` in a checkout builds it from source.
  - **The `shell` suite:** a Chromium test of the whole flow. alice signs in once and reaches every tool; carol is refused; signing out ends the Keycloak session. `storscale test` runs it with the other suites.
- **Keycloak's signing key is kept** across restarts, so a restarted Keycloak no longer invalidates every token, or the keys Trino and Buckets have cached.
- **Phase 0:** `storscale up` runs the whole platform on one machine with Docker Compose. That's Buckets, Keycloak, Nessie, Trino, Ranger, JupyterHub, Superset, Airflow, Prometheus and Grafana.
  - **One domain:** a gateway gives every tool its own name on one port (`http://notebooks.storscale.localhost:8800`, and so on), with a home page linking them all. Keycloak issues every token for one issuer.
  - **The CLI:** the `storscale` command carries the stack inside it and has `up`, `status`, `urls`, `test`, `logs`, `down` and `version`.
  - **`storscale test`:** runs the Buckets integration guides' end-to-end checks against the one platform. That's the lakehouse, Superset, Airflow, JupyterHub and monitoring suites.
  - **Grafana:** people sign in with Keycloak. Engineers get Editor, analysts get Viewer, and anyone in neither group is refused. The monitoring suite checks all three.
  - **The drive-failure checks:** they make a drive unreadable, then check that it's reported offline, that the alerts start, and that it recovers. An emptied drive made a flaky check, because Buckets often formats it back before Prometheus sees it fail.
  - **CI:** go vet and the CLI's tests on each change. The whole platform is also started, and every suite run.
