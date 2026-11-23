export const meta = {
  purpose:
    "Which pull requests and issues are about something: GitHub search over titles, bodies and comments in the repository, open and closed, newest first, with the lines that matched.",
  params: {
    repo: "owner/name, optional (default: the caller's repository)",
    query: "a few distinctive words, e.g. 'rate limit' (GitHub search syntax works too: label:bug, author:x)",
    kind: "'pr', 'issue' or both (default)",
    state: "'open', 'closed' or all (default)",
    max: "results, default 15",
  },
  returns: "{query, total, items:[{kind, number, title, state, author, updated, url, labels, match}]}",
  example: 'await scripts.run("find", { query: "rate limit" })',
};

export default async function ({ gh }, { repo, query, kind, state, max = 15 }) {
  if (repo) gh = gh.at(repo);
  if (!query) throw new Error("find needs `query`");
  if (!gh.repo) throw new Error("find needs `repo: owner/name` when the caller is outside a GitHub repository");
  const q = [`repo:${gh.repo}`, query, kind === "pr" ? "is:pr" : kind === "issue" ? "is:issue" : "", state ? `is:${state}` : ""].filter(Boolean).join(" ");
  const r = await gh.api(`search/issues?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=${Math.min(100, max)}`);
  const words = String(query).toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !w.includes(":"));
  const matchOf = (body) => {
    const line = String(body ?? "").split("\n").find((l) => words.some((w) => l.toLowerCase().includes(w)));
    return line ? line.trim().slice(0, 200) : null;
  };
  return {
    query: q,
    total: r.total_count,
    items: (r.items ?? []).slice(0, max).map((i) => ({
      kind: i.pull_request ? "pr" : "issue",
      number: i.number,
      title: i.title,
      state: i.pull_request?.merged_at ? "merged" : i.state,
      author: i.user?.login,
      updated: i.updated_at?.slice(0, 10),
      url: i.html_url,
      labels: (i.labels ?? []).map((l) => l.name),
      match: matchOf(i.body),
    })),
  };
}
