import { describe, expect, it, vi } from "vitest";
import { filterWorkspaceCommands, type WorkspaceCommand } from "../../src/presentation/lightfully/WorkspaceTools";

const commands: WorkspaceCommand[] = [
  { id: "administer", label: "Injection", description: "Open the medication workspace", keywords: "LAI administration", icon: "administer", onInvoke: vi.fn() },
  { id: "uds", label: "UDS", description: "Urine drug screening", icon: "uds", onInvoke: vi.fn() },
  { id: "records", label: "Open saved notes", description: "Find a patient", icon: "records", disabled: true, onInvoke: vi.fn() },
];

describe("Lightfully command search", () => {
  it("keeps the original order and disabled destinations on an empty query", () => {
    expect(filterWorkspaceCommands(commands, "  ").map(c => c.id)).toEqual(["administer", "uds", "records"]);
    expect(filterWorkspaceCommands(commands, "")[2]?.disabled).toBe(true);
  });
  it("matches case-insensitive aliases, without making a clinical decision", () => {
    expect(filterWorkspaceCommands(commands, " LAI ").map(c => c.id)).toEqual(["administer"]);
  });
  it("matches every word across labels and descriptions", () => {
    expect(filterWorkspaceCommands(commands, "drug UDS").map(c => c.id)).toEqual(["uds"]);
    expect(filterWorkspaceCommands(commands, "patient notes").map(c => c.id)).toEqual(["records"]);
  });
  it("does not open a destination or mutate the command list during search", () => {
    const before = commands.slice();
    filterWorkspaceCommands(commands, "injection");
    expect(commands).toEqual(before);
    commands.forEach(c => expect(c.onInvoke).not.toHaveBeenCalled());
  });
  it("does not substitute an unrelated command when there is no match", () => {
    expect(filterWorkspaceCommands(commands, "no-such-command")).toEqual([]);
  });
});
