import { describe, expect, it } from "vitest";
import { tarEntries } from "./tarball";

const encoder = new TextEncoder();

/** One tar header block plus its padded data. */
function entry(name: string, body: string, options: { type?: string; mode?: number; prefix?: string } = {}) {
  const data = encoder.encode(body);
  const header = new Uint8Array(512);
  header.set(encoder.encode(name).subarray(0, 100), 0);
  header.set(encoder.encode(`${(options.mode ?? 0o644).toString(8).padStart(7, "0")}\0`), 100);
  header.set(encoder.encode(`${data.length.toString(8).padStart(11, "0")}\0`), 124);
  header[156] = (options.type ?? "0").charCodeAt(0);
  header.set(encoder.encode(options.prefix ?? ""), 345);
  const padded = new Uint8Array(Math.ceil(data.length / 512) * 512);
  padded.set(data);
  return [header, padded];
}

function archive(...blocks: Uint8Array[][]): Uint8Array {
  const parts = [...blocks.flat(), new Uint8Array(1024)];
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

describe("tarball", () => {
  it("reads files with their modes", () => {
    const entries = tarEntries(
      archive(entry("package/package.json", '{"name":"x"}'), entry("package/bin/run", "#!", { mode: 0o755 })),
    );
    expect(entries.map((file) => [file.path, file.mode, new TextDecoder().decode(file.data)])).toEqual([
      ["package/package.json", 0o644, '{"name":"x"}'],
      ["package/bin/run", 0o755, "#!"],
    ]);
  });

  it("joins the ustar prefix and takes pax and GNU long names", () => {
    const long = `package/${"a".repeat(120)}.js`;
    const entries = tarEntries(
      archive(
        entry("file.css", "p", { prefix: "package/bin/page/_app" }),
        entry("PaxHeader", `${long.length + 12} path=${long}\n`, { type: "x" }),
        entry("cut-off-name", "pax"),
        entry("././@LongLink", `${long}2`, { type: "L" }),
        entry("cut-off-name", "gnu"),
      ),
    );
    expect(entries.map((file) => file.path)).toEqual(["package/bin/page/_app/file.css", long, `${long}2`]);
  });

  it("leaves out folders and links", () => {
    expect(tarEntries(archive(entry("package/bin", "", { type: "5" }), entry("package/l", "", { type: "2" })))).toEqual(
      [],
    );
  });
});
