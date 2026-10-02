import { afterEach, describe, expect, it, vi } from "vitest";

import {
  requestWorkstationDraftSave,
  WORKSTATION_DRAFT_SAVE_REQUEST,
  type WorkstationDraftSaveRequestDetail,
} from "../../src/presentation/workstation-events";

afterEach(() => vi.unstubAllGlobals());

describe("requestWorkstationDraftSave", () => {
  it("returns the synchronous persistence result supplied by the owner", () => {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    target.addEventListener(WORKSTATION_DRAFT_SAVE_REQUEST, (event) => {
      const detail = (event as CustomEvent<WorkstationDraftSaveRequestDetail>).detail;
      detail.handled = true;
      detail.saved = true;
    });

    expect(requestWorkstationDraftSave("uds")).toBe(true);
  });

  it("fails closed without a mounted owner or after a failed write", () => {
    const unhandled = new EventTarget();
    vi.stubGlobal("window", unhandled);
    expect(requestWorkstationDraftSave("uds")).toBe(false);

    const rejected = new EventTarget();
    vi.stubGlobal("window", rejected);
    rejected.addEventListener(WORKSTATION_DRAFT_SAVE_REQUEST, (event) => {
      const detail = (event as CustomEvent<WorkstationDraftSaveRequestDetail>).detail;
      detail.handled = true;
      detail.saved = false;
    });
    expect(requestWorkstationDraftSave("uds")).toBe(false);
  });
});
