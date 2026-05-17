#!/usr/bin/env node

import { readFileSync } from "node:fs";

const protectedBranchRef = "refs/heads/main";
const input = readFileSync(0, "utf8");

const pushesToMain = input
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .some((line) => {
    const [, , remoteRef] = line.split(/\s+/);
    return remoteRef === protectedBranchRef;
  });

if (!pushesToMain) {
  process.exit(0);
}

console.error("Direct pushes to main are not allowed.");
console.error("Create a feature branch and open a pull request instead.");

process.exit(1);
