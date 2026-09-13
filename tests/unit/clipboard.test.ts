import { afterEach, describe, expect, it, vi } from "vitest";

import { copyTextToClipboard } from "../../src/presentation/clipboard";

/**
 * The browser journey covers the copy commands against a real clipboard, but
 * only in a secure context where `navigator.clipboard` always exists. These
 * are the paths it cannot reach: the API missing, the API rejecting, and the
 * fallback itself failing. Each one used to be a button that did nothing.
 */

interface FakeTextarea {
  value: string;
  style: Record<string, string>;
  selected: boolean;
  removed: boolean;
  setAttribute: (name: string, value: string) => void;
  select: () => void;
  setSelectionRange: (start: number, end: number) => void;
  remove: () => void;
}

const install = (options: {
  writeText?: (text: string) => Promise<void>;
  execCommand?: () => boolean;
}) => {
  const created: FakeTextarea[] = [];
  const appended: FakeTextarea[] = [];
  const focused: string[] = [];
  const active = {
    id: "patient-name",
    focus: () => {
      focused.push("patient-name");
    },
  };

  const document = {
    activeElement: active,
    getSelection: () => null,
    createElement: () => {
      const textarea: FakeTextarea = {
        value: "",
        style: {},
        selected: false,
        removed: false,
        setAttribute: () => {},
        select: () => {
          textarea.selected = true;
        },
        setSelectionRange: () => {},
        remove: () => {
          textarea.removed = true;
        },
      };
      created.push(textarea);
      return textarea;
    },
    body: {
      append: (node: FakeTextarea) => {
        appended.push(node);
      },
    },
    execCommand: options.execCommand ?? (() => false),
  };

  const navigator = options.writeText
    ? { clipboard: { writeText: options.writeText } }
    : {};

  vi.stubGlobal("document", document);
  vi.stubGlobal("navigator", navigator);
  return { created, appended, focused };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("copyTextToClipboard", () => {
  it("reports empty rather than putting whitespace on the clipboard", async () => {
    const writeText = vi.fn(async () => {});
    install({ writeText });

    expect(await copyTextToClipboard("")).toBe("empty");
    expect(await copyTextToClipboard("   \n\t ")).toBe("empty");
    // An empty note must never clear what the operator already had copied.
    expect(writeText).not.toHaveBeenCalled();
  });

  it("uses the asynchronous clipboard when the browser allows it", async () => {
    const writeText = vi.fn(async () => {});
    const { appended } = install({ writeText });

    expect(await copyTextToClipboard("POC urine drug screen — routine.")).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("POC urine drug screen — routine.");
    // No need to disturb the page when the real API worked.
    expect(appended).toHaveLength(0);
  });

  it("falls back to a selection copy when the clipboard API rejects", async () => {
    // What a browser does when the document has lost focus, or the permission
    // is withheld: a rejected promise that used to be swallowed entirely.
    const writeText = vi.fn(async () => {
      throw new DOMException("Document is not focused", "NotAllowedError");
    });
    const { created, appended, focused } = install({
      writeText,
      execCommand: () => true,
    });

    expect(await copyTextToClipboard("Injection encounter.")).toBe("copied");
    expect(appended).toHaveLength(1);
    expect(created[0]?.value).toBe("Injection encounter.");
    expect(created[0]?.selected).toBe(true);
    // The scratch textarea never outlives the copy, and the caret goes back to
    // whatever the operator was typing in.
    expect(created[0]?.removed).toBe(true);
    expect(focused).toEqual(["patient-name"]);
  });

  it("falls back the same way when there is no clipboard API at all", async () => {
    const { appended } = install({ execCommand: () => true });

    expect(await copyTextToClipboard("Sample documentation.")).toBe("copied");
    expect(appended).toHaveLength(1);
  });

  it("says the copy was blocked rather than claiming success", async () => {
    const { created } = install({ execCommand: () => false });

    expect(await copyTextToClipboard("Forms handoff.")).toBe("blocked");
    // Still cleans up after itself on the way out.
    expect(created[0]?.removed).toBe(true);
  });

  it("reports blocked when the fallback throws", async () => {
    install({
      execCommand: () => {
        throw new Error("execCommand is not supported");
      },
    });

    expect(await copyTextToClipboard("Forms handoff.")).toBe("blocked");
  });
});
