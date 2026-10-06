# The stack

This directory is StorScale Platform on one machine: a Docker Compose project. `storscale up` runs it. The `storscale` binary carries a copy of this directory and writes it to your cache directory the first time it runs.

| Service | What it is | At |
|---|---|---|
| `gateway` | Caddy: the one domain, with a name per tool | |
| `platformd` | The platform's web app and its backend: Keycloak sign-in, the tools each person may open, projects | `http://storscale.localhost:8800` |
| `platform-operator` | Applies projects to Keycloak, Ranger, Buckets and Nessie, and keeps them that way | |
| `keycloak` | Sign-in for everything; realm `lakehouse`, with a signing key kept in a volume | `auth.` |
| `buckets` | Buckets, one server with four drives (EC 2+2) | `s3.` |
| `nessie`, `trino` | The Iceberg catalog and the SQL engine | Trino: `https://localhost:8443` |
| `ranger-admin` (with `ranger-db`, `ranger-solr`) | Who may query what, and the audit log | `access.` |
| `jupyterhub` | A notebook server per person | `notebooks.` |
| `superset` (with `superset-db`) | SQL Lab and dashboards | `dashboards.` |
| `airflow` (with its scheduler, DAG processor and `airflow-db`) | Pipelines | `pipelines.` |
| `prometheus`, `grafana` | Monitoring; Grafana signs people in with Keycloak | `monitoring.` |
| `setup`, `setup-trino` | One-off configuration, safe to run again | |

## One domain

Every tool has a name under `STORSCALE_DOMAIN` (default `storscale.localhost`). All of them use one port, `STORSCALE_PORT` (default 8800):
- **In the browser:** browsers resolve `*.localhost` to your own machine, so no hosts file is needed.
- **Inside the stack:** the same names are network aliases of the gateway. So services reach each other at the addresses a browser uses. Keycloak issues every token for one issuer, `http://auth.storscale.localhost:8800/realms/lakehouse`, whoever asks.

**One exception:** libcurl resolves `*.localhost` names to loopback itself and never asks Docker's DNS. Anything that uses libcurl (JupyterHub's HTTP client) calls Keycloak at `http://keycloak:8080` directly. The tokens it gets still name the gateway's address.

To use another domain, set `STORSCALE_DOMAIN`, and make its names resolve to this machine (in a hosts file or DNS).

## Projects

A project ([projects/sales.json](projects/sales.json) is one) is a team's tables, files and pipelines, and who may use them. Administrators (engineers) make, change and delete projects in the platform's Projects pages, or through `PUT` and `DELETE` on `/api/projects/<name>`. platformd keeps them in the `storscale-platform` bucket.

`platform-operator` applies each project and writes back its status. It runs again when the project changes, and every minute anyway, because a Keycloak group's members can change without the project changing. For project `sales`:

| System | What the project makes |
|---|---|
| Keycloak | Groups `sales-readers`, `sales-editors` and `sales-pipelines`, holding exactly the project's members. An editor is in the editors' group only, so the readers' masks and row filters don't apply to them. |
| Ranger | The same groups, with each member in them, and the policies named `project:sales:…`. Those cover the namespace, its tables (or only some, for readers), and the readers' masks and row filters. |
| Buckets | The bucket `sales`, and a policy per group: readers read it, editors write it, and the pipelines write `landing/`. |
| Nessie | The namespace `sales`. |

Deleting a project removes its groups and policies. Its data, the bucket and the tables, stays until someone removes it on purpose.

**Outside projects:** the setup scripts still grant what isn't tied to any project:
- people's own files (`scratch`, `home`);
- running queries, and seeing the catalog;
- Superset's right to run queries as people.

The `projects` suite checks that a project's access appears in every system when the project is created, and goes when it's deleted.

## In the platform's frame

The platform shows the tools in frames on `http://storscale.localhost:8800`. Two things make that work:
- **The gateway** lets only the platform frame Superset, Airflow and Grafana, with `frame-ancestors`. JupyterHub sets the same policy itself.
- **Keycloak's sign-in form never appears in a frame:** the platform signs people in first. Each frame then opens its tool's own Keycloak sign-in, which finds the Keycloak session and returns at once.

Keycloak's signing key is made once, in the `keycloak-keys` volume, and kept. Tokens stay valid when Keycloak restarts, and Trino and Buckets keep the keys they've fetched. The realm itself is imported afresh on each start.

## Where it comes from

The services and their configuration come from the tested integration guides in [StorScale Buckets](https://github.com/StorScale/buckets/tree/main/examples) (`examples/{common,lakehouse,superset,airflow,jupyterhub,monitoring}`, at Buckets commit `3f3267e`). Buckets' monitoring rules and dashboards come from `operator/helm/buckets-operator/monitoring`. The changes for running them as one platform:
- **Grafana signs people in with Keycloak:** engineers get Editor, analysts get Viewer, and anyone in neither group is refused. Grafana's `admin` account stays, for when Keycloak is down. Ranger still has only its own `admin` account.
- **One domain:** the tools' URLs, the Keycloak realm's redirect URIs, and Trino's and Buckets' token issuer.
- **Policies that add up:** the analysts' and engineers' Buckets policies combine what the lakehouse and the notebooks each need. Ranger gets one list of policies, covering the lakehouse, Superset and Airflow.
- **One Buckets:** four drives instead of one, so the monitoring checks can fail a drive.
- **The checks:** `tests/run.py` runs every guide's checks in turn. It loads the sales tables afresh before the suites that read them, and runs the drive-failure checks last. Those make a drive unreadable rather than emptying it, as the guide does. Buckets formats an emptied drive back within seconds, so Prometheus doesn't always see it fail.
