/**
 * Lays out the Docker image's build context (docker/Dockerfile) from the npm platform packages, so the image runs
 * the very program and page CI packed and tested.
 *
 *     bun scripts/docker-context.ts --packages <folder> --out <folder>
 *
 * Every Linux tarball in --packages (from `bun scripts/npm-package.ts pack`) becomes `<out>/<arch>/`, with Docker's
 * architecture names (amd64, arm64): nibtree-browser and its page. The Dockerfile is copied in too.
 */
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dockerArch } from "./dockerImage";
import { tarballManifest, unpackPackage } from "./tarball";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const args = process.argv.slice(2);
const valueOf = (name: string): string => {
  const value = args[args.indexOf(name) + 1];
  if (!args.includes(name) || !value) {
    console.error(`${name} needs a value. Usage: bun scripts/docker-context.ts --packages <folder> --out <folder>`);
    process.exit(2);
  }
  return resolve(value);
};
const [packages, out] = [valueOf("--packages"), valueOf("--out")];

const found: string[] = [];
for (const file of readdirSync(packages).filter((name) => name.endsWith(".tgz"))) {
  const tarball = join(packages, file);
  const arch = dockerArch(tarballManifest(tarball).name);
  if (!arch) {
    continue;
  }
  const folder = join(out, arch);
  mkdirSync(folder, { recursive: true });
  unpackPackage(tarball, folder);
  found.push(arch);
}
if (found.length === 0) {
  console.error(`${packages} has no Linux package (@nibtree/linux-x64 or linux-arm64)`);
  process.exit(1);
}
copyFileSync(join(ROOT, "docker", "Dockerfile"), join(out, "Dockerfile"));
console.log(`docker context in ${out}: ${found.sort().join(", ")}`);
