"""Configure the platform, one stage at a time: python /tools/setup/run.py <stage>

  base    before Trino starts: Buckets' buckets, policies and accounts for the
          lakehouse, the notebooks and monitoring; Ranger's people and policies.
  trino   once Trino is up: the policies and data Superset and Airflow need.

Every step is safe to run again.
"""
import subprocess
import sys

STAGES = {"base": ["lakehouse", "jupyterhub", "monitoring"], "trino": ["superset", "airflow"]}

for step in STAGES[sys.argv[1]]:
    print(f"setup: == {step}", flush=True)
    if subprocess.run([sys.executable, "-u", f"/tools/setup/{step}.py"]).returncode:
        sys.exit(f"setup: {step} failed")
