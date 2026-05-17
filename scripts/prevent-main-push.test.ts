import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const scriptPath = fileURLToPath(new URL("./prevent-main-push.mjs", import.meta.url));

describe("prevent-main-push", () => {
  it("rejects pushes that update origin main", () => {
    const result = runPrePushCheck(
      "refs/heads/main 1111111111111111111111111111111111111111 refs/heads/main 2222222222222222222222222222222222222222\n"
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Direct pushes to main are not allowed.");
  });

  it("allows pushes that update feature branches", () => {
    const result = runPrePushCheck(
      "refs/heads/feat/main-guard 1111111111111111111111111111111111111111 refs/heads/feat/main-guard 2222222222222222222222222222222222222222\n"
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });
});

function runPrePushCheck(input: string) {
  return spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    input,
  });
}
