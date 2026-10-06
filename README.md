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

> **Status:** planning. Nothing here runs yet. The plan is in [docs/plan.md](docs/plan.md).

```bash
storscale up        # phase 0: the whole platform on a laptop, with Docker Compose
```

## Licence

AGPL-3.0, like Buckets. See [LICENSE](LICENSE).
