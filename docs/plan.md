# StorScale Platform: plan

**StorScale Platform** is one product over the open-source tools the Buckets integration guides already run and test together. You sign in once, and you get one home, one notion of a *project*, one catalog and one place to grant access. Each tool's own UI stays available underneath.

- **Repo:** `github.com/StorScale/storscale-platform` (AGPL-3.0, like Buckets).
- **Web:** `storscale.io/platform`.
- **CLI:** `storscale up`.
- **Naming:** *StorScale Buckets* is the storage; *StorScale Platform* is the platform on top.

## What it's for

Dataiku's core value is projects, a Flow, a catalog, governed access and automation in one UI. The parts already exist as open source, and the guides prove they fit together with one identity (Keycloak groups → Buckets policies, Ranger policies, Airflow and Superset roles). What's missing is the product layer:

1. **One shell:** single sign-on, one navigation, and one domain.
2. **Projects:** a team's data, notebooks, pipelines, dashboards and access as one object.
3. **One catalog and lineage graph** across Trino, Spark, Airflow and dbt.
4. **Access in one place:** a grant made once becomes the matching Keycloak, Ranger and Buckets settings.

The first users are data engineers and analysts. ML and GenAI wait until there are data scientists.

## Tools

| Layer | MVP | Later | Not included |
|---|---|---|---|
| Storage | Buckets | | |
| Table format, catalog | Iceberg, Nessie | Hive Metastore (for existing Hive estates) | |
| SQL | Trino | | Dremio (see decision 4) |
| Compute | | Spark (Spark Operator) | |
| Identity, access | Keycloak, Ranger | | |
| Notebooks | JupyterHub | | |
| BI | Superset | | |
| Pipelines | Airflow, dbt | | |
| Catalog, lineage, data quality | OpenMetadata (with OpenLineage ingestion), Soda checks | | |
| Monitoring | Prometheus, Grafana, Loki | | |
| Semantic layer, agent access | MetricFlow (phase 4), the platform's MCP server | | |
| ML, GenAI | | MLflow, LiteLLM, pgvector | |

## Architecture

```
            browser ── https://platform.example.com
                │
        ┌───────▼────────┐  one domain, a name per tool: auth., notebooks., dashboards., pipelines., monitoring., catalog.
        │  gateway       │  (Envoy Gateway / ingress; TLS)
        └───┬────────┬───┘
            │        │ tool UIs, behind the same session
   ┌────────▼───┐  ┌─▼──────────────────────────────────────────┐
   │ platformd  │  │ JupyterHub · Superset · Airflow · Grafana ·  │
   │ (BFF+API)  │  │ OpenMetadata · Trino UI · Ranger (admins)    │
   └──┬─────────┘  └──────────────────────────────────────────────┘
      │ OIDC (Keycloak) · signed calls to Buckets · REST to each tool
      │ Kubernetes API (Project CRs)
   ┌──▼───────────────┐
   │ platform-operator │ reconciles Project → Keycloak group, Buckets bucket+policy,
   └───────────────────┘ Ranger policies, Nessie namespace/branch, Jupyter profile, Superset role, Airflow DAG folder
```

- **`platform/web`:** React 18 + TypeScript + Vite. It starts from the Buckets console's shell, theme tokens, `call()` wrapper and components. Native pages cover what crosses tools: Home, Projects, Catalog and lineage, Access, Runs, and Health. Each tool's own UI opens inside the shell, embedded or in its own tab:
  - **Superset:** its embedded SDK, with guest tokens.
  - **Grafana:** panels embedded in the shell.
  - **JupyterLab and Airflow:** under names on the same domain, with their own OIDC sign-in. Keycloak's SSO session makes that sign-in silent.
  - **Names, not paths:** Superset and Ranger don't run well under a path prefix, so each tool gets a name of its own under one domain (`notebooks.storscale.localhost`). Browsers resolve `*.localhost` to the machine itself, so a laptop needs no hosts file. Inside the stack the same names lead to the gateway, so Keycloak's tokens have one issuer.
- **`platformd`:** a backend-for-frontend, the same design as consoled:
  - OIDC sign-in, with tokens kept server-side in an encrypted cookie;
  - calls to each tool's API with the user's token, or by impersonation where the tool needs it (Trino);
  - live data streamed to the browser over HTTP.

  It is written in **Go**: every client it needs (Kubernetes, OIDC, REST) already exists in Go, and nothing in it is performance-critical.
- **`platform-operator`:** a `Project` CRD, plus `PlatformInstall` for the install itself. It's written in Go with controller-runtime. Each reconcile is idempotent and writes to the tools' admin APIs. This is the code the examples' `lakekit.py` and the `*_setup.py` scripts already run, rewritten in Go.
- **Install:**
  - Kubernetes: a Helm umbrella chart (`storscale/platform`) that depends on the upstream charts plus the Buckets operator.
  - A laptop: `storscale up`, which runs the same stack with Compose, reusing `examples/common` and the example stacks.

## The Project, the central object

```yaml
apiVersion: platform.storscale.io/v1alpha1
kind: Project
metadata: { name: sales }
spec:
  members:
    - { group: engineers, role: editor }
    - { group: analysts,  role: reader, rowFilter: "region = 'EU'", mask: [email] }
  storage:   { bucket: sales-landing, quotaGiB: 500 }
  tables:    { catalog: iceberg, namespace: sales }      # Nessie namespace; branch per change request (later)
  notebooks: { image: storscale/notebook:py312, cpu: 2, memory: 8Gi }
  pipelines: { repo: https://git.example.com/sales/dags.git, path: dags/, serviceAccount: true }
  dashboards: true
```

From this one object, the operator creates:
- the Keycloak groups and the service account;
- the Buckets bucket and policies;
- the Ranger policies, with masks and row filters;
- the Nessie namespace;
- a JupyterHub profile;
- the Superset role and its dataset permissions;
- the Airflow DAG folder, its role and its connection.

Its status reports each piece.

The examples already prove every mapping in this list by hand.

**Phase 2 delivered (2026-10-06)** the parts that cover access: `members`, `tables` (with the readers' view: tables, row filters and masks), `files` and `pipelines.serviceAccount`, applied to Keycloak, Ranger, Buckets and Nessie (`stack/projects/sales.json` is one). Still to come:
- notebook profiles and quotas;
- a pipelines repo and DAG folder per project;
- Superset and Airflow roles per project. Until then, those tools' roles come from the platform-wide groups, while their data access already follows the project through Trino and Buckets.

## Matching Dataiku

| Dataiku | StorScale Platform | When |
|---|---|---|
| Projects, permissions, user isolation | `Project` CRD; Keycloak, Ranger and impersonation | MVP |
| Flow (visual DAG) | A read-only Flow view drawn from OpenLineage and dbt lineage, with links into each job | MVP (view); an editable Flow is a later gap to build |
| Code recipes (SQL, Python, PySpark) | Trino, Jupyter, Spark, and dbt models | MVP (Spark later) |
| Join, group, window and pivot recipes | dbt models, or Trino SQL from a template | MVP |
| Prepare recipe (point-and-click) | Gap to build: a recipe builder that generates SQL | Later |
| Datasets and connections, Iceberg REST | Trino catalogs, Nessie's Iceberg REST endpoint | MVP |
| Semantic Models, AI SQL, agent tools (MCP) | The semantic layer: MetricFlow models, an editor in the shell, and an MCP server that queries as the person or agent asking | Phase 4 |
| Data catalog, column lineage, search | OpenMetadata + OpenLineage, shown in the shell | MVP |
| Data quality rules | Soda checks as Airflow tasks, results in the catalog | MVP |
| Scenarios, triggers, reporters | Airflow (data-aware scheduling), Grafana alerting | MVP |
| Dashboards, charts | Superset | MVP |
| Audit trail | Ranger, Keycloak, Trino and Buckets audit logs sent to Loki, with one Audit page | MVP |
| Code environments, compute on Kubernetes | JupyterHub profiles, images built per project, quotas | MVP |
| Bundles and Deployer (dev to prod) | Git CI plus a Nessie branch merge, with project promotion between installs | Later |
| AutoML, experiment tracking, model registry, drift | MLflow, FLAML, Evidently + Grafana | Later |
| LLM Mesh, prompt studio, Knowledge Banks, agents | LiteLLM, Langfuse, pgvector | Later (agent access to data comes in phase 4) |
| Webapps, Answers, Stories, Govern sign-offs | Not planned yet | Not included |

## Phases

Each phase ends with a gate: an end-to-end test like the examples' `test.py`, run in CI.

| Phase | Deliverable | Gate |
|---|---|---|
| 0 | Repo, CI, `storscale up` running the lakehouse, Superset, Airflow, JupyterHub and monitoring stacks from one Compose project on one domain | All existing example tests pass against the combined stack |
| 1 | The shell: `platformd` OIDC sign-in, navigation, Home, tool pages embedded or linked with silent SSO | Playwright: alice signs in once and reaches SQL, notebooks, dashboards and pipelines without a second login; carol is refused |
| 2 | Projects: the CRD and operator (also running in Compose mode), plus the Projects and Access pages | Creating `sales` gives each user exactly the access the guides check today, in every tool; deleting it removes that access |
| 3 | Catalog and lineage: OpenMetadata, OpenLineage from Airflow, Spark and Trino, a Flow view, Soda checks | A pipeline run appears in the lineage graph, column-level; a failing check shows on the dataset |
| 4 | The semantic layer and agent access (below): MetricFlow models per project, the Semantic layer pages, the MCP server | An agent signed in as alice asks for revenue by region and gets EU only, masked as in Trino; carol's agent gets nothing; bob's metric change shows up in the next answer; Ranger's audit names both the agent and alice |
| 5 | Kubernetes: the Helm umbrella chart, the Buckets operator, Spark Operator, KubeSpawner | `helm install` on kind gives a healthy install; the phase 1–4 tests pass on it |
| 6 | Operations: Audit and Health pages (Loki, Grafana), backup and upgrade notes, docs on storscale.io/platform | A full upgrade between two releases with no lost projects |
| 7+ | Later items, in this order: MLflow, Prepare-recipe builder, promotion between installs, LiteLLM | Per feature |

## The semantic layer, and agents

People define what the business means once: entities (customer, order), dimensions (region, month), measures and metrics (revenue, active customers), and how tables join. People, dashboards and AI agents then ask for *metrics*, not SQL. They get the same answer, under the same access rules.

- **Definitions:** MetricFlow's YAML (semantic models and metrics), the Open Semantic Interchange's reference engine, Apache 2.0. It lives in each project's Git repo, beside its dbt models, so it's reviewed and versioned like code. Cube Core is the fallback; its own MCP server is in Cube's paid plans.
- **Building it, in the shell:**
  - **Pages:** a Semantic layer page per project. Browse entities, dimensions and metrics; start a model from a table in the catalog (phase 3) with its columns and joins filled in; edit with validation; preview a metric's SQL and its result before saving.
  - **Saving:** saving opens a change on the project's repo, or commits it directly for engineers.
  - **Who may edit:** engineers edit; analysts read.
- **Compiling:** `semanticd`, a small Python service around MetricFlow, compiles metric requests to Trino SQL. It never holds data credentials. The query runs in Trino *as whoever asked*, so Ranger's policies, masks and row filters apply, as they do in Superset.
- **Agent access (MCP):** the platform serves an MCP server at `mcp.storscale.localhost`, with OAuth through Keycloak (the MCP authorization spec). Its tools:
  - `list_metrics`, `describe_metric`, `list_dimensions`;
  - `query_metrics` (metrics, dimensions, filters, time grain);
  - `explain` (the SQL that would run);
  - `search_catalog` (from phase 3).

  Each agent gets only the projects and metrics its identity may see.
- **Agent identity:**
  - **An assistant acting for a person** (Claude, an IDE) signs in as that person through Keycloak, so it sees what they see.
  - **An autonomous agent** gets a Keycloak service account in a group, like Airflow's pipelines: narrow, audited, and revoked in one place.
  - **Audit:** Ranger's audit log and the platform's audit page record each query under the agent's name and the person it acted for.
- **Also served by the semantic layer:** Superset datasets from the metrics, so dashboards and agents agree, and `query_metrics` from notebooks (a Python client).


## Decisions (2026-10-06)

1. **Repo and license:** `StorScale/storscale-platform`, AGPL-3.0. Buckets is a dependency (its images, chart and operator), not vendored code.
2. **`platformd` and `platform-operator` are written in Go** (controller-runtime for the operator). The C stays in Buckets.
3. **Catalog:** OpenMetadata, with OpenLineage ingestion; DataHub is not used.
4. **Dremio is left out.** It overlaps Trino and Superset, and its OSS edition has no OIDC or RBAC.
5. **Compose first, then Helm:** `storscale up` reuses the tested Buckets examples (phase 0); the Helm umbrella chart follows in phase 5.
6. **A semantic layer that agents can use (added 2026-10-06):** MetricFlow for the definitions, and the platform's own MCP server for agents, as phase 4. It comes after the catalog, whose tables and columns it starts from.
7. **Data quality with OpenMetadata's own tests (phase 3), not Soda:** it's one tool fewer, the results show on the tables in the catalog, and projects declare their checks (`spec.tables.checks`). Soda or Great Expectations can post results to the same tests through OpenMetadata's API later.
8. **The catalog opens in its own tab (phase 3), not in the platform's frame:** OpenMetadata's web app keeps its token in a service worker. Each project's Flow view shows its lineage and checks inside the platform.
