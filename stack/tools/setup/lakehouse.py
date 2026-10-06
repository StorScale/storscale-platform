"""Configure the platform's base: Buckets, then Ranger.

Buckets
  - buckets `warehouse` (Iceberg tables), `scratch` (people's own files) and
    `storscale-platform` (the platform's projects, and their status);
  - policy `lakehouse-engine` (the warehouse, read and write) for the engines'
    service accounts, `trino-svc` and `nessie-svc`; policy `platform-store` for
    platformd's account, `platform-svc`;
  - policies `analysts` and `engineers`, named after the Keycloak groups people
    sign in with: `scratch` only. Nobody but the engines can read the warehouse,
    so Ranger's masks and row filters can't be bypassed by reading the files.

Ranger
  - Keycloak's users and groups, copied over, and the pipelines' service
    account in group pipelines (Keycloak doesn't list service accounts among
    its users, so Ranger's usersync would need the same);
  - the Trino service `lakehouse`, and the policies below: who may run
    queries and see the catalog. A project's tables, and who may use them,
    are the project's: the platform operator adds and removes those policies.

Safe to run again: everything is created or updated in place.
"""
from lakekit import (BASE_POLICIES, RANGER, allow, bucket_rw, env, keycloak_people, log, res, setup_buckets, setup_ranger,
                     sync_people, wait_for)

ICEBERG = "iceberg"
POLICIES = BASE_POLICIES + [
    # Everyone may see that the catalog is there; engineers may add namespaces
    # to it. What's in a namespace is up to its project. (Ranger allows one
    # access policy per resource, so the catalog's policy has an item per group.)
    {"name": "iceberg catalog", "resources": res(catalog=ICEBERG),
     "policyItems": [allow(["all"], groups=["engineers"]), allow(["use", "show"], groups=["analysts", "pipelines"])]},
    # The catalog's information_schema, which tools read to list tables and
    # columns (Superset does, to check a dataset). Trino filters it down to
    # what each person may see anyway.
    {"name": "iceberg information_schema", "resources": res(catalog=ICEBERG, schema="information_schema"),
     "policyItems": [allow(["use", "show"], groups=["analysts", "engineers", "pipelines"])]},
    {"name": "iceberg information_schema tables",
     "resources": res(catalog=ICEBERG, schema="information_schema", table="*", column="*"),
     "policyItems": [allow(["select"], groups=["analysts", "engineers", "pipelines"])]},
]

if __name__ == "__main__":
    setup_buckets(
        buckets=["warehouse", "scratch", "storscale-platform"],
        policies={"lakehouse-engine": bucket_rw("warehouse"), "platform-store": bucket_rw("storscale-platform"),
                  "analysts": bucket_rw("scratch"), "engineers": bucket_rw("scratch")},
        accounts=[(env["TRINO_S3_ACCESS_KEY"], env["TRINO_S3_SECRET_KEY"], "lakehouse-engine"),
                  (env["NESSIE_S3_ACCESS_KEY"], env["NESSIE_S3_SECRET_KEY"], "lakehouse-engine"),
                  (env["PLATFORM_STORE_ACCESS_KEY"], env["PLATFORM_STORE_SECRET_KEY"], "platform-store")])
    wait_for("Ranger", f"{RANGER}/login.jsp")  # unauthenticated: five failed sign-ins lock Ranger's admin
    sync_people({**keycloak_people(), "service-account-airflow-pipelines": ["pipelines"]})
    setup_ranger(POLICIES)
    log("done")
