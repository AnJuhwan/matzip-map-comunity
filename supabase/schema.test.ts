import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

describe("Supabase RLS policies", () => {
  it("prevents owners from updating moderated places back to public", () => {
    const policy = compact(policySql("Owners can update their places"));

    expect(policy).toContain("using (owner_id = auth.uid() and status = 'public')");
    expect(policy).toContain(
      "with check (owner_id = auth.uid() and status in ('public', 'deleted'))"
    );
  });

  it("prevents owners from updating moderated reviews back to public", () => {
    const policy = compact(policySql("Owners can update their reviews"));

    expect(policy).toContain("using (owner_id = auth.uid()");
    expect(policy).toContain("status = 'public'");
    expect(policy).toContain("with check (owner_id = auth.uid()");
    expect(policy).toContain("status in ('public', 'deleted')");
    expect(policy).toContain("exists (select 1 from public.places p");
  });

  it("only exposes public reviews for public places", () => {
    const policy = compact(policySql("Public reviews are readable"));

    expect(policy).toContain("using (");
    expect(policy).toContain("status = 'public'");
    expect(policy).toContain("exists (select 1 from public.places p");
    expect(policy).toContain("p.id = reviews.place_id");
    expect(policy).toContain("p.status = 'public'");
  });

  it("only allows reviews to be created for public places", () => {
    const policy = compact(policySql("Anonymous users can create reviews"));

    expect(policy).toContain("with check (");
    expect(policy).toContain("owner_id = auth.uid()");
    expect(policy).toContain("exists (select 1 from public.places p");
    expect(policy).toContain("p.id = reviews.place_id");
    expect(policy).toContain("p.status = 'public'");
  });
});

describe("Supabase Storage bucket restrictions", () => {
  it("limits public photo uploads to supported image MIME types and 5MB", () => {
    const compactSchema = compact(schema);

    expect(compactSchema).toContain("file_size_limit");
    expect(compactSchema).toContain("5242880");
    expect(compactSchema).toContain("allowed_mime_types");
    expect(compactSchema).toContain("image/jpeg");
    expect(compactSchema).toContain("image/png");
    expect(compactSchema).toContain("image/webp");
    expect(compactSchema).toContain("image/gif");
  });
});

function policySql(name: string) {
  const match = schema.match(new RegExp(`create policy "${escapeRegExp(name)}"[\\s\\S]*?;`));

  if (!match) {
    throw new Error(`Missing policy: ${name}`);
  }

  return match[0];
}

function compact(value: string) {
  return value.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
