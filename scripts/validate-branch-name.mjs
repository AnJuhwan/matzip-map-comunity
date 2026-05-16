#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const allowedPermanentBranches = new Set([
  "main",
  "master",
  "develop",
  "dev",
  "staging",
  "production",
]);

const branchPattern =
  /^(feat|fix|docs|chore|refactor|test|ci|build|perf|style|revert)\/(?:[0-9]+-)?[a-z0-9]+(?:-[a-z0-9]+)*$/;

const branchName = getBranchName();

if (!branchName) {
  console.log("Skipping branch name check: no current branch detected.");
  process.exit(0);
}

if (allowedPermanentBranches.has(branchName) || branchPattern.test(branchName)) {
  process.exit(0);
}

console.error(`Invalid branch name: ${branchName}`);
console.error("");
console.error("Use one of these formats:");
console.error("  feat/12-map-filter");
console.error("  fix/marker-click");
console.error("  docs/update-readme");
console.error("");
console.error("Allowed types:");
console.error("  feat, fix, docs, chore, refactor, test, ci, build, perf, style, revert");

process.exit(1);

function getBranchName() {
  const branchFromEnv = process.env.BRANCH_NAME?.trim();

  if (branchFromEnv) {
    return branchFromEnv;
  }

  try {
    return execFileSync("git", ["branch", "--show-current"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}
