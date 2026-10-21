import { describe, expect, it } from "vitest";
import { ownsStrayKey } from "./dialogFocus";

const element = (name: string) => ({ name }) as unknown as Element;

describe("ownsStrayKey", () => {
  const body = element("body");
  const conflicts = element("conflicts");
  const confirm = element("confirm");
  const field = element("field");

  it("takes a key when the focus fell to the page and the dialog is on top", () => {
    expect(ownsStrayKey(conflicts, body, body, [conflicts])).toBe(true);
    expect(ownsStrayKey(conflicts, null, body, [conflicts])).toBe(true);
  });

  it("leaves a key aimed at an element alone", () => {
    expect(ownsStrayKey(conflicts, field, body, [conflicts])).toBe(false);
  });

  it("leaves it to the dialog stacked above", () => {
    expect(ownsStrayKey(conflicts, body, body, [conflicts, confirm])).toBe(false);
    expect(ownsStrayKey(confirm, body, body, [conflicts, confirm])).toBe(true);
  });

  it("gives it to a popup that is not modal while no modal dialog is open", () => {
    const popup = element("navigation bar popup");
    expect(ownsStrayKey(popup, body, body, [])).toBe(true);
    expect(ownsStrayKey(popup, body, body, [confirm])).toBe(false);
    expect(ownsStrayKey(popup, field, body, [])).toBe(false);
  });
});
