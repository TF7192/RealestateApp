# Monitoring stack — Prometheus + postgres_exporter + node_exporter + Grafana

Self-hosted observability for the Estia EC2 + RDS pair, brought up as
a separate `docker compose` project alongside the main estia-new stack.

## What it gives you

- **Postgres connection pool** (active vs idle) on the RDS instance
- **Slow / long-running query** metrics from `pg_stat_activity`
- **EC2 host CPU, memory, disk, network**
- **Postgres deadlocks, temp bytes/sec, transaction throughput**

The Estia backend's pino slow-query log (>200ms warn) covers
per-query specifics; this stack covers the system + pool view that
correlates "the app is slow" with "Postgres is at 80% of its
connection cap" or "EC2 swap usage just spiked".

## Where it runs

On the production EC2 itself, in `/home/ec2-user/estia-new/monitoring/`.
Bound to `127.0.0.1` only — not publicly exposed. Access via SSH tunnel:

```bash
ssh -L 3000:127.0.0.1:3000 -L 9090:127.0.0.1:9090 \
    -i ~/.ssh/tripzio.pem \
    ec2-user@ec2-13-49-145-46.eu-north-1.compute.amazonaws.com
# Then open http://localhost:3000  (Grafana)
#         http://localhost:9090  (Prometheus, raw queries)
```

## First-run setup

```bash
ssh ec2-user@<host>
cd /home/ec2-user/estia-new/monitoring

# 1. Build a libpq-clean DSN from the backend's DATABASE_URL.
#    The backend's DSN has Prisma-specific params (connection_limit,
#    pool_timeout, schema=public) that postgres_exporter chokes on.
DB_URL=$(sudo grep -E '^DATABASE_URL=' /home/ec2-user/estia-new/.env | cut -d= -f2- | tr -d '"')
LIBPQ_DSN=$(python3 -c "
from urllib.parse import urlsplit, parse_qsl, urlunsplit, urlencode
u = urlsplit('$DB_URL')
q = [(k,v) for k,v in parse_qsl(u.query) if k in ('sslmode',)]
print(urlunsplit((u.scheme, u.netloc, u.path, urlencode(q), u.fragment)))
")
echo "DATA_SOURCE_NAME=$LIBPQ_DSN" | sudo tee .env >/dev/null

# 2. Set a Grafana admin password
echo "GRAFANA_ADMIN_PASSWORD=$(openssl rand -hex 12)" | sudo tee -a .env >/dev/null
sudo chmod 600 .env

# 3. Bring it up
sudo docker compose -f docker-compose.monitoring.yml up -d

# 4. Verify
curl -s http://127.0.0.1:9187/metrics | head -5      # postgres_exporter
curl -s http://127.0.0.1:9090/api/v1/targets         # prometheus targets
curl -s http://127.0.0.1:3000/api/health             # grafana
```

The Grafana admin password is in `monitoring/.env` on the EC2:

```bash
sudo grep GRAFANA_ADMIN_PASSWORD /home/ec2-user/estia-new/monitoring/.env
```

## Provisioned dashboard

After Grafana boots it auto-loads the `Estia / Estia — Overview` dashboard
(`grafana/dashboards/estia-overview.json`). Includes:

- Postgres connections by state (active / idle / idle-in-transaction / waiting)
- Postgres connection count over time
- Slowest currently-running query duration (seconds)
- EC2 CPU %
- EC2 memory used %
- Disk used % (root)
- Postgres deadlocks/sec
- Postgres temp bytes/sec

To add a custom dashboard, drop a JSON file into `grafana/dashboards/`
on the host (path is bind-mounted) — Grafana picks it up within 30s.

## Troubleshooting

- `pg_up=0`: postgres_exporter can't reach RDS. Re-check `.env`'s
  `DATA_SOURCE_NAME` is libpq-clean (no `connection_limit`, no
  `schema=public`, no `pool_timeout`). Also verify the RDS security
  group allows port 5432 from the EC2's IP.

- `prometheus target node down`: `host.docker.internal` isn't resolving.
  Linux Docker needs `extra_hosts: ["host.docker.internal:host-gateway"]`
  on the prometheus service (already in the compose).

- Wipe history: `docker volume rm monitoring_prometheus_data
  monitoring_grafana_data` (will lose dashboards customized via UI;
  the provisioned base dashboard re-loads from disk on next start).

## Footprint

Idle stack uses ~250MB RAM, <1% CPU on the EC2. Prometheus storage
grows by ~50MB/day at the default 15s scrape interval; capped at
30 days retention so steady-state ~1.5GB on disk.
