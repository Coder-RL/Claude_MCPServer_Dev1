# Service State at Session End

## Current Running Services
```bash
$ lsof -i :3000-9000 | grep LISTEN
php-fpm    2396 robertlee    9u  IPv4 0x73393d112e940b28      0t0  TCP localhost:cslistener (LISTEN)
postgres   2398 robertlee    7u  IPv6 0xe8371a59a717326a      0t0  TCP localhost:postgresql (LISTEN)
postgres   2398 robertlee    8u  IPv4 0x46b6febf22137215      0t0  TCP localhost:postgresql (LISTEN)
Google     2434 robertlee   42u  IPv6 0xf4b53883c1767f19      0t0  TCP localhost:7679 (LISTEN)
php-fpm    2455 robertlee   10u  IPv4 0x73393d112e940b28      0t0  TCP localhost:cslistener (LISTEN)
php-fpm    2456 robertlee   10u  IPv4 0x73393d112e940b28      0t0  TCP localhost:cslistener (LISTEN)
nginx     11261 robertlee    8u  IPv4 0x7c422de5565389b9      0t0  TCP *:http-alt (LISTEN)
nginx     11261 robertlee    9u  IPv4 0x80a88fb20f0521ba      0t0  TCP *:ddi-tcp-2 (LISTEN)
nginx     57953 robertlee    8u  IPv4 0x7c422de5565389b9      0t0  TCP *:http-alt (LISTEN)
nginx     57953 robertlee    9u  IPv4 0x80a88fb20f0521ba      0t0  TCP *:ddi-tcp-2 (LISTEN)
com.docke 78940 robertlee    9u  IPv6  0xe1940390c71dcbf      0t0  TCP *:tick-port (LISTEN)
com.docke 78940 robertlee   13u  IPv6 0x2e3c110356e59ab1      0t0  TCP *:cpq-tasksmart (LISTEN)
com.docke 78940 robertlee  105u  IPv6 0x4b5a7bf026827c04      0t0  TCP *:postgresql (LISTEN)
com.docke 78940 robertlee  110u  IPv6 0x20ed83091e26696c      0t0  TCP *:6333 (LISTEN)
com.docke 78940 robertlee  111u  IPv6 0xd0ecf519a36c17c4      0t0  TCP *:6334 (LISTEN)
```
## Service Health Checks
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
