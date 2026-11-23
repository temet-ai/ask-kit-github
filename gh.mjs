// A client for GitHub through the `gh` command: any gh subcommand, the REST and GraphQL API, and
// JSON listings, all for one repository by default. It reads and acts (comment, rerun, merge,
// label, close): whatever gh can do with the user's login.
//
// One check, not about acting: answers go to a cloud model, so commands that print the login's
// token are refused.
import { execFile } from "node:child_process";

const deny = (why) => {
  throw new Error(`not allowed: ${why}`);
};

function check(args) {
  const a = args.map(String);
  if (a[0] === "auth" && (a[1] === "token" || a.includes("--show-token") || a.includes("-t"))) deny("it prints the login's token");
  if (a.includes("--watch") || (a[0] === "run" && a[1] === "watch")) deny("watching never ends; poll with `gh run view` instead");
  return a;
}

function exec(args, { cwd, timeoutMs = 120_000 } = {}) {
  return new Promise((resolve) => {
    execFile("gh", args, { cwd, timeout: timeoutMs, maxBuffer: 64 << 20, encoding: "utf8", env: { ...process.env, GH_PAGER: "", PAGER: "cat", NO_COLOR: "1", GH_PROMPT_DISABLED: "1" } }, (err, stdout, stderr) => {
      if (err?.code === "ENOENT") resolve({ code: 127, out: "", err: "gh is not installed: https://cli.github.com" });
      else resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, out: stdout ?? "", err: (stderr ?? "").slice(0, 2000), timedOut: !!err?.killed });
    });
  });
}

// The kit's module source: make(ctx) returns the `gh` global.
export function make({ settings, push }) {
  return makeGh({ repo: settings.GITHUB_REPO ?? null, cwd: process.cwd(), push });
}

export function makeGh({ repo, cwd, push }) {
  const note = (kind, detail, started, r) => push({ kind, detail: detail.slice(0, 200), ms: Date.now() - started, code: r.code, size: r.out.length });

  // gh subcommands that take -R/--repo; for these the default repository is added unless one is given.
  const TAKES_REPO = new Set(["pr", "issue", "run", "workflow", "release", "label", "cache", "secret", "variable", "ruleset", "attestation"]);
  const withRepo = (a) => {
    if (!repo || !TAKES_REPO.has(a[0]) || a.some((x) => x === "-R" || x.startsWith("--repo"))) return a;
    return [...a, "-R", repo];
  };

  const run = async (...args) => {
    const a = withRepo(check(args));
    const started = Date.now();
    const r = await exec(a, { cwd });
    note("gh", `gh ${a.join(" ")}`, started, r);
    return r;
  };

  // Parse a gh call's JSON output; throw with gh's own error when it failed.
  const json = async (...args) => {
    const r = await run(...args);
    if (r.code !== 0) throw new Error(`gh ${args.slice(0, 4).join(" ")}: ${(r.err || r.out).trim().slice(0, 500)}`);
    return r.out.trim() ? JSON.parse(r.out) : null;
  };

  return {
    repo,

    /** A separate client for a named repository; the caller's default is unchanged. */
    at(repository) {
      if (typeof repository !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error("gh.at needs owner/name");
      return makeGh({ repo: repository, cwd, push });
    },

    /** Any gh subcommand (no shell). -R <repo> is added for repo-scoped commands. Never throws on a non-zero exit. */
    run,

    /** A gh listing or view with --json: json("pr", "list", ["number","title"], "--state", "all"). Throws on failure. */
    async list(cmd, sub, fields, ...rest) {
      return json(cmd, sub, ...rest, "--json", [].concat(fields).join(","));
    },

    /**
     * The REST or GraphQL API: api("repos/{owner}/{repo}/pulls/12/comments"). {owner} and {repo} fill
     * in from the default repository. o.method, o.fields ({k: v} as -f k=v; numbers and booleans as -F),
     * o.paginate (all pages, as one array). Throws on failure.
     */
    async api(endpoint, o = {}) {
      const a = ["api", endpoint.replace("{owner}/{repo}", repo ?? "{owner}/{repo}")];
      if (o.method) a.push("-X", o.method);
      if (o.paginate) a.push("--paginate", "--slurp");
      for (const [k, v] of Object.entries(o.fields ?? {})) a.push(typeof v === "string" ? "-f" : "-F", `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`);
      const out = await json(...a);
      return o.paginate && Array.isArray(out) ? out.flat() : out;
    },

    /** Read one repository file without requiring a base64 decoder in the investigator. */
    async file(file, o = {}) {
      if (typeof file !== "string" || !file.trim()) throw new Error("gh.file needs a repository-relative file path");
      const endpoint = `repos/{owner}/{repo}/contents/${file.split("/").map(encodeURIComponent).join("/")}${o.ref ? `?ref=${encodeURIComponent(o.ref)}` : ""}`;
      const value = await json("api", endpoint.replace("{owner}/{repo}", repo ?? "{owner}/{repo}"));
      if (value?.type !== "file" || value.encoding !== "base64" || typeof value.content !== "string") throw new Error("gh.file needs a file with base64 content; directories and large files need the Git blobs API");
      return { path: value.path, sha: value.sha, text: Buffer.from(value.content, "base64").toString("utf8") };
    },

    /** A GraphQL query with variables. Throws on failure. */
    async graphql(query, vars = {}) {
      const a = ["api", "graphql", "-f", `query=${query}`];
      for (const [k, v] of Object.entries(vars)) a.push(typeof v === "string" ? "-f" : "-F", `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`);
      return json(...a);
    },

    /** The log of a workflow run, or of one job (o.job), as text; o.failed keeps only failed steps. Capped at o.max chars (default 200k), from the end. */
    async log(runId, o = {}) {
      const a = ["run", "view", String(runId), o.failed ? "--log-failed" : "--log"];
      if (o.job) a.push("--job", String(o.job));
      const r = await run(...a);
      if (r.code !== 0) throw new Error(`gh run view ${runId} --log: ${(r.err || r.out).trim().slice(0, 500)}`);
      const max = o.max ?? 200_000;
      return { chars: r.out.length, complete: r.out.length <= max, text: r.out.slice(-max) };
    },
  };
}
