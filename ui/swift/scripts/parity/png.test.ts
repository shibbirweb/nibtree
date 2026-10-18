import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodePng } from "./png";

function chunk(type: string, body: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "ascii");
  // The decoder does not check CRCs.
  return Buffer.concat([head, Buffer.from(body), Buffer.alloc(4)]);
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const [a, b, c] = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - upLeft)];
  return a <= b && a <= c ? left : b <= c ? up : upLeft;
}

/** A PNG of `rows` (each width * channels bytes), row y filtered with filters[y]. */
function encode(width: number, channels: 3 | 4, rows: number[][], filters: number[], depth = 8): Uint8Array {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(rows.length, 4);
  header.set([depth, channels === 4 ? 6 : 2, 0, 0, 0], 8);
  const lines = rows.map((row, y) => {
    const out = row.map((value, x) => {
      const left = x >= channels ? row[x - channels] : 0;
      const up = y > 0 ? rows[y - 1][x] : 0;
      const upLeft = y > 0 && x >= channels ? rows[y - 1][x - channels] : 0;
      const predicted = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, upLeft)][filters[y]];
      return (value - predicted) & 0xff;
    });
    return [filters[y], ...out];
  });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.from(lines.flat()))),
    chunk("IEND", new Uint8Array()),
  ]);
}

describe("decodePng", () => {
  const rows = [0, 1, 2, 3, 4].map((y) =>
    [0, 1, 2].flatMap((x) => [x * 80 + y, 200 - y * 30, (x * y * 37) % 256, 255 - x]),
  );

  it("undoes every row filter of an RGBA picture", () => {
    const picture = decodePng(encode(3, 4, rows, [0, 1, 2, 3, 4]));
    expect(picture.width).toBe(3);
    expect(picture.height).toBe(5);
    expect([...picture.data]).toEqual(rows.flat());
  });

  it("reads RGB as opaque RGBA", () => {
    const rgb = rows.map((row) => row.filter((_, index) => index % 4 !== 3));
    const picture = decodePng(encode(3, 3, rgb, [4, 3, 2, 1, 0]));
    expect([...picture.data]).toEqual(
      rgb.flatMap((row) => row.flatMap((value, index) => (index % 3 === 2 ? [value, 255] : [value]))),
    );
  });

  it("refuses what the parity pictures never are", () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3]))).toThrow("Not a PNG");
    expect(() => decodePng(encode(1, 4, [[1, 2, 3, 4]], [0], 16))).toThrow(/Unsupported/);
  });
});
