/**
 * Reads an npm tarball (.tgz) without the `tar` program: on Windows CI, Git Bash's GNU tar takes `C:\...` for a
 * remote host. Knows what npm and `bun pm pack` write: ustar entries, with pax or GNU records for long names.
 */
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";

export interface TarEntry {
  /** The path inside the tarball, such as `package/bin/nibtree.mjs`. */
  path: string;
  mode: number;
  data: Uint8Array;
}

const BLOCK = 512;
const decoder = new TextDecoder();

function text(header: Uint8Array, start: number, length: number): string {
  const field = header.subarray(start, start + length);
  const end = field.indexOf(0);
  return decoder.decode(end >= 0 ? field.subarray(0, end) : field);
}

function octal(header: Uint8Array, start: number, length: number): number {
  return parseInt(text(header, start, length).trim() || "0", 8);
}

/** The `path` of a pax record set ("<length> path=<value>\n" lines). */
function paxPath(data: Uint8Array): string | null {
  for (const line of decoder.decode(data).split("\n")) {
    const match = /^\d+ path=(.*)$/.exec(line);
    if (match) {
      return match[1];
    }
  }
  return null;
}

/** Every regular file in a tar archive (already gunzipped). */
export function tarEntries(archive: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = [];
  let longPath: string | null = null;
  for (let offset = 0; offset + BLOCK <= archive.length;) {
    const header = archive.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) {
      break;
    }
    const size = octal(header, 124, 12);
    const type = String.fromCharCode(header[156] || 48);
    const data = archive.subarray(offset + BLOCK, offset + BLOCK + size);
    offset += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    if (type === "x") {
      longPath = paxPath(data) ?? longPath;
      continue;
    }
    if (type === "L") {
      longPath = text(data, 0, data.length);
      continue;
    }
    const prefix = text(header, 345, 155);
    const name = text(header, 0, 100);
    const path = longPath ?? (prefix ? `${prefix}/${name}` : name);
    longPath = null;
    if (type === "0" || type === "\0") {
      entries.push({ path, mode: octal(header, 100, 8), data });
    }
  }
  return entries;
}

export function readTarball(file: string): TarEntry[] {
  return tarEntries(gunzipSync(readFileSync(file)));
}

/** A package's package.json, read from its tarball. */
export function tarballManifest(file: string): { name: string; version: string; [key: string]: unknown } {
  const entry = readTarball(file).find((candidate) => candidate.path === "package/package.json");
  if (!entry) {
    throw new Error(`${file} has no package/package.json`);
  }
  return JSON.parse(decoder.decode(entry.data));
}

/** Unpacks a package's tarball into `folder`, without its leading `package/`, keeping executable bits. */
export function unpackPackage(file: string, folder: string): void {
  for (const entry of readTarball(file)) {
    const relative = entry.path.replace(/^[^/]+\//, "");
    if (relative.split("/").includes("..")) {
      throw new Error(`${file} has an entry outside its folder: ${entry.path}`);
    }
    const target = join(folder, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, entry.data);
    if (process.platform !== "win32") {
      chmodSync(target, entry.mode & 0o777 || 0o644);
    }
  }
}
