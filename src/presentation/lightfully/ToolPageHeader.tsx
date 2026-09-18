import type { ComponentChildren } from "preact";

/** A page heading for reference and closeout, not an encounter or new data source. */
export function ToolPageHeader({ title, children }: { title: string; children?: ComponentChildren }) {
  return <header class="lf-tool-page-header"><h1>{title}</h1>{children && <div class="lf-tool-page-actions">{children}</div>}</header>;
}
