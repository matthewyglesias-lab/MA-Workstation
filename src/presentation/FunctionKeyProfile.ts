/**
 * The Client/Server-style function-key contract shared by the desktop shell,
 * help surface, keyboard handler, and visible command deck.  Individual
 * workflows supply the behavior; this module intentionally owns only the
 * stable command vocabulary and its visual labels.
 */
export type FunctionKeyCommandId =
  | "help"
  | "next-section"
  | "previous-section"
  | "next-page"
  | "previous-page"
  | "focus-next-zone"
  | "lookup"
  | "local-emr"
  | "file"
  | "back";

export interface FunctionKeyCommand {
  id: FunctionKeyCommandId;
  keyLabel: string;
  label: string;
  description: string;
  /** Whether the primary binding belongs in the fixed desktop command deck. */
  showInDeck?: boolean;
}

/**
 * Primary keys are shown in the fixed deck. Shift variants remain first-class
 * profile entries so the physical keyboard, Help, and tests use the same
 * terminology without spending another deck slot on the alternate binding.
 */
export const FUNCTION_KEY_PROFILE: readonly FunctionKeyCommand[] = [
  {
    id: "help",
    keyLabel: "F1",
    label: "Help",
    description: "Open the workstation keyboard reference.",
    showInDeck: true,
  },
  {
    id: "next-section",
    keyLabel: "F6",
    label: "Next section",
    description: "Move to the next section in the current worksheet.",
    showInDeck: true,
  },
  {
    id: "previous-section",
    keyLabel: "Shift+F6",
    label: "Previous section",
    description: "Move to the previous section in the current worksheet.",
  },
  {
    id: "next-page",
    keyLabel: "F7",
    label: "Next page",
    description: "Move to the next page or tab in the current worksheet.",
    showInDeck: true,
  },
  {
    id: "previous-page",
    keyLabel: "Shift+F7",
    label: "Previous page",
    description: "Move to the previous page or tab in the current worksheet.",
  },
  {
    id: "focus-next-zone",
    keyLabel: "F8",
    label: "Next zone",
    description: "Cycle focus through worksheet, record rail, and command deck.",
    showInDeck: true,
  },
  {
    id: "lookup",
    keyLabel: "F9",
    label: "Lookup",
    description: "Open the contextual local lookup.",
    showInDeck: true,
  },
  {
    id: "local-emr",
    keyLabel: "F11",
    label: "Open Notes",
    description: "Open the local record list.",
    showInDeck: true,
  },
  {
    id: "file",
    keyLabel: "F12",
    label: "Save",
    description: "File the editable local draft.",
    showInDeck: true,
  },
  {
    id: "back",
    keyLabel: "Esc",
    label: "Back / close",
    description: "Dismiss the current utility or safely return to the prior context.",
    showInDeck: true,
  },
];

export type FunctionKeyCommandAction = {
  onInvoke?: () => void;
  disabled?: boolean;
  active?: boolean;
  /** A workflow-specific label only when the stable profile label is insufficient. */
  label?: string;
};

export type FunctionKeyActions = Partial<
  Record<FunctionKeyCommandId, FunctionKeyCommandAction>
>;

export const FUNCTION_KEY_DECK_PROFILE = FUNCTION_KEY_PROFILE.filter(
  (command) => command.showInDeck,
);

export function getFunctionKeyCommand(
  id: FunctionKeyCommandId,
): FunctionKeyCommand {
  const command = FUNCTION_KEY_PROFILE.find((item) => item.id === id);

  if (!command) {
    throw new Error(`Unknown function-key command: ${id}`);
  }

  return command;
}

/** Resolve the physical key event through the same profile used by Help and
 * the command deck. Browser event names use `Escape`; Client/Server labels it
 * `Esc`, so that one spelling difference belongs here rather than in every
 * command handler. */
export function resolveFunctionKeyCommand(
  key: string,
  shiftKey = false,
): FunctionKeyCommand | undefined {
  const normalized = key === "Escape" ? "esc" : key.toLocaleLowerCase();
  const chord = `${shiftKey ? "shift+" : ""}${normalized}`;
  return FUNCTION_KEY_PROFILE.find(
    (command) => command.keyLabel.toLocaleLowerCase() === chord,
  );
}
