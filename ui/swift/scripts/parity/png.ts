// Reads the parity pictures' pixels without a browser: WebKit's screenshots and Core Graphics' PNGs are 8-bit RGB or
// RGBA, not interlaced, so the decoder only joins the IDAT chunks, inflates them and undoes each row's filter.
// Handing pixels from the WebKit page as a JSON array cost seconds per picture.
import { inflateSync } from "node:zlib";
import type { Picture } from "./compare";

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) {
    return left;
  }
  return toUp <= toUpLeft ? up : upLeft;
}

/** What a row's filter added to each byte: none, the byte to the left, above, their mean, or Paeth's pick. */
function predictor(filter: number, left: number, up: number, upLeft: number): number {
  switch (filter) {
    case 1:
      return left;
    case 2:
      return up;
    case 3:
      return Math.floor((left + up) / 2);
    case 4:
      return paeth(left, up, upLeft);
    default:
      return 0;
  }
}

/** The pixels of an 8-bit RGB or RGBA PNG, as RGBA. */
export function decodePng(file: Uint8Array): Picture {
  if (!SIGNATURE.every((byte, index) => file[index] === byte)) {
    throw new Error("Not a PNG");
  }
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  let width = 0;
  let height = 0;
  let channels = 0;
  const data: Uint8Array[] = [];
  for (let offset = 8; offset < file.length;) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...file.subarray(offset + 4, offset + 8));
    const body = file.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      const [depth, color, , , interlace] = body.subarray(8, 13);
      channels = color === 6 ? 4 : color === 2 ? 3 : 0;
      if (depth !== 8 || channels === 0 || interlace !== 0) {
        throw new Error(`Unsupported PNG: depth ${depth}, color type ${color}, interlace ${interlace}`);
      }
    } else if (type === "IDAT") {
      data.push(body);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? rows[row + x - channels] : 0;
      const up = y > 0 ? rows[row - stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? rows[row - stride + x - channels] : 0;
      const predicted = predictor(filter, left, up, upLeft);
      rows[row + x] = (line[x] + predicted) & 0xff;
    }
  }
  if (channels === 4) {
    return { width, height, data: new Uint8ClampedArray(rows.buffer) };
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgba.set(rows.subarray(pixel * 3, pixel * 3 + 3), pixel * 4);
    rgba[pixel * 4 + 3] = 255;
  }
  return { width, height, data: rgba };
}
