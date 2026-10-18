/**
 * The Docker image's names (pure logic for scripts/docker-context.ts and .github/workflows/browser.yml).
 * The image is built from the Linux npm packages, so its architectures follow them.
 */
import { packageName, PLATFORMS } from "../npm/nibtree/lib/platforms.mjs";
import { distTag } from "./npmPackages";

/** Node's cpu names to Docker's. */
const DOCKER_ARCH: Record<string, string> = { x64: "amd64", arm64: "arm64" };

/** `@nibtree/linux-x64` -> `amd64`; null for a package that is not a Linux one. */
export function dockerArch(name: string): string | null {
  const platform = PLATFORMS.find((candidate) => packageName(candidate) === name);
  return platform?.os === "linux" ? (DOCKER_ARCH[platform.cpu] ?? null) : null;
}

/** `linux/amd64,linux/arm64`: every architecture the image is built for. */
export function dockerPlatforms(): string {
  return PLATFORMS.filter((platform) => platform.os === "linux")
    .map((platform) => `linux/${DOCKER_ARCH[platform.cpu]}`)
    .join(",");
}

/**
 * Every tag a release gets in each repository: the exact version, and the same moving tag as on npm (betas
 * `next`, stable versions `latest`), so `docker run <image>` gives the stable release.
 */
export function dockerTags(version: string, repositories: string[]): string[] {
  return repositories.flatMap((repository) => [`${repository}:${version}`, `${repository}:${distTag(version)}`]);
}
