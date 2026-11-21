# Recipe: github kit

## What it answers

GitHub state for one repository: pull requests, issues, workflow runs, reviews, releases. Why a
check failed, where a PR stands, which PR or issue covers a topic, what happened in a time window.
It changes things when asked (`acts` in `ask-kit.toml`): comment, review, merge, rerun, label,
open and close issues.

## What it needs

- `gh` on PATH, logged in. Every call runs with that login's rights.
- Nothing else: no keys of its own, no build step.

## What it reads and runs

- Runs `gh` (no shell) through `gh.mjs`: any subcommand, `gh api` (REST and GraphQL), and run logs.
- Refuses only `gh auth token` / `--show-token` (it would print the login's token, and answers
  go to a model) and `--watch` (never ends).
- The repository comes from `GITHUB_REPO`, else `gh repo view` in the caller's directory.

## Rebuild it from an empty folder

Write `ask-kit.toml` with one `module` source named `gh` and a `GITHUB_REPO` setting detected by
`gh repo view --json nameWithOwner -q .nameWithOwner`. The module exports `make({settings, push})`
returning a client with `run(...args)` (adds `-R <repo>` to repo-scoped subcommands, reports every
call through `push`), `list(cmd, sub, fields, ...rest)` (`--json` parsed), `api(endpoint, {method,
fields, paginate})`, `graphql(query, vars)` and `log(runId, {failed, job})`. Describe it exactly in
`api.d.ts`. Scripts: `ci-failure` (failing run for a PR, branch or run id; failed jobs and steps;
error lines from `gh run view --log-failed`), `pr-status` (checks, reviews, unresolved review
threads from GraphQL), `find` (search/issues), `activity` (merged, opened, closed, releases, runs
by result in N days). `instructions.md`: start from a script, prefer JSON fields, quote the failing
log line, never guess a number.

## Bench

`bench/questions.json`: five questions of the kinds agents answer by hand with `gh`,
about the public repositories temet-ai/mike and temet-ai/ask-kit.

## Results

ask-kit `kit test` on 2026-11-18: deepseek-v4.1-flash 5/5 (median 69 s, $0.0086 for the bench); glm-5.3-flash 4/5 (it named one of the two fixing commits).
