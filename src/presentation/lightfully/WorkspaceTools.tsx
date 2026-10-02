import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { createActionGate, nextEnabledCommand } from "./interaction-policy";
import { ActionShelf } from "./ActionShelf";
import { ModalDialog } from "../ModalDialog";
import { DialogHeading } from "./DialogHeading";
import { DesktopIcon } from "../DesktopIcon";
import type { DesktopIconName } from "../types";

export interface WorkspaceCommand {
  id: string;
  label: string;
  description: string;
  icon: DesktopIconName;
  keywords?: string;
  disabled?: boolean;
  onInvoke: () => void;
}

export function filterWorkspaceCommands(commands: WorkspaceCommand[], query: string) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return commands.filter((command) => {
    const haystack = `${command.label} ${command.description} ${command.keywords ?? ""}`.toLocaleLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

const DENSITY_KEY = "ipmg.lightfully.ui-density.v1";
type Density = "comfortable" | "compact";
function readDensity(): Density {
  try { return localStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "comfortable"; }
  catch { return "comfortable"; }
}

/** Shell-only actions. Never writes an encounter or bypasses its navigation guard. */
export function WorkspaceTools({ commands, onFocusInjection, focused = false, open, onOpen, onDismiss }: {
  open: boolean; onOpen: () => void; onDismiss: () => void;
  commands: WorkspaceCommand[];
  onFocusInjection?: () => void;
  focused?: boolean;
}) {
  const [density, setDensity] = useState<Density>(readDensity);

  useEffect(() => {
    document.documentElement.dataset.lfDensity = density;
    try { localStorage.setItem(DENSITY_KEY, density); } catch { /* Cosmetic preference only. */ }
    return () => { delete document.documentElement.dataset.lfDensity; };
  }, [density]);
  return <div class="lf-workspace-tools">
    <ActionShelf label="Workspace" heading="Workspace tools" description="Find a service, adjust spacing, or use the guided injection view." class="lf-workspace-shelf">
      <button type="button" class="lf-command-trigger" aria-label="Search workspace commands" aria-haspopup="dialog" onClick={onOpen}>
        <DesktopIcon name="search"/><span><strong>Find a tool</strong><small>Search services, records and more.</small></span><kbd>Ctrl K</kbd>
      </button>
      {commands.filter(command => ["reference", "log", "tms"].includes(command.id)).map(command =>
        <button key={command.id} type="button" class="cd2004-nav-item" title={command.id === "tms" ? "Future / TMS" : command.label} disabled={command.disabled} onClick={command.onInvoke}>
          <DesktopIcon name={command.icon}/><span><strong>{command.label}</strong><small>{command.description}</small></span><DesktopIcon name="arrow-right"/>
        </button>)}
      <button type="button" class="lf-density-toggle" data-shelf-stay-open aria-label="Compact workspace" aria-pressed={density === "compact"} onClick={() => setDensity(density === "compact" ? "comfortable" : "compact")}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="4" y="4" width="16" height="5" rx="1.5"/><rect x="4" y="14" width="16" height="5" rx="1.5"/></svg>
        <span><strong>Workspace spacing</strong><small>{density === "compact" ? "Compact spacing is on." : "Comfortable spacing is on."}</small></span><span class="lf-preference-state" aria-hidden="true">{density === "compact" ? "Compact" : "Roomier"}</span>
      </button>
      {onFocusInjection && <button type="button" class="lf-focus-trigger" aria-label={focused ? "Exit injection focus" : "Open focused injection workspace"} aria-pressed={focused} onClick={onFocusInjection}>
        <DesktopIcon name="administer"/><span><strong>{focused ? "Back to the full workspace" : "Guided injection view"}</strong><small>{focused ? "Leave the focused injection view." : "Open the existing guided injection view."}</small></span><DesktopIcon name="arrow-right"/>
      </button>}
    </ActionShelf>
    {open && <CommandPalette commands={commands} onDismiss={onDismiss} />}
  </div>;
}

function CommandPalette({ commands, onDismiss }: { commands: WorkspaceCommand[]; onDismiss: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const gate = useRef(createActionGate());
  const matches = useMemo(() => filterWorkspaceCommands(commands, query), [commands, query]);
  const selected = matches[active] && !matches[active].disabled ? active : nextEnabledCommand(matches, -1, 1);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { document.getElementById(`lf-command-${selected}`)?.scrollIntoView({ block: "nearest" }); }, [selected, query]);
  const invoke = (command?: WorkspaceCommand) => {
    if (!command || command.disabled || !gate.current.enter()) return;
    onDismiss();
    // Let the dialog leave the top layer before opening another native dialog.
    requestAnimationFrame(() => command.onInvoke());
  };
  return <ModalDialog class="lf-command-dialog cd2004-print-exclude" labelledBy="lf-command-title" onDismiss={onDismiss}>
    <DialogHeading id="lf-command-title" title="Find a tool" closeLabel="Close command search" onClose={onDismiss} />
    <div class="lf-command-input"><DesktopIcon name="search"/><input ref={input} value={query} placeholder="Search injections, UDS, notes, forms…" aria-label="Search commands" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="lf-command-results" aria-activedescendant={selected >= 0 ? `lf-command-${selected}` : undefined} onInput={(event) => { setQuery(event.currentTarget.value); setActive(0); }} onKeyDown={(event) => {
      if (event.isComposing) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault(); setActive(nextEnabledCommand(matches, selected, event.key === "ArrowDown" ? 1 : -1));
      }
      if (event.key === "Home" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); setActive(nextEnabledCommand(matches, -1, 1)); }
      if (event.key === "End" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); setActive(nextEnabledCommand(matches, matches.length, -1)); }
      if (event.key === "Enter") { event.preventDefault(); invoke(matches[selected]); }
    }}/><kbd>Esc</kbd></div>
    <div class="lf-command-results">
    <div id="lf-command-results" role="listbox" aria-label="Workspace destinations">
      {matches.map((command, index) => <div key={command.id} id={`lf-command-${index}`} role="option" aria-selected={index === selected} aria-disabled={command.disabled || undefined} class={`lf-command-result${index === selected ? " is-active" : ""}${command.disabled ? " is-disabled" : ""}`} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => { if (!command.disabled) setActive(index); }} onClick={() => invoke(command)}>
        <span class="lf-command-icon"><DesktopIcon name={command.icon}/></span><span><strong>{command.label}</strong><small>{command.description}</small></span><span class="lf-command-availability" aria-hidden="true">{command.disabled ? "Unavailable here" : <DesktopIcon name="arrow-right"/>}</span>
      </div>)}
    </div>
      {!matches.length && <div class="lf-command-empty" role="status"><p>No matching tools. Try “notes,” “samples,” or “injection.”</p><button type="button" class="lf-secondary-button" onClick={() => { setQuery(""); setActive(0); input.current?.focus(); }}>Show all tools</button></div>}
    </div>
    <footer><span><kbd>↑</kbd> <kbd>↓</kbd> to move · <kbd>Enter</kbd> to open</span><span></span></footer>
  </ModalDialog>;
}
