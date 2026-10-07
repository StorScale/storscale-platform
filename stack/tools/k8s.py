"""The little of Kubernetes' API the platform's setup steps use, when they run
in a cluster (STORSCALE_K8S): a Secret one step writes and others read, and
the marks that say a setup step of this release has finished.

    python k8s.py done <step>     mark <step> finished, for this revision

Uses the pod's service account; nothing outside the release's namespace.
"""
import base64
import os
import sys

import requests

SA = "/var/run/secrets/kubernetes.io/serviceaccount"
DONE = "storscale-setup-done"   # a ConfigMap: setup step -> the revision it last finished for


def in_cluster():
    return os.environ.get("STORSCALE_K8S") == "true" and os.path.exists(f"{SA}/token")


def _api(method, path, **kw):
    host = os.environ["KUBERNETES_SERVICE_HOST"]
    port = os.environ.get("KUBERNETES_SERVICE_PORT", "443")
    with open(f"{SA}/token") as f:
        token = f.read().strip()
    with open(f"{SA}/namespace") as f:
        ns = f.read().strip()
    return requests.request(method, f"https://{host}:{port}/api/v1/namespaces/{ns}/{path}",
                            headers={"Authorization": f"Bearer {token}"}, verify=f"{SA}/ca.crt", timeout=30, **kw)


def _put(kind, name, body):
    """Create or replace a Secret or ConfigMap."""
    body = {"apiVersion": "v1", "kind": {"secrets": "Secret", "configmaps": "ConfigMap"}[kind],
            "metadata": {"name": name, "labels": {"app.kubernetes.io/part-of": "storscale-platform"}}, **body}
    r = _api("PUT", f"{kind}/{name}", json=body)
    if r.status_code == 404:
        r = _api("POST", kind, json=body)
    r.raise_for_status()


def put_secret(name, data):
    """A Secret of the given files (key -> text)."""
    _put("secrets", name, {"type": "Opaque",
                           "data": {k: base64.b64encode(v.encode()).decode() for k, v in data.items()}})


def get_secret(name):
    r = _api("GET", f"secrets/{name}")
    if r.status_code == 404:
        return {}
    r.raise_for_status()
    return {k: base64.b64decode(v).decode() for k, v in (r.json().get("data") or {}).items()}


def done_revision(step):
    r = _api("GET", f"configmaps/{DONE}")
    if r.status_code == 404:
        return 0
    r.raise_for_status()
    return int((r.json().get("data") or {}).get(step, "0"))


def mark_done(step, revision):
    r = _api("GET", f"configmaps/{DONE}")
    data = (r.json().get("data") or {}) if r.ok else {}
    data[step] = str(revision)
    _put("configmaps", DONE, {"data": data})


if __name__ == "__main__":
    if sys.argv[1:2] == ["done"] and len(sys.argv) == 3:
        mark_done(sys.argv[2], int(os.environ["STORSCALE_REVISION"]))
        print(f"{sys.argv[2]}: done (revision {os.environ['STORSCALE_REVISION']})")
    else:
        sys.exit(__doc__)
