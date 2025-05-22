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
node       5644 robertlee   15u  IPv4 0x23d64ccf0dd4dbd2      0t0  TCP *:3301 (LISTEN)
node       5676 robertlee   27u  IPv6 0xd0ecf519a36c17c4      0t0  TCP localhost:trusted-web (LISTEN)
node       5692 robertlee   27u  IPv6 0xf9d07c7fce88556e      0t0  TCP localhost:twsdss (LISTEN)
node       5708 robertlee   27u  IPv6  0xf51740de030bef4      0t0  TCP localhost:gilatskysurfer (LISTEN)
node       5723 robertlee   27u  IPv6 0x9943cc898c2202bf      0t0  TCP localhost:broker_service (LISTEN)
node       5740 robertlee   27u  IPv6 0x2e182a902aa2fe44      0t0  TCP localhost:nati-dstp (LISTEN)
nginx     11261 robertlee    8u  IPv4 0x7c422de5565389b9      0t0  TCP *:http-alt (LISTEN)
nginx     11261 robertlee    9u  IPv4 0x80a88fb20f0521ba      0t0  TCP *:ddi-tcp-2 (LISTEN)
Python    30042 robertlee   10u  IPv4 0x334dbdb4b9fda5d4      0t0  TCP *:irdmi (LISTEN)
nginx     57953 robertlee    8u  IPv4 0x7c422de5565389b9      0t0  TCP *:http-alt (LISTEN)
nginx     57953 robertlee    9u  IPv4 0x80a88fb20f0521ba      0t0  TCP *:ddi-tcp-2 (LISTEN)
com.docke 78940 robertlee    9u  IPv6  0xe1940390c71dcbf      0t0  TCP *:tick-port (LISTEN)
com.docke 78940 robertlee   13u  IPv6 0x2e3c110356e59ab1      0t0  TCP *:cpq-tasksmart (LISTEN)
com.docke 78940 robertlee   53u  IPv6 0xb1c51ec83deff517      0t0  TCP *:postgresql (LISTEN)
com.docke 78940 robertlee  155u  IPv6 0x666469314ba7a32e      0t0  TCP *:6379 (LISTEN)
com.docke 78940 robertlee  161u  IPv6 0x8b007d3a6f77b466      0t0  TCP *:6333 (LISTEN)
com.docke 78940 robertlee  162u  IPv6 0xea1acb00fa1fb172      0t0  TCP *:6334 (LISTEN)
node      93162 robertlee   20u  IPv4 0x5bc176653d6de69d      0t0  TCP *:filecast (LISTEN)
node      96509 robertlee   31u  IPv6 0x20ed83091e26696c      0t0  TCP localhost:opcon-xps (LISTEN)
```
## Service Health Checks
### Port 8000
```bash
$ curl -s --max-time 5 http://localhost:8000 | head -5
{"message":"ClarusRev ASC 606 API is running","status":"healthy"}
$ curl -s --max-time 5 http://localhost:8000/health
{"status":"healthy","service":"ClarusRev ASC 606"}```
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
