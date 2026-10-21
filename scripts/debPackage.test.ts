import { describe, expect, it } from "vitest";
import { controlProblems, setControlVersion } from "./debPackage";

const control = `Package: nibtree
Version: 0.2.0-beta.1
Architecture: amd64
Installed-Size: 40960
Maintainer: MD. Shibbir Ahmed <shibbirweb@gmail.com>
Section: devel
Priority: optional
Homepage: https://github.com/shibbirweb/nibtree
Depends: git, libwebkit2gtk-4.1-0, libgtk-3-0
Description: Git GUI with a 3-way merge tool
 Nibtree is a fast Git client.
`;

describe("setControlVersion", () => {
  it("replaces only the Version field", () => {
    const changed = setControlVersion(control, "0.2.0~beta.1");
    expect(changed).toContain("Version: 0.2.0~beta.1\n");
    expect(changed?.replace("0.2.0~beta.1", "0.2.0-beta.1")).toBe(control);
    expect(setControlVersion("Package: nibtree\n", "0.2.0")).toBeNull();
  });
});

describe("controlProblems", () => {
  it("accepts a complete control file", () => {
    expect(controlProblems(setControlVersion(control, "0.2.0~beta.1") ?? "", "0.2.0~beta.1")).toEqual([]);
  });

  it("names every field apt would show wrong", () => {
    const bare = control
      .replace("MD. Shibbir Ahmed <shibbirweb@gmail.com>", "MD. Shibbir Ahmed")
      .replace(" Nibtree is a fast Git client.\n", " (none)\n")
      .replace("Homepage: https://github.com/shibbirweb/nibtree\n", "");
    expect(controlProblems(bare, "0.2.0~beta.1")).toEqual([
      "Version is 0.2.0-beta.1, expected 0.2.0~beta.1",
      "Maintainer needs a name and an email, like Name <name@example.com> (Cargo.toml authors)",
      "Description has no long text (bundle.longDescription in tauri.conf.json)",
      "Homepage is missing (Cargo.toml homepage)",
    ]);
  });
});
