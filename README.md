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

> **Status:** phase 0 of [the plan](docs/plan.md). `storscale up` runs every tool, on one domain, with one sign-in. The platform's own UI comes next.

## Try it

You need Docker with Compose 2.24 or later, about 10 GB of memory for Docker, and Go 1.25 or later to build the command.

```bash
go build -o bin/storscale ./cmd/storscale
bin/storscale up        # about a minute once the images are built; the first build takes longer
bin/storscale test      # the end-to-end checks
```

Then open http://storscale.localhost:8800 and sign in as `alice` (an analyst) or `bob` (an engineer). Their password is `LAKEHOUSE_USER_PASSWORD` in [stack/.env](stack/.env). Every password there is a local test value.

| | |
|---|---|
| Notebooks (JupyterHub) | http://notebooks.storscale.localhost:8800 |
| SQL and dashboards (Superset) | http://dashboards.storscale.localhost:8800 |
| Pipelines (Airflow) | http://pipelines.storscale.localhost:8800 |
| Monitoring (Grafana) | http://monitoring.storscale.localhost:8800 |
| Access policies (Ranger) | http://access.storscale.localhost:8800 |
| Trino, for JDBC and CLI clients | https://localhost:8443 |

`storscale down` stops it, and `storscale down --volumes` also deletes its data. [stack/README.md](stack/README.md) describes the services.

With rootless Docker (Lima, for example), set `DOCKER_SOCK=/run/user/<uid>/docker.sock` so JupyterHub can start notebook servers.

## Licence

AGPL-3.0, like Buckets. See [LICENSE](LICENSE).
