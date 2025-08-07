# Health Controller

This module provides comprehensive health monitoring endpoints for the RunnerCoin API.

## Endpoints

### GET `/health`

Comprehensive health check that monitors all critical services and dependencies.

**Response:**

```json
{
  "status": "healthy|unhealthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "environment": "production",
  "services": {
    "database": "healthy|unhealthy",
    "openai": "healthy|unhealthy",
    "storage": "healthy|unhealthy",
    "neynar": "healthy|unhealthy"
  },
  "memory": {
    "used": 128,
    "total": 512,
    "percentage": 25
  },
  "environment_variables": {
    "database": "configured|missing",
    "openai": "configured|missing",
    "storage": "configured|missing",
    "neynar": "configured|missing"
  }
}
```

### GET `/health/ready`

Readiness probe for Kubernetes/container orchestration. More strict than liveness.

**Response:**

```json
{
  "status": "ready",
  "checks": {
    "database": true,
    "environment": true
  }
}
```

### GET `/health/live`

Liveness probe for Kubernetes/container orchestration. Basic service availability check.

**Response:**

```json
{
  "status": "alive",
  "uptime": 3600,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### GET `/health/ping`

Simple connectivity test endpoint.

**Response:**

```json
{
  "pong": "pong",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### GET `/health/detailed`

Detailed health check with response time measurement.

**Response:**

```json
{
  "status": "healthy|unhealthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "environment": "production",
  "services": {
    "database": "healthy|unhealthy",
    "openai": "healthy|unhealthy",
    "storage": "healthy|unhealthy",
    "neynar": "healthy|unhealthy"
  },
  "memory": {
    "used": 128,
    "total": 512,
    "percentage": 25
  },
  "environment_variables": {
    "database": "configured|missing",
    "openai": "configured|missing",
    "storage": "configured|missing",
    "neynar": "configured|missing"
  },
  "responseTime": 45
}
```

## Environment Variables Checked

The health controller monitors the following environment variables:

- **Database**: `DATABASE_HOST`, `DATABASE_USER`, `DATABASE_PASSWORD`
- **OpenAI**: `OPENAI_API_KEY`
- **Storage**: `DO_SPACES_ACCESS_KEY_ID`, `DO_SPACES_SECRET_KEY`, `DO_SPACES_BUCKET`
- **Neynar**: `NEYNAR_API_KEY`

## Usage in Production

### Docker Health Checks

The Dockerfile.prod includes a health check:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

### Kubernetes Probes

For Kubernetes deployment, use:

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
```

### Monitoring Integration

These endpoints can be integrated with monitoring tools like:

- Prometheus
- Grafana
- DataDog
- New Relic
- AWS CloudWatch

## Troubleshooting

1. **Service shows as unhealthy**: Check environment variables and database connectivity
2. **Readiness probe fails**: Verify database is accessible and all required env vars are set
3. **High memory usage**: Monitor the memory percentage in the health response
4. **Slow response times**: Use the `/health/detailed` endpoint to measure response times
