# semanticd: the platform's semantic layer (MetricFlow, without dbt) and its
# MCP server for agents.
FROM python:3.12-slim
RUN pip install --no-cache-dir metricflow==0.213.0 "mcp==2.3.0" uvicorn==0.37.0 trino==0.340.0 \
      "pyjwt[crypto]==2.10.1" boto3==1.43.108 pyyaml==6.0.3 requests==2.34.2
WORKDIR /app
COPY semanticd.py .
USER 65532
CMD ["uvicorn", "semanticd:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
