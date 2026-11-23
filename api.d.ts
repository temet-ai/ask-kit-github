interface GhResult { code: number; out: string; err: string; timedOut?: boolean }

declare const gh: {
  repo: string | null; // "owner/name": the repository every call is about unless you pass -R
  at(repo: string): typeof gh; // a client for owner/name; leaves this client's default unchanged

  // Any gh subcommand, no shell: pass each argument separately. `-R <repo>` is added to repo-scoped
  // commands (pr, issue, run, workflow, release, label, cache, secret, variable) unless you give one.
  // Acts as well as reads: gh("pr", "comment", "12", "-b", "text"), gh("run", "rerun", id, "--failed"),
  // gh("pr", "merge", "12", "--squash"), gh("issue", "close", "7"). Never throws on a non-zero exit.
  // Refused: `gh auth token` / --show-token (prints the login's token) and --watch (never ends).
  run(...args: string[]): Promise<GhResult>;

  // A listing or view with --json, parsed: list("pr", "list", ["number","title","author"], "--state", "all", "-L", "50").
  // `fields` are gh's JSON fields (gh <cmd> <sub> --json with no value prints them). Throws with gh's error on failure.
  list(cmd: string, sub: string, fields: string | string[], ...rest: string[]): Promise<any>;

  // The REST API. "{owner}/{repo}" in the endpoint fills in from gh.repo. fields become -f (strings)
  // or -F (numbers, booleans). paginate: every page, flattened into one array. Throws on failure.
  api(endpoint: string, o?: { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; fields?: Record<string, unknown>; paginate?: boolean }): Promise<any>;

  // A GraphQL query; string variables go as -f, others as -F. Returns {data, errors?}. Throws on failure.
  graphql(query: string, vars?: Record<string, unknown>): Promise<any>;

  // A workflow run's log as text, lines "job<TAB>step<TAB>timestamp text". failed: only failed steps.
  // job: one job id. Capped at `max` chars (default 200000) from the end; `chars` is the full length.
  log(runId: string | number, o?: { failed?: boolean; job?: string | number; max?: number }): Promise<{ chars: number; complete: boolean; text: string }>;
};
