// The clipboard in a browser tab is the browser's, not the server's: Apply Patch from Clipboard and Compare with
// Clipboard must read what the person copied, even when the server runs on another machine or in Docker.

export const NO_PAGE_CLIPBOARD =
  "This browser does not let the page read the clipboard here. Save the text to a file and open that instead.";

interface PageClipboard {
  readText?: () => Promise<string>;
}

/** The text on the browser's clipboard, rejected as an app error when the browser has no reading or says no. */
export async function readPageClipboard(clipboard: PageClipboard | undefined): Promise<string> {
  if (!clipboard?.readText) {
    throw { kind: "invalid", message: NO_PAGE_CLIPBOARD };
  }
  try {
    return await clipboard.readText();
  } catch {
    throw { kind: "invalid", message: NO_PAGE_CLIPBOARD };
  }
}
