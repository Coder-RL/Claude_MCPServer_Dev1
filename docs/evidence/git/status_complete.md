# Git Status - Complete Context
```bash
$ git status
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   CONTEXT_SNAPSHOT.md
	modified:   PROJECT_LOG.jsonl
	modified:   SESSION_START.md

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/evidence/

no changes added to commit (use "git add" and/or "git commit -a")

$ git status --porcelain
 M CONTEXT_SNAPSHOT.md
 M PROJECT_LOG.jsonl
 M SESSION_START.md
?? docs/evidence/
```
