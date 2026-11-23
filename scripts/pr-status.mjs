export const meta = {
  purpose:
    "Where a pull request stands: state, branch, mergeable and review decision, each check with its result, reviews, and the review threads still unresolved with their last comment. Without `pr`, the pull request of the current branch.",
  params: { repo: "owner/name, optional (default: the caller's repository)", pr: "pull request number, optional (default: the current branch's)" },
  returns:
    "{number, title, state, draft, author, base, head, mergeable, mergeState, reviewDecision, url, checks:{passed, failed:[{name, url}], pending:[name]}, reviews:[{author, state, at}], unresolved:[{path, line, author, last}], comments, updated}",
  example: 'await scripts.run("pr-status", { pr: 12 })',
};

export default async function ({ gh }, { repo, pr }) {
  if (repo) gh = gh.at(repo);
  const fields = ["number", "title", "state", "isDraft", "author", "baseRefName", "headRefName", "mergeable", "mergeStateStatus", "reviewDecision", "url", "statusCheckRollup", "reviews", "comments", "updatedAt"];
  const p = await gh.list("pr", "view", fields, ...(pr ? [String(pr)] : []));
  const checks = { passed: 0, failed: [], pending: [] };
  for (const c of p.statusCheckRollup ?? []) {
    const result = c.conclusion ?? c.state;
    if (["SUCCESS", "NEUTRAL", "SKIPPED"].includes(result)) checks.passed++;
    else if (!result || ["PENDING", "EXPECTED", "QUEUED", "IN_PROGRESS"].includes(result) || c.status === "IN_PROGRESS" || c.status === "QUEUED") checks.pending.push(c.name ?? c.context);
    else checks.failed.push({ name: c.name ?? c.context, result, url: c.detailsUrl ?? c.targetUrl });
  }
  // Review threads and whether each is resolved are only in GraphQL.
  let unresolved = [];
  const [owner, name] = (gh.repo ?? "").split("/");
  if (owner && name) {
    const q = `query($o:String!,$n:String!,$p:Int!){repository(owner:$o,name:$n){pullRequest(number:$p){reviewThreads(first:100){nodes{isResolved isOutdated path line comments(last:1){nodes{author{login} body}}}}}}}`;
    const r = await gh.graphql(q, { o: owner, n: name, p: p.number });
    unresolved = (r?.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [])
      .filter((t) => !t.isResolved)
      .map((t) => ({ path: t.path, line: t.line, outdated: t.isOutdated, author: t.comments.nodes[0]?.author?.login, last: t.comments.nodes[0]?.body?.replace(/\s+/g, " ").slice(0, 200) }));
  }
  return {
    number: p.number,
    title: p.title,
    state: p.state,
    draft: p.isDraft,
    author: p.author?.login,
    base: p.baseRefName,
    head: p.headRefName,
    mergeable: p.mergeable,
    mergeState: p.mergeStateStatus,
    reviewDecision: p.reviewDecision || null,
    url: p.url,
    checks,
    reviews: (p.reviews ?? []).map((r) => ({ author: r.author?.login, state: r.state, at: r.submittedAt })).slice(-10),
    unresolved,
    comments: (p.comments ?? []).length,
    updated: p.updatedAt,
  };
}
