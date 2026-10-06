# Changelog

All notable changes to StorScale Platform are recorded here, in the [Keep a Changelog](https://keepachangelog.com/) format. The project uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added
- The plan: a semantic layer that agents can use (phase 4). MetricFlow holds the definitions, there's an editor in the shell, and an MCP server lets agents query as the person or service account asking, under Ranger's rules.
- The plan: [docs/plan.md](docs/plan.md). It covers the architecture, the `Project` object, a map of Dataiku's features onto open-source tools, the phases and the decisions.
- **Phase 3:** the catalog, lineage and data quality.
  - **OpenMetadata 2.0.4** as the catalog. It signs people in with Keycloak, and someone signed in to the platform needs no second password. It's trimmed to fit: no Airflow of its own, OpenSearch with no plugins and a small heap, and its own small Postgres.
  - **`catalog-sync`** ingests Trino's tables into the catalog and runs each project's data-quality checks as OpenMetadata tests.
  - **Checks in the project spec:** `spec.tables.checks`, one of `unique`, `notNull` or `rowCount`. The `sales` project checks that order IDs are unique, card numbers are never missing, and orders isn't empty.
  - **Column-level lineage from pipelines:** the sales pipeline now also rebuilds `orders_by_region`, and reports that step to the catalog as an OpenLineage event, column by column and under its own name. One of its orders has no card number, which the project's check catches.
  - **The Flow view:** each project's tables, the pipelines between them (column by column), and their checks, with failing checks called out. Its data comes from the catalog through `GET /api/projects/<name>/flow`.
  - **The Catalog** is on the platform's sidebar and opens in its own tab.
  - **The `catalog` suite:** bob runs the pipeline, and the suite finds its lineage and pipeline in the catalog, the failing check with its reason, both in alice's Flow view, and nothing for carol. It also checks that the catalog's sign-in needs no second password.
- **The stack fits a 10 GB Docker VM:** the Java services' heaps are set (OpenMetadata, OpenSearch, Keycloak, Solr, Nessie, and a 2 GB limit for Trino), and long-running services restart if they stop. Running out of memory had killed Trino and the test browser.
- **The notebook checks stop the servers they start.**
- **Phase 2:** projects.
  - **What a project is:** a team's tables (an Iceberg namespace), files (a bucket) and pipelines (a Keycloak service account), and who may use them. Members are Keycloak groups or people, as readers or editors. Readers can be narrowed to some tables, with row filters and column masks.
  - **`platform-operator`:** applies each project to Keycloak (groups and their members), Ranger (the same groups, and the tables' policies), Buckets (the bucket and its policies) and Nessie (the namespace). It writes back each project's status, applies it again when it changes and every minute, and undoes it when it's deleted. The data stays.
  - **The Projects pages:** a list, each project's members and what each role gets, the operator's status, and an editor (a form, or JSON). The Access page shows who has which role in which project. Administrators (engineers) make and change projects; everyone else sees the projects they're in.
  - **The API:** `GET`, `PUT` and `DELETE` on `/api/projects/<name>`, and `GET /api/access`.
  - **The `Project` custom resource** (`deploy/crds/project.yaml`) is ready for Kubernetes (phase 5). Until then, projects live in a Buckets bucket.
  - **The `sales` project now grants the guides' access to the sales tables and files.** It replaces the setup scripts' grants. Its files moved to the `sales` bucket: `datasets/` for the shared data, and `landing/` for the pipelines.
  - **The `projects` suite:** an administrator creates a project and its member gets its tables and bucket while nobody else does. Deleting `sales` takes its access away in Trino, Buckets and Keycloak, but keeps its data. Creating it again gives the access back.
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
