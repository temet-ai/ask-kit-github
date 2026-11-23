export const meta = {
  purpose:
    "Why CI failed: finds the failing run for a pull request, a branch or a run id, lists its failed jobs and steps, and pulls the error lines and the last lines of each failed job's log. Checks from outside GitHub Actions come back with their link.",
  params: {
    repo: "owner/name, optional (default: the caller's repository)",
    pr: "pull request number, optional",
    branch: "branch name, optional (latest failed run on it)",
    run: "workflow run id, optional",
    lines: "error lines kept per job, default 25",
  },
  returns:
    "{run:{id, workflow, title, branch, sha, event, conclusion, url, created}, failedJobs:[{id, name, url, failedSteps, errors:[line], tail:[line]}], otherFailedChecks:[{name, url}], note}",
  example: 'await scripts.run("ci-failure", { pr: 12 })',
};

const ERR = /\b(error|failed|failure|fatal|panic|panicked|exception|traceback|assert(ion)?|cannot|could not|not found|denied|timed? ?out|exit code [1-9])\b|✗|✖|FAIL\b/i;
const runIdOf = (url) => url?.match(/\/actions\/runs\/(\d+)/)?.[1] ?? null;

export default async function ({ gh }, { repo, pr, branch, run, lines = 25 }) {
  if (repo) gh = gh.at(repo);
  let runId = run ? String(run) : null;
  const otherFailedChecks = [];
  let note = null;

  if (!runId && pr) {
    const p = await gh.list("pr", "view", ["headRefName", "statusCheckRollup"], String(pr));
    const failed = (p.statusCheckRollup ?? []).filter((c) => ["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(c.conclusion ?? c.state));
    for (const c of failed) {
      const id = runIdOf(c.detailsUrl ?? c.targetUrl);
      if (id && !runId) runId = id;
      else if (!id) otherFailedChecks.push({ name: c.name ?? c.context, url: c.detailsUrl ?? c.targetUrl });
    }
    if (!runId && !otherFailedChecks.length) {
      const pending = (p.statusCheckRollup ?? []).filter((c) => !c.conclusion && c.status !== "COMPLETED");
      return { run: null, failedJobs: [], otherFailedChecks, note: `no failed checks on #${pr}${pending.length ? `; ${pending.length} still running: ${pending.map((c) => c.name).join(", ")}` : ""}` };
    }
    branch ??= p.headRefName;
  }

  if (!runId && branch) {
    const runs = await gh.list("run", "list", ["databaseId", "conclusion", "status"], "--branch", branch, "-L", "20");
    const f = runs.find((r) => r.conclusion === "failure" || r.conclusion === "timed_out" || r.conclusion === "startup_failure");
    if (!f) return { run: null, failedJobs: [], otherFailedChecks, note: `no failed run among the last ${runs.length} on ${branch}` };
    runId = String(f.databaseId);
    if (runs[0] !== f) note = `the latest run on ${branch} is ${runs[0].status}/${runs[0].conclusion ?? "-"}; this is the latest failed one`;
  }
  if (!runId) {
    if (otherFailedChecks.length) return { run: null, failedJobs: [], otherFailedChecks, note: "the failing checks are not GitHub Actions runs; follow their links" };
    throw new Error("ci-failure needs `pr`, `branch` or `run`");
  }

  const v = await gh.list("run", "view", ["databaseId", "workflowName", "displayTitle", "headBranch", "headSha", "event", "conclusion", "url", "createdAt", "jobs"], runId);
  const failedJobs = (v.jobs ?? []).filter((j) => j.conclusion && !["success", "skipped", "neutral"].includes(j.conclusion));
  // One log for all failed steps: "job<TAB>step<TAB>timestamp text".
  let log = { text: "", complete: true };
  try {
    log = await gh.log(runId, { failed: true });
  } catch (e) {
    note = [note, `log not available: ${e.message.slice(0, 200)}`].filter(Boolean).join("; ");
  }
  const byJob = new Map();
  for (const raw of log.text.split("\n")) {
    const [job, , rest] = raw.split("\t");
    if (rest == null) continue;
    const text = rest.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z\s?/, "").replace(/\x1b\[[0-9;]*m/g, "").trimEnd();
    if (!text) continue;
    const arr = byJob.get(job) ?? [];
    arr.push(text);
    byJob.set(job, arr);
  }
  return {
    run: { id: v.databaseId, workflow: v.workflowName, title: v.displayTitle, branch: v.headBranch, sha: v.headSha?.slice(0, 10), event: v.event, conclusion: v.conclusion, url: v.url, created: v.createdAt },
    failedJobs: failedJobs.map((j) => {
      const all = byJob.get(j.name) ?? [...byJob.entries()].find(([k]) => j.name.startsWith(k) || k.startsWith(j.name))?.[1] ?? [];
      return {
        id: j.databaseId,
        name: j.name,
        url: j.url,
        failedSteps: (j.steps ?? []).filter((s) => s.conclusion === "failure").map((s) => s.name),
        errors: [...new Set(all.filter((l) => ERR.test(l)).map((l) => l.slice(0, 300)))].slice(0, lines),
        tail: all.slice(-15).map((l) => l.slice(0, 300)),
      };
    }),
    otherFailedChecks,
    note,
  };
}
