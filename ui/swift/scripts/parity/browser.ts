// Picture work done in the WebKit page the parity tools already have open: drawing web | Swift | diff for a look at
// what differs (the pixels for compare.ts come from png.ts, without the page).
import type { Page } from "playwright";
import { CHANNEL_TOLERANCE } from "./compare";

/** web | Swift | the pixels that differ beyond the tolerance in magenta, as a base64 PNG. */
export async function sideBySidePng(page: Page, webPng: string, swiftPng: string): Promise<string> {
  return page.evaluate(
    async ([webData, swiftData, tolerance]) => {
      const load = async (data: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        return image;
      };
      const [a, b] = [await load(webData as string), await load(swiftData as string)];
      const width = Math.max(a.width, b.width);
      const height = Math.max(a.height, b.height);
      const canvas = document.createElement("canvas");
      canvas.width = width * 3;
      canvas.height = height;
      const context = canvas.getContext("2d") as CanvasRenderingContext2D;
      context.drawImage(a, 0, 0);
      context.drawImage(b, width, 0);
      const pa = context.getImageData(0, 0, width, height).data;
      const pb = context.getImageData(width, 0, width, height).data;
      context.drawImage(b, width * 2, 0);
      const out = context.getImageData(width * 2, 0, width, height);
      for (let index = 0; index < pa.length; index += 4) {
        const worst = Math.max(...[0, 1, 2, 3].map((channel) => Math.abs(pa[index + channel] - pb[index + channel])));
        if (worst > (tolerance as number)) {
          out.data.set([255, 0, 255, 255], index);
        }
      }
      context.putImageData(out, width * 2, 0);
      return canvas.toDataURL("image/png").split(",")[1];
    },
    [webPng, swiftPng, CHANNEL_TOLERANCE] as const,
  );
}
