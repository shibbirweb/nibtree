import { describe, expect, it } from "vitest";
import { dockerArch, dockerPlatforms, dockerTags } from "./dockerImage";

describe("docker image", () => {
  it("builds from the Linux packages only, with Docker's names", () => {
    expect(dockerArch("@nibtree/linux-x64")).toBe("amd64");
    expect(dockerArch("@nibtree/linux-arm64")).toBe("arm64");
    expect(dockerArch("@nibtree/darwin-arm64")).toBeNull();
    expect(dockerArch("nibtree")).toBeNull();
    expect(dockerPlatforms()).toBe("linux/amd64,linux/arm64");
  });

  it("tags betas next and stable versions latest, in every repository", () => {
    expect(dockerTags("0.2.0-beta.1", ["ghcr.io/shibbirweb/nibtree"])).toEqual([
      "ghcr.io/shibbirweb/nibtree:0.2.0-beta.1",
      "ghcr.io/shibbirweb/nibtree:next",
    ]);
    expect(dockerTags("0.2.0", ["ghcr.io/shibbirweb/nibtree", "shibbirweb/nibtree"])).toEqual([
      "ghcr.io/shibbirweb/nibtree:0.2.0",
      "ghcr.io/shibbirweb/nibtree:latest",
      "shibbirweb/nibtree:0.2.0",
      "shibbirweb/nibtree:latest",
    ]);
  });
});
