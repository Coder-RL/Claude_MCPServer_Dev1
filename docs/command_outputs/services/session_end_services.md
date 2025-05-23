# Service State at Session End

## Current Running Services
```bash
$ lsof -i :3000-9000 | grep LISTEN
php-fpm    2396 robertlee    9u  IPv4 0x73393d112e940b28      0t0  TCP localhost:cslistener (LISTEN)
postgres   2398 robertlee    7u  IPv6 0xe8371a59a717326a      0t0  TCP localhost:postgresql (LISTEN)
postgres   2398 robertlee    8u  IPv4 0x46b6febf22137215      0t0  TCP localhost:postgresql (LISTEN)
php-fpm    2455 robertlee   10u  IPv4 0x73393d112e940b28      0t0  TCP localhost:cslistener (LISTEN)
php-fpm    2456 robertlee   10u  IPv4 0x73393d112e940b28      0t0  TCP localhost:cslistener (LISTEN)
Python     3025 robertlee    3u  IPv4 0x69ee1cfd6f8f48db      0t0  TCP *:irdmi (LISTEN)
Python     3028 robertlee    3u  IPv4 0x69ee1cfd6f8f48db      0t0  TCP *:irdmi (LISTEN)
nginx     11261 robertlee    8u  IPv4 0x7c422de5565389b9      0t0  TCP *:http-alt (LISTEN)
nginx     11261 robertlee    9u  IPv4 0x80a88fb20f0521ba      0t0  TCP *:ddi-tcp-2 (LISTEN)
Google    18951 robertlee   44u  IPv6 0x6f5861dc45e71172      0t0  TCP localhost:7679 (LISTEN)
nginx     57953 robertlee    8u  IPv4 0x7c422de5565389b9      0t0  TCP *:http-alt (LISTEN)
nginx     57953 robertlee    9u  IPv4 0x80a88fb20f0521ba      0t0  TCP *:ddi-tcp-2 (LISTEN)
```
## Service Health Checks
### Port 8000
```bash
$ curl -s --max-time 5 http://localhost:8000 | head -5
{"detail":"Not Found"}
$ curl -s --max-time 5 http://localhost:8000/health
{"status":"degraded","version":"2025.1.0","services":{"redis":"unhealthy"}}```
### Port 8080
```bash
$ curl -s --max-time 5 http://localhost:8080 | head -5
<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
<style>

$ curl -s --max-time 5 http://localhost:8080/health
<html>
<head><title>404 Not Found</title></head>
<body>
<center><h1>404 Not Found</h1></center>
<hr><center>nginx/1.27.4</center>
</body>
</html>
```
