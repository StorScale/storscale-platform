# Changelog

All notable changes to StorScale Platform are recorded here, in the [Keep a Changelog](https://keepachangelog.com/) format. The project uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added
- The plan: [docs/plan.md](docs/plan.md). It covers the architecture, the `Project` object, a map of Dataiku's features onto open-source tools, the phases and the decisions.
- **Phase 0:** `storscale up` runs the whole platform on one machine with Docker Compose. That's Buckets, Keycloak, Nessie, Trino, Ranger, JupyterHub, Superset, Airflow, Prometheus and Grafana.
  - **One domain:** a gateway gives every tool its own name on one port (`http://notebooks.storscale.localhost:8800`, and so on), with a home page linking them all. Keycloak issues every token for one issuer.
  - **The CLI:** the `storscale` command carries the stack inside it and has `up`, `status`, `urls`, `test`, `logs`, `down` and `version`.
  - **`storscale test`:** runs the Buckets integration guides' end-to-end checks against the one platform. That's the lakehouse, Superset, Airflow, JupyterHub and monitoring suites.
  - **Grafana:** people sign in with Keycloak. Engineers get Editor, analysts get Viewer, and anyone in neither group is refused. The monitoring suite checks all three.
  - **The drive-failure checks:** they make a drive unreadable, then check that it's reported offline, that the alerts start, and that it recovers. An emptied drive made a flaky check, because Buckets often formats it back before Prometheus sees it fail.
  - **CI:** go vet and the CLI's tests on each change. The whole platform is also started, and every suite run.
