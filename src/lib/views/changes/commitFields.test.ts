import { describe, expect, it } from "vitest";
import { commitFieldFor, registerCommitField } from "./commitFields";

const field = (name: string) => ({ name }) as unknown as HTMLElement;

describe("commitFields", () => {
  it("finds the box of a repository, else the first one", () => {
    const web = field("web");
    const api = field("api");
    const forgetWeb = registerCommitField("/w/web", web);
    const forgetApi = registerCommitField("/w/api", api);
    expect(commitFieldFor("/w/api")).toBe(api);
    expect(commitFieldFor("/w/other")).toBe(web);
    expect(commitFieldFor()).toBe(web);
    forgetWeb();
    forgetApi();
    expect(commitFieldFor("/w/web")).toBeNull();
  });

  it("a box that was replaced is not forgotten by the old one", () => {
    const old = field("old");
    const replacement = field("new");
    const forgetOld = registerCommitField("/w/web", old);
    const forgetNew = registerCommitField("/w/web", replacement);
    forgetOld();
    expect(commitFieldFor("/w/web")).toBe(replacement);
    forgetNew();
  });
});
