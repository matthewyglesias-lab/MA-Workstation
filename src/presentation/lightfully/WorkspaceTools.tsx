import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ModalDialog } from "../ModalDialog";
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

function SearchGlyph() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>;
}

/** Shell-only actions. Never writes an encounter or bypasses its navigation guard. */
export function WorkspaceTools({ commands, onFocusInjection, focused = false }: {
  commands: WorkspaceCommand[];
  onFocusInjection?: () => void;
  focused?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [density, setDensity] = useState<Density>(readDensity);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    document.documentElement.dataset.lfDensity = density;
    try { localStorage.setItem(DENSITY_KEY, density); } catch { /* Cosmetic preference only. */ }
    return () => { delete document.documentElement.dataset.lfDensity; };
  }, [density]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "k") return;
      // A signing, conflict, or identity dialog always retains control.
      if (event.defaultPrevented || document.querySelector("dialog[open], .meditech-workstation-content.is-unsupported")) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  return <div class="lf-workspace-tools">
    <button ref={trigger} type="button" class="lf-command-trigger" aria-label="Search workspace commands" aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <SearchGlyph /><span>Commands</span><kbd>Ctrl K</kbd>
    </button>
    <button type="button" class="lf-density-toggle" aria-label="Compact workspace" aria-pressed={density === "compact"} title={density === "compact" ? "Use comfortable spacing" : "Use compact spacing"} onClick={() => setDensity(density === "compact" ? "comfortable" : "compact")}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="4" y="4" width="16" height="5" rx="1.5"/><rect x="4" y="14" width="16" height="5" rx="1.5"/></svg><span>Compact</span>
    </button>
    {onFocusInjection && <button type="button" class="lf-focus-trigger" aria-label={focused ? "Exit injection focus" : "Open focused injection workspace"} aria-pressed={focused} onClick={onFocusInjection}><DesktopIcon name="administer"/><span>{focused ? "Exit focus" : "Focus"}</span></button>}
    {open && <CommandPalette commands={commands} onDismiss={() => setOpen(false)} />}
  </div>;
}

function CommandPalette({ commands, onDismiss }: { commands: WorkspaceCommand[]; onDismiss: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => filterWorkspaceCommands(commands, query), [commands, query]);
  const selected = Math.min(active, Math.max(0, matches.length - 1));
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { document.getElementById(`lf-command-${selected}`)?.scrollIntoView({ block: "nearest" }); }, [selected]);
  const invoke = (command?: WorkspaceCommand) => {
    if (!command || command.disabled) return;
    onDismiss();
    // Let the dialog leave the top layer before opening another native dialog.
    requestAnimationFrame(() => command.onInvoke());
  };
  return <ModalDialog class="lf-command-dialog cd2004-print-exclude" labelledBy="lf-command-title" onDismiss={onDismiss}>
    <header><div><span class="lf-eyebrow">WORKSPACE</span><h2 id="lf-command-title">Find a tool</h2></div><button type="button" aria-label="Close command search" class="lf-icon-button" onClick={onDismiss}>×</button></header>
    <div class="lf-command-input"><SearchGlyph/><input ref={input} value={query} placeholder="Search injections, UDS, notes, forms…" aria-label="Search commands" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="lf-command-results" aria-activedescendant={matches.length ? `lf-command-${selected}` : undefined} onInput={(event) => { setQuery(event.currentTarget.value); setActive(0); }} onKeyDown={(event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive((value) => matches.length ? (value + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length : 0); }
      if (event.key === "Enter") { event.preventDefault(); invoke(matches[selected]); }
    }}/><kbd>Esc</kbd></div>
    <div id="lf-command-results" role="listbox" aria-label="Workspace destinations" class="lf-command-results">
      {matches.map((command, index) => <div key={command.id} id={`lf-command-${index}`} role="option" aria-selected={index === selected} aria-disabled={command.disabled || undefined} class={`lf-command-result${index === selected ? " is-active" : ""}${command.disabled ? " is-disabled" : ""}`} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => invoke(command)}>
        <span class="lf-command-icon"><DesktopIcon name={command.icon}/></span><span><strong>{command.label}</strong><small>{command.description}</small></span><span aria-hidden="true">↗</span>
      </div>)}
      {!matches.length && <p class="lf-command-empty" role="status">No matching tools. Try “notes,” “samples,” or “injection.”</p>}
    </div>
    <footer><span><kbd>↑</kbd> <kbd>↓</kbd> to move · <kbd>Enter</kbd> to open</span><span></span></footer>
  </ModalDialog>;
}

export function LightfullyMark({ small = false }: { small?: boolean }) {
  return <svg width={small ? 28 : 36} height={small ? 28 : 36} viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M8 31V21a12 12 0 0 1 24 0v10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M14 31V21a6 6 0 0 1 12 0v10M20 3v3M6 8l3 3M34 8l-3 3M3 21h3M34 21h3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="20" cy="27" r="2" fill="currentColor"/></svg>;
}
