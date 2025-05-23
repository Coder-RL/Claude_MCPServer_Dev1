# Service Status Report

## Port Scan Results
| Port | Service Type | Status | Process | Response Check |
|------|-------------|--------|---------|----------------|
| 3000 | React/Node Dev Server | ❌ Not Running | None | N/A |
| 3001 | Alternative Dev Server | ❌ Not Running | None | N/A |
| 3101 | Custom Frontend | ❌ Not Running | None | N/A |
| 4000 | Development Server | ❌ Not Running | None | N/A |
| 5000 | Flask/Python Dev | ❌ Not Running | None | N/A |
| 5173 | Vite Dev Server | ❌ Not Running | None | N/A |
| 8000 | Backend API/Django | ❌ Not Running | None | N/A |
| 8080 | Alternative Backend | ✅ Running | nginx (PID: 11261) | ✅ HTTP Responding + /health |
| 8081 | Proxy/Alternative | ❌ Not Running | None | N/A |
| 9000 | Admin/Monitoring | ✅ Running | php-fpm (PID: 2396) | N/A |

## Service Response Examples
### Port 8080 Response
```bash
$ curl -s --max-time 5 http://localhost:8080
<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
<style>
html { color-scheme: light dark; }
body { width: 35em; margin: 0 auto;
font-family: Tahoma, Verdana, Arial, sans-serif; }
</style>
</head>
```

