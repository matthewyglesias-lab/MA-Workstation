import { render, type ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Lot, Patient, Product } from "../shared/contracts.js";
import type { InjectionCase } from "../shared/injections.js";
import {
  buildInjectionAvs,
  documentText,
  type InjectionDocument,
} from "../shared/injection-documentation.js";
import {
  getWorkstationAvsModel,
  getWorkstationNote,
} from "../shared/workstation-documentation.js";
import { workstationStateForRecord } from "../shared/workstation-bridge.js";
import {
  LightfullyInjectionAvs,
  lightfullyAvsText,
} from "./LightfullyInjectionAvs.js";
import "./print.css";

function DocumentBody({ document: doc }: { document: InjectionDocument }) {
  return (
    <article class="encounter-document" lang={doc.language}>
      <header class="encounter-document-header">
        <p class="document-brand">INLAND PSYCHIATRIC</p>
        <h4>{doc.title}</h4>
        <div class="document-identity">
          {doc.identity.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </header>
      <div class="document-sections">
        {doc.sections.map((section, index) => (
          <section
            class={`document-section${section.emphasis ? " document-section-emphasis" : ""}`}
            key={`${section.heading}-${index}`}
          >
            <h5>{section.heading}</h5>
            {section.lines.map((line, lineIndex) => (
              <p key={lineIndex}>{line}</p>
            ))}
          </section>
        ))}
      </div>
      <footer class="encounter-document-footer">
        {doc.footer.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </footer>
    </article>
  );
}
function printDocument(content: ComponentChildren) {
  window.dispatchEvent(new Event("console:print-replaced"));
  const old = document.getElementById("console-print-document");
  if (old) {
    render(null, old);
    old.remove();
  }
  const node = document.createElement("section");
  node.id = "console-print-document";
  document.body.append(node);
  render(content, node);
  const clean = () => {
    render(null, node);
    node.remove();
    window.removeEventListener("afterprint", clean);
    window.removeEventListener("console:locked", clean);
    window.removeEventListener("console:print-replaced", clean);
  };
  window.addEventListener("afterprint", clean, { once: true });
  window.addEventListener("console:locked", clean, { once: true });
  window.addEventListener("console:print-replaced", clean, { once: true });
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (node.isConnected) window.print();
    }),
  );
  return clean;
}
export function InjectionDocuments({
  record,
  patient,
  product,
  timezone,
  cases = [],
}: {
  record: InjectionCase;
  patient: Patient;
  product: Product;
  lot?: Lot;
  timezone: string;
  cases?: InjectionCase[];
}) {
  const [message, setMessage] = useState("");
  const [language, setLanguage] = useState<"en" | "es">("en");
  const [view, setView] = useState<"note" | "avs">("note");
  const [plainText, setPlainText] = useState(false);
  const printCleanup = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => printCleanup.current?.(), [record.id]);
  const pairedId = workstationStateForRecord(record)?.pairedCaseId;
  const pairedCase = cases.find((candidate) => candidate.id === pairedId);
  const note = getWorkstationNote(
    record,
    patient,
    product,
    timezone,
    pairedCase,
  );
  const avs = getWorkstationAvsModel(
    record,
    patient,
    product,
    timezone,
    pairedCase,
  );
  const spanishAvs = buildInjectionAvs(
    record,
    patient,
    product,
    timezone,
    "es",
  );
  const text =
    view === "note"
      ? note.text
      : language === "en"
        ? lightfullyAvsText(avs)
        : documentText(spanishAvs);
  const content = () =>
    view === "note" ? (
      <article class="encounter-document" lang="en">
        <pre class="workstation-note">{note.text}</pre>
      </article>
    ) : language === "en" ? (
      <LightfullyInjectionAvs model={avs} />
    ) : (
      <DocumentBody document={spanishAvs} />
    );
  const finalized = Boolean(record.administration || record.disposition);
  const currentFiling = record.filings.some(
    (filing) => filing.amendmentCount === record.amendments.length,
  );
  return (
    <section class="documents-section">
      <div class="section-heading">
        <h3>Documentation</h3>
        <span class="muted">
          {currentFiling
            ? "Tebra filing recorded"
            : "Review, then file in Tebra"}
        </span>
      </div>
      <div class="document-toolbar">
        <div
          class="document-view-switch"
          role="group"
          aria-label="Document preview"
        >
          <button
            type="button"
            aria-pressed={view === "note"}
            onClick={() => {
              setView("note");
              setMessage("");
            }}
          >
            Tebra note
          </button>
          <button
            type="button"
            aria-pressed={view === "avs"}
            onClick={() => {
              setView("avs");
              setMessage("");
            }}
          >
            Patient AVS
          </button>
        </div>
        {view === "avs" && (
          <label class="avs-language">
            Language
            <select
              aria-label="AVS language"
              value={language}
              onChange={(e) =>
                setLanguage(e.currentTarget.value as "en" | "es")
              }
            >
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </label>
        )}
        <button
          type="button"
          class="document-text-toggle"
          aria-pressed={plainText}
          onClick={() => setPlainText(!plainText)}
        >
          {plainText ? "Formatted preview" : "Plain text"}
        </button>
      </div>
      {!finalized && (
        <p class="document-review-notice">
          Draft preview · Administration has not been recorded.
        </p>
      )}
      {record.amendments.length > 0 && (
        <p class="document-review-notice">
          An amendment is attached. Review it before copying or sharing this
          document.
        </p>
      )}
      {view === "avs" &&
        language === "es" &&
        (record.administration?.issueAction ||
          record.administration?.followUp?.instructions ||
          record.administration?.orderSnapshot.clinicalContext?.linkedPlan ||
          record.administration?.reviewSnapshot.assessment
            ?.providerCommunication?.instructions ||
          record.disposition?.reviewSnapshot?.assessment?.providerCommunication
            ?.instructions ||
          record.disposition?.reason) && (
          <p class="document-review-notice">
            Patient instructions entered by staff are preserved in their
            original language. Review them with the patient.
          </p>
        )}
      {view === "avs" && language === "es" && (
        <p class="document-review-notice">
          Spanish visit summary. Its format and content differ from the original
          Workstation English AVS.
        </p>
      )}
      {view === "note" && (
        <div
          class="document-field-actions"
          role="group"
          aria-label="Copy individual Tebra fields"
        >
          {(
            [
              ["CC", note.cc],
              ["Assessment", note.assessment],
              ["Plan", note.plan],
            ] as const
          ).map(([label, value]) => (
            <button
              type="button"
              key={label}
              disabled={!value}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(value);
                  setMessage(
                    `${label} copied. Record filing after saving the complete note in Tebra.`,
                  );
                } catch {
                  setPlainText(true);
                  setMessage("Select the document text above and copy it.");
                }
              }}
            >
              Copy {label}
            </button>
          ))}
        </div>
      )}
      {plainText ? (
        <textarea
          class="note-preview"
          aria-label={
            view === "note" ? "Injection note" : "Patient visit summary"
          }
          readOnly
          value={text}
        />
      ) : (
        <div
          class="document-preview"
          aria-label={
            view === "note"
              ? "Injection note preview"
              : "Patient visit summary preview"
          }
        >
          {content()}
        </div>
      )}
      <div class="document-actions">
        <button
          type="button"
          class="button secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setMessage(
                view === "note"
                  ? "Note copied. Record filing after saving it in Tebra."
                  : "AVS copied.",
              );
            } catch {
              setPlainText(true);
              setMessage("Select the document text above and copy it.");
            }
          }}
        >
          {view === "note" ? "Copy note" : "Copy AVS"}
        </button>
        <button
          type="button"
          class="button secondary"
          onClick={() => {
            printCleanup.current?.();
            printCleanup.current = printDocument(content());
          }}
        >
          {view === "note" ? "Print note" : "Print AVS"}
        </button>
        <span class="document-filing-hint">
          Copying or printing does not record Tebra filing.
        </span>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
