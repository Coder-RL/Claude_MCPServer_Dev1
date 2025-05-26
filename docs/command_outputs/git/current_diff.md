# Current Changes - Staged and Unstaged
```bash
$ git diff --name-status
M	docs/command_outputs/git/branch_info.md
M	docs/command_outputs/git/current_diff.md
M	docs/command_outputs/git/recent_commits.md

$ git diff --cached --name-status

$ git diff --stat
 docs/command_outputs/git/branch_info.md    |   2 +-
 docs/command_outputs/git/current_diff.md   |   5 -
 docs/command_outputs/git/recent_commits.md | 161 +++++++++++------------------
 3 files changed, 63 insertions(+), 105 deletions(-)
```
