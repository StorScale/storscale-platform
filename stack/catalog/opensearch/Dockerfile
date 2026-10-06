# OpenSearch for OpenMetadata's search: the core alone. The bundled plugins
# (ML, security, alerting, k-NN and the rest) aren't used, take minutes to
# load, and cost memory, so they're removed. Plugins depend on one another,
# so this removes whatever it can until none are left.
FROM opensearchproject/opensearch:3.3.2
RUN for pass in 1 2 3 4 5 6; do \
      for p in $(bin/opensearch-plugin list); do bin/opensearch-plugin remove --purge "$p" >/dev/null 2>&1 || true; done; \
    done; \
    test -z "$(bin/opensearch-plugin list)" || { bin/opensearch-plugin list; exit 1; }
