import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeGh } from "../gh.mjs";
import ciFailure from "../scripts/ci-failure.mjs";
import prStatus from "../scripts/pr-status.mjs";
import find from "../scripts/find.mjs";
import activity from "../scripts/activity.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "watch-github-"));
const oldPath = process.env.PATH;
const logFile = path.join(tmp, "calls.jsonl");
try {
  fs.writeFileSync(path.join(tmp, "gh"), `#!${process.execPath}
import fs from "node:fs";
const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(logFile)}, JSON.stringify(a) + "\\n");
if (a[0] === "api") {
  if (a[1] === "graphql") console.log(JSON.stringify({data:{repository:{pullRequest:{reviewThreads:{nodes:[]}}}}}));
  else if (a[1].startsWith("search/")) console.log(JSON.stringify({total_count:0,items:[]}));
  else console.log(JSON.stringify({full_name:"ankh/watch"}));
} else if (a[1] === "list") console.log("[]");
else if (a.includes("--log-failed")) console.log("watch\\ttest\\t2026-01-01T00:00:00Z failed: WATCH-12");
else if (a[0] === "run") console.log(JSON.stringify({databaseId:12,workflowName:"watch",jobs:[{databaseId:1,name:"watch",conclusion:"failure",steps:[]}]}));
else console.log(JSON.stringify({number:12,statusCheckRollup:[],reviews:[],comments:[]}));
`, { mode: 0o755 });
  process.env.PATH = tmp + path.delimiter + oldPath;
  const gh = makeGh({ repo: null, cwd: tmp, push() {} });
  const scoped = gh.at("ankh/watch");
  assert.equal(gh.repo, null);
  assert.equal(scoped.repo, "ankh/watch");
  assert.throws(() => gh.at("--help"), /owner\/name/);
  assert.equal((await scoped.api("repos/{owner}/{repo}")).full_name, "ankh/watch");
  assert.match((await scoped.log(12, { failed: true })).text, /WATCH-12/);
  const failed = await ciFailure({ gh }, { repo: "ankh/watch", run: 12 });
  assert.deepEqual(failed.failedJobs[0].errors, ["failed: WATCH-12"]);
  assert.equal((await prStatus({ gh }, { repo: "ankh/watch", pr: 12 })).number, 12);
  assert.match((await find({ gh }, { repo: "ankh/watch", query: "lantern" })).query, /repo:ankh\/watch/);
  await assert.rejects(find({ gh }, { query: "lantern" }), /needs `repo/);
  await activity({ gh }, { repo: "ankh/watch" });
  const calls = fs.readFileSync(logFile, "utf8").trim().split("\n").map(JSON.parse);
  for (const args of calls.filter((a) => a[0] !== "api")) assert.deepEqual(args.slice(-2), ["-R", "ankh/watch"]);
  assert.ok(calls.some((a) => a[0] === "api" && a[1] === "repos/ankh/watch"));
  assert.ok(calls.some((a) => a.includes("o=ankh") && a.includes("n=watch")));
  await scoped.run("pr", "list", "-R", "ankh/guild");
  const last = JSON.parse(fs.readFileSync(logFile, "utf8").trim().split("\n").at(-1));
  assert.deepEqual(last, ["pr", "list", "-R", "ankh/guild"]);
  console.log("ok: named repositories work outside a checkout for all four scripts");
} finally {
  process.env.PATH = oldPath;
  fs.rmSync(tmp, { recursive: true, force: true });
}
