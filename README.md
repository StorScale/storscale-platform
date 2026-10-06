# StorScale Platform

StorScale Platform is one open data platform on [StorScale Buckets](https://github.com/StorScale/buckets). It brings together:

- **Tables:** Iceberg, Nessie and Trino
- **Notebooks:** JupyterHub
- **Dashboards:** Superset
- **Pipelines:** Airflow and dbt
- **Catalog, lineage and data quality:** OpenMetadata, OpenLineage and Soda
- **Access:** Keycloak and Apache Ranger
- **Monitoring:** Prometheus and Grafana

People sign in once to one place. They work in **projects**: a project brings together a team's data, notebooks, pipelines and dashboards, and the access to them. Access is granted once, and the platform puts it into every tool.

> **Status:** phase 1 of [the plan](docs/plan.md). The platform has one web app with one sign-in. Notebooks, SQL, dashboards, pipelines and monitoring open inside it.

## Try it

You need Docker with Compose 2.24 or later, about 10 GB of memory for Docker, and Go 1.26 or later to build the command.

```bash
go build -o bin/storscale ./cmd/storscale
bin/storscale up --dir stack      # this checkout's stack: builds the platform's image too
bin/storscale test --dir stack    # the end-to-end checks, the browser's included
```

Then open http://storscale.localhost:8800, the platform, and sign in as `alice` (an analyst) or `bob` (an engineer). Their password is `LAKEHOUSE_USER_PASSWORD` in [stack/.env](stack/.env). Every password there is a local test value.

One Keycloak sign-in covers the platform and every tool in it: JupyterHub, Superset, Airflow and Grafana. Ranger is for administrators: sign in as `admin` with `RANGER_PASSWORD`.

| | |
|---|---|
| Notebooks (JupyterHub) | http://notebooks.storscale.localhost:8800 |
| SQL and dashboards (Superset) | http://dashboards.storscale.localhost:8800 |
| Pipelines (Airflow) | http://pipelines.storscale.localhost:8800 |
| Monitoring (Grafana) | http://monitoring.storscale.localhost:8800 |
| Access policies (Ranger) | http://access.storscale.localhost:8800 |
| Trino, for JDBC and CLI clients | https://localhost:8443 |

Until the first release publishes the platform's image, use `--dir stack` from a checkout. Without it, `storscale` runs the stack built into the binary, which pulls the released image.

`storscale down` stops it, and `storscale down --volumes` also deletes its data. [stack/README.md](stack/README.md) describes the services.

With rootless Docker (Lima, for example), set `DOCKER_SOCK=/run/user/<uid>/docker.sock` so JupyterHub can start notebook servers.

## Licence

AGPL-3.0, like Buckets. See [LICENSE](LICENSE).
