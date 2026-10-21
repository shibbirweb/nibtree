import { describe, expect, it, vi } from "vitest";
import {
  dialogKeyAction,
  dismissDialog,
  isLineField,
  runDialogKey,
  type DialogKey,
  type DialogKeyOptions,
} from "./dialogKeys";

function key(name: string, extra: Partial<DialogKey> = {}): DialogKey {
  return {
    key: name,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    defaultPrevented: false,
    ...extra,
  };
}

const FORM: DialogKeyOptions = { dismissible: true, canSubmit: true, enterSubmits: false, inLineField: true };

describe("dialogKeyAction", () => {
  it("closes on Escape only when dismissible", () => {
    expect(dialogKeyAction(key("Escape"), FORM)).toBe("close");
    expect(dialogKeyAction(key("Escape"), { ...FORM, dismissible: false })).toBeNull();
  });

  it("submits on Cmd+Enter or Ctrl+Enter anywhere", () => {
    expect(dialogKeyAction(key("Enter", { metaKey: true }), { ...FORM, inLineField: false })).toBe("submit");
    expect(dialogKeyAction(key("Enter", { ctrlKey: true }), FORM)).toBe("submit");
    expect(dialogKeyAction(key("Enter", { metaKey: true }), { ...FORM, canSubmit: false })).toBeNull();
  });

  it("submits on a plain Enter in a one-line field only with enterSubmits", () => {
    expect(dialogKeyAction(key("Enter"), FORM)).toBeNull();
    const prompt = { ...FORM, enterSubmits: true };
    expect(dialogKeyAction(key("Enter"), prompt)).toBe("submit");
    expect(dialogKeyAction(key("Enter"), { ...prompt, inLineField: false })).toBeNull();
    expect(dialogKeyAction(key("Enter", { shiftKey: true }), prompt)).toBeNull();
    expect(dialogKeyAction(key("Enter", { altKey: true }), prompt)).toBeNull();
  });

  it("leaves keys a field handled or an input method is still composing", () => {
    const prompt = { ...FORM, enterSubmits: true };
    expect(dialogKeyAction(key("Enter", { isComposing: true }), prompt)).toBeNull();
    expect(dialogKeyAction(key("Escape", { defaultPrevented: true }), prompt)).toBeNull();
  });
});

describe("isLineField", () => {
  it("is a text-like input, not a button, box or text area", () => {
    expect(isLineField({ tagName: "INPUT", type: "text" })).toBe(true);
    expect(isLineField({ tagName: "input", type: "password" })).toBe(true);
    expect(isLineField({ tagName: "input", type: "search" })).toBe(true);
    expect(isLineField({ tagName: "input", type: "checkbox" })).toBe(false);
    expect(isLineField({ tagName: "TEXTAREA", type: "textarea" })).toBe(false);
    expect(isLineField({ tagName: "BUTTON", type: "submit" })).toBe(false);
    expect(isLineField({ tagName: "DIV" })).toBe(false);
    expect(isLineField(null)).toBe(false);
  });
});

describe("runDialogKey", () => {
  function event(name: string) {
    return { ...key(name), target: null, preventDefault: vi.fn(), stopPropagation: vi.fn() };
  }

  it("keeps every key from the window only in an urgent dialog", () => {
    const urgent = event("a");
    runDialogKey(
      urgent as unknown as KeyboardEvent,
      { dismissible: true, enterSubmits: false, urgent: true },
      {
        close: vi.fn(),
      },
    );
    expect(urgent.stopPropagation).toHaveBeenCalled();
    const plain = event("a");
    runDialogKey(plain as unknown as KeyboardEvent, { dismissible: true, enterSubmits: false }, { close: vi.fn() });
    expect(plain.stopPropagation).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const close = vi.fn();
    const escape = event("Escape");
    runDialogKey(escape as unknown as KeyboardEvent, { dismissible: true, enterSubmits: false }, { close });
    expect(close).toHaveBeenCalled();
    expect(escape.preventDefault).toHaveBeenCalled();
  });
});

describe("dismissDialog", () => {
  it("hides the dialog after telling its owner", () => {
    const calls: string[] = [];
    dismissDialog(
      () => {
        calls.push("owner");
      },
      () => calls.push("hide"),
    );
    expect(calls).toEqual(["owner", "hide"]);
  });

  it("hides it without an owner, and when the owner answers true", () => {
    const hide = vi.fn();
    dismissDialog(undefined, hide);
    dismissDialog(() => true, hide);
    expect(hide).toHaveBeenCalledTimes(2);
  });

  it("keeps it open when the owner answers false (a form going back a step)", () => {
    const hide = vi.fn();
    dismissDialog(() => false, hide);
    expect(hide).not.toHaveBeenCalled();
  });
});
