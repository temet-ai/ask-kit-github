# ask-kit-github

An [ask-kit](https://github.com/temet-ai/ask-kit) kit that lets your coding agent's `ask` tool
answer questions about a GitHub repository. A cheap model runs the `gh` calls outside your agent's
context, through your own `gh` login, and answers with PR and issue numbers, run ids and links.

Questions from its bench, of the kind agents answer by hand with `gh`:

- Was pull request 387 in temet-ai/mike merged, and with which merge commit?
- Two CI runs on main failed around 06:06 UTC. Why did each fail, and which commits fixed them?
- Has the work in issues 350 to 354 been fixed? Which are closed and which are still open?

## Install

You need [ask-kit](https://github.com/temet-ai/ask-kit#set-it-up) and the
[GitHub CLI](https://cli.github.com), logged in (`gh auth login`).

Paste this into your agent:

```
Read ~/.config/ask-kit/AGENTS.md, then add this kit: github.com/temet-ai/ask-kit-github
```

Or run it yourself:

```sh
ask-kit kit install temet-ai/ask-kit-github        # shows what it reads, changes and runs
ask-kit kit install temet-ai/ask-kit-github --yes  # installs and enables it
```

Restart your agents so `ask` lists `github`. `ask-kit kit list` says whether it can run on this
machine, and why not.

## Settings

| Setting | Default | What it is |
|---|---|---|
| `GITHUB_REPO` | the repository your agent works in (`gh repo view`) | `owner/name` to pin another repository |

Set it in the environment or in ask-kit's config as `domains.github.settings.GITHUB_REPO`.

## What it can change

When asked, it comments on pull requests and issues, reviews, merges, reruns workflow runs, labels,
and opens or closes issues. It does this as you, with your `gh` login's rights.

## How well it works

The bench, `bench/questions.json`, holds real questions, each with patterns its answer must
match. `ask-kit kit test github` on 2026-11-18, five questions about temet-ai/mike and
temet-ai/ask-kit: deepseek-v4.1-flash 5/5 (median 69 s, $0.0086 for all five), glm-5.3-flash 4/5
(it named one of the two fixing commits). Replace the questions with ones about your own repository.

## What is in it

`gh.mjs` gives the investigator `gh` and the GitHub API. Its scripts are `ci-failure` (the failing
step and error line of a run), `pr-status` (checks, reviews, unresolved threads, mergeable),
`find` (issues and PRs about something) and `activity` (what merged or was released in a period).
[RECIPE.md](RECIPE.md) says what it reads and runs, and how to rebuild it.

MIT licence.
