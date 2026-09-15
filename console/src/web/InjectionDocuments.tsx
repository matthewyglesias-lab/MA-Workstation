import { render } from "preact";
import { useState } from "preact/hooks";
import type { Lot, Patient, Product } from "../shared/contracts.js";
import type { InjectionCase } from "../shared/injections.js";
import {
  injectionAvs,
  injectionNote,
} from "../shared/injection-documentation.js";
import "./print.css";
function printText(text: string, title: string) {
  const old = document.getElementById("console-print-document");
  old?.remove();
  const node = document.createElement("section");
  node.id = "console-print-document";
  document.body.append(node);
  render(
    <>
      <header>
        <p>INLAND PSYCHIATRIC</p>
        <h1>{title}</h1>
      </header>
      <div class="print-lines">{text}</div>
      <footer>Inland Psychiatric Medical Group</footer>
    </>,
    node,
  );
  const clean = () => {
    render(null, node);
    node.remove();
    window.removeEventListener("afterprint", clean);
    window.removeEventListener("console:locked", clean);
  };
  window.addEventListener("afterprint", clean, { once: true });
  window.addEventListener("console:locked", clean, { once: true });
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}
export function InjectionDocuments({
  record,
  patient,
  product,
  lot,
  timezone,
}: {
  record: InjectionCase;
  patient: Patient;
  product: Product;
  lot?: Lot;
  timezone: string;
}) {
  const [message, setMessage] = useState("");
  const [language, setLanguage] = useState<"en" | "es">("en");
  const note = injectionNote(record, patient, product, lot, timezone);
  const avs = injectionAvs(record, patient, product, timezone, language);
  return (
    <section class="documents-section">
      <div class="section-heading">
        <h3>Documentation</h3>
        <span class="muted">Review, then file in Tebra</span>
      </div>
      <textarea
        class="note-preview"
        aria-label="Injection note"
        readOnly
        value={note}
      />
      <div class="document-actions">
        <button
          type="button"
          class="button secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(note);
              setMessage("Note copied.");
            } catch {
              setMessage("Select the note text above and copy it.");
            }
          }}
        >
          Copy note
        </button>
        <button
          type="button"
          class="button secondary"
          onClick={() => printText(note, "Injection record")}
        >
          Print note
        </button>
        <label class="avs-language">
          AVS{" "}
          <select
            aria-label="AVS language"
            value={language}
            onChange={(e) => setLanguage(e.currentTarget.value as "en" | "es")}
          >
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
        </label>
        <button
          type="button"
          class="button secondary"
          onClick={() =>
            printText(
              avs,
              language === "es" ? "Resumen de su visita" : "Visit summary",
            )
          }
        >
          Print AVS
        </button>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
