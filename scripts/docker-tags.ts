/**
 * Prints what `docker buildx build` needs for a release (.github/workflows/browser.yml), from scripts/dockerImage.ts:
 *
 *     bun scripts/docker-tags.ts tags <version> <repository ...>   the tags, one per line
 *     bun scripts/docker-tags.ts platforms                         linux/amd64,linux/arm64
 */
import { dockerPlatforms, dockerTags } from "./dockerImage";

const [command, version, ...repositories] = process.argv.slice(2);
if (command === "platforms") {
  console.log(dockerPlatforms());
} else if (command === "tags" && version && repositories.length > 0) {
  console.log(dockerTags(version, repositories).join("\n"));
} else {
  console.error("usage: bun scripts/docker-tags.ts tags <version> <repository ...> | platforms");
  process.exit(2);
}
