export const meta = {
  purpose:
    "What happened in the repository in a time window: pull requests merged and opened, issues opened and closed, releases, and workflow runs by result (with the failing ones named).",
  params: { days: "how far back, default 7", branch: "only runs on this branch, optional" },
  returns:
    "{since, merged:[{number, title, author, at}], opened:[...], issuesOpened:[...], issuesClosed:[...], releases:[{tag, name, at}], runs:{total, byResult, failed:[{id, workflow, branch, title, at}]}}",
  example: 'await scripts.run("activity", { days: 7 })',
};

export default async function ({ gh }, { days = 7, branch }) {
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const row = (x, at) => ({ number: x.number, title: x.title, author: x.author?.login, at: (x[at] ?? "").slice(0, 10) });
  const [merged, opened, issuesOpened, issuesClosed, releases, runs] = await Promise.all([
    gh.list("pr", "list", ["number", "title", "author", "mergedAt"], "--state", "merged", "--search", `merged:>=${since}`, "-L", "100"),
    gh.list("pr", "list", ["number", "title", "author", "createdAt"], "--state", "all", "--search", `created:>=${since}`, "-L", "100"),
    gh.list("issue", "list", ["number", "title", "author", "createdAt"], "--state", "all", "--search", `created:>=${since}`, "-L", "100"),
    gh.list("issue", "list", ["number", "title", "author", "closedAt"], "--state", "closed", "--search", `closed:>=${since}`, "-L", "100"),
    gh.list("release", "list", ["tagName", "name", "publishedAt"], "-L", "20").catch(() => []),
    gh.list("run", "list", ["databaseId", "workflowName", "headBranch", "displayTitle", "conclusion", "status", "createdAt"], "--created", `>=${since}`, "-L", "200", ...(branch ? ["--branch", branch] : [])),
  ]);
  const byResult = {};
  for (const r of runs) byResult[r.conclusion || r.status] = (byResult[r.conclusion || r.status] ?? 0) + 1;
  return {
    since,
    merged: merged.map((x) => row(x, "mergedAt")),
    opened: opened.map((x) => row(x, "createdAt")),
    issuesOpened: issuesOpened.map((x) => row(x, "createdAt")),
    issuesClosed: issuesClosed.map((x) => row(x, "closedAt")),
    releases: releases.filter((r) => (r.publishedAt ?? "") >= since).map((r) => ({ tag: r.tagName, name: r.name, at: r.publishedAt?.slice(0, 10) })),
    runs: {
      total: runs.length,
      complete: runs.length < 200,
      byResult,
      failed: runs.filter((r) => r.conclusion === "failure").slice(0, 20).map((r) => ({ id: r.databaseId, workflow: r.workflowName, branch: r.headBranch, title: r.displayTitle, at: r.createdAt?.slice(0, 16) })),
    },
  };
}
