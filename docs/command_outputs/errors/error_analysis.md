# Error Analysis and Recent Issues

## Recent Log Files
```bash
$ find . -name '*.log' -mtime -7 | head -10
./node_modules/simple-swizzle/node_modules/is-arrayish/yarn-error.log
./logs/memory-simple_20250522_011650.log
./logs/ml-deployment_20250522_011913.log
./logs/startup_20250522_010844.log
./logs/startup_20250521_234039.log
./logs/memory-simple_20250522_011719.log
./logs/shutdown_20250522_010707.log
./logs/data-warehouse_20250522_011913.log
./logs/ml-deployment_20250522_013108.log
./logs/data-governance_20250522_011719.log
```
## Recent Error Messages
```
=== ./node_modules/simple-swizzle/node_modules/is-arrayish/yarn-error.log ===
      verror "1.10.0"
  verror@1.10.0:
    resolved "https://registry.yarnpkg.com/verror/-/verror-1.10.0.tgz#3a105ca17053af55d6e270c1f8288682e18da400"
  Error: Command failed.
      at ProcessTermError.MessageError (/Users/junon/.yarn/lib/cli.js:186:110)
      at new ProcessTermError (/Users/junon/.yarn/lib/cli.js:226:113)

=== ./logs/memory-simple_20250522_011650.log ===

=== ./logs/ml-deployment_20250522_011913.log ===

=== ./logs/startup_20250522_010844.log ===
time="2025-05-22T01:08:49-07:00" level=warning msg="/Users/robertlee/GitHubProjects/Claude_MCPServer/docker-compose.simple.yml: the attribute `version` is obsolete, it will be ignored, please remove it to avoid potential confusion"
[2025-05-22 01:08:55] [0;31m❌ sequential-thinking failed to start (check /Users/robertlee/GitHubProjects/Claude_MCPServer/logs/sequential-thinking_20250522_010844.log)[0m

=== ./logs/startup_20250521_234039.log ===
time="2025-05-21T23:40:40-07:00" level=warning msg="/Users/robertlee/GitHubProjects/Claude_MCPServer/docker-compose.yml: the attribute `version` is obsolete, it will be ignored, please remove it to avoid potential confusion"
failed to solve: failed to read dockerfile: open Dockerfile: no such file or directory
[2025-05-21 23:41:41] [0;31m❌ Redis failed to start after 30 attempts[0m

```
## Common Issue Indicators
```bash
$ npm outdated
Package                            Current    Wanted    Latest  Location                                       Depended by
@google-cloud/storage               6.12.0    6.12.0    7.16.0  node_modules/@google-cloud/storage             Claude_MCPServer
@modelcontextprotocol/sdk            0.5.0     0.5.0    1.12.0  node_modules/@modelcontextprotocol/sdk         Claude_MCPServer
@qdrant/js-client-rest              1.14.0    1.14.1    1.14.1  node_modules/@qdrant/js-client-rest            Claude_MCPServer
@types/chai                         4.3.20    4.3.20     5.2.2  node_modules/@types/chai                       Claude_MCPServer
@types/compression                   1.7.5     1.8.0     1.8.0  node_modules/@types/compression                Claude_MCPServer
@types/express                     4.17.22   4.17.22     5.0.2  node_modules/@types/express                    Claude_MCPServer
@types/node                       20.17.50  20.17.50  22.15.21  node_modules/@types/node                       Claude_MCPServer
@types/uuid                          9.0.8     9.0.8    10.0.0  node_modules/@types/uuid                       Claude_MCPServer
@typescript-eslint/eslint-plugin    6.21.0    6.21.0    8.32.1  node_modules/@typescript-eslint/eslint-plugin  Claude_MCPServer
@typescript-eslint/parser           6.21.0    6.21.0    8.32.1  node_modules/@typescript-eslint/parser         Claude_MCPServer
bcryptjs                             2.4.3     2.4.3     3.0.2  node_modules/bcryptjs                          Claude_MCPServer
chai                                 4.5.0     4.5.0     5.2.0  node_modules/chai                              Claude_MCPServer
concurrently                         8.2.2     8.2.2     9.1.2  node_modules/concurrently                      Claude_MCPServer
eslint                              8.57.1    8.57.1    9.27.0  node_modules/eslint                            Claude_MCPServer
express                             4.21.2    4.21.2     5.1.0  node_modules/express                           Claude_MCPServer
helmet                               7.2.0     7.2.0     8.1.0  node_modules/helmet                            Claude_MCPServer
mocha                               10.8.2    10.8.2    11.4.0  node_modules/mocha                             Claude_MCPServer
mongodb                              5.9.2     5.9.2    6.16.0  node_modules/mongodb                           Claude_MCPServer
node-cron                            3.0.3     3.0.3     4.0.7  node_modules/node-cron                         Claude_MCPServer
redis                                4.7.1     4.7.1     5.1.0  node_modules/redis                             Claude_MCPServer
rimraf                              5.0.10    5.0.10     6.0.1  node_modules/rimraf                            Claude_MCPServer
supertest                            6.3.4     6.3.4     7.1.1  node_modules/supertest                         Claude_MCPServer
tsx                                 3.14.0    3.14.0    4.19.4  node_modules/tsx                               Claude_MCPServer
typedoc                             0.24.8    0.24.8    0.28.4  node_modules/typedoc                           Claude_MCPServer
typescript                           5.1.6     5.8.3     5.8.3  node_modules/typescript                        Claude_MCPServer
uuid                                 9.0.1     9.0.1    11.1.0  node_modules/uuid                              Claude_MCPServer
zod                                3.25.13   3.25.23   3.25.23  node_modules/zod                               Claude_MCPServer
All packages up to date or npm not available
```
