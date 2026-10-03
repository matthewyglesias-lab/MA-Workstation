import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { InjectionEncounter } from "../shared/workstation/domain/injection.js";
import {
  buildInjectionPatientScreenDocument,
  canBuildInjectionPatientScreenDocument,
  type InjectionPatientScreenDocument,
  type PatientScreenLanguage,
} from "../shared/workstation/domain/injection-patient-screening.js";
import "./print.css";
import "./screening.css";

function SignatureLine({
  label,
  dateLabel,
}: {
  label: string;
  dateLabel: string;
}) {
  return (
    <div class="workstation-screening-signature">
      <div>
        <span class="workstation-screening-write-line" />
        <span>{label}</span>
      </div>
      <div>
        <span class="workstation-screening-write-line" />
        <span>{dateLabel}</span>
      </div>
    </div>
  );
}

export function WorkstationScreeningDocument({
  model,
}: {
  model: InjectionPatientScreenDocument;
}) {
  const { labels, metadata } = model;
  let questionNumber = 0;
  return (
    <article class="workstation-screening-sheet" lang={model.language}>
      <header class="workstation-screening-header">
        <p class="workstation-screening-brand">INLAND PSYCHIATRIC</p>
        <p class="workstation-screening-eyebrow">{labels.formLabel}</p>
        <h1>{labels.title}</h1>
        <p>{labels.subtitle}</p>
      </header>
      <section
        class="workstation-screening-identity"
        aria-label={labels.orderInformation}
      >
        <div>
          <span>{labels.patient}</span>
          <strong>{metadata.patientName}</strong>
        </div>
        <div>
          <span>{labels.dateOfBirth}</span>
          <strong>{metadata.patientDob}</strong>
        </div>
        <div>
          <span>{labels.date}</span>
          <strong>{metadata.administrationDate}</strong>
        </div>
        <div>
          <span>{labels.medication}</span>
          <strong>
            {metadata.medication} · {metadata.dose}
          </strong>
        </div>
        <div>
          <span>
            {labels.route} / {labels.schedule}
          </span>
          <strong>
            {metadata.route} / {metadata.interval}
          </strong>
        </div>
        <div>
          <span>{labels.phase}</span>
          <strong>{metadata.phase}</strong>
        </div>
      </section>
      <p class="workstation-screening-instructions">
        {labels.responseInstruction}
      </p>
      {model.sections.map((section) => (
        <section
          class="workstation-screening-section"
          key={section.id}
          data-section={section.id}
        >
          <h2>{section.title}</h2>
          {section.items.map((item) => {
            questionNumber += 1;
            return (
              <div
                class="workstation-screening-question"
                key={item.id}
                data-rule-id={item.id}
              >
                <span
                  class="workstation-screening-question-number"
                  aria-hidden="true"
                >
                  {String(questionNumber).padStart(2, "0")}
                </span>
                <div>
                  <p>{item.prompt}</p>
                  <div class="workstation-screening-answer-options">
                    {[labels.yes, labels.no, labels.notSure].map((label) => (
                      <span key={label}>
                        <span
                          class="workstation-screening-empty-box"
                          aria-hidden="true"
                        />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      ))}
      <p class="workstation-screening-staff-note">{labels.staffResponseNote}</p>
      <section class="workstation-screening-follow-up">
        <h2>{labels.followUp}</h2>
        <span class="workstation-screening-write-line" />
        <span class="workstation-screening-write-line" />
      </section>
      {model.showsConsent && (
        <section class="workstation-screening-consent">
          <h2>{labels.consentTitle}</h2>
          <p>{labels.consentBody}</p>
          <SignatureLine
            label={labels.patientSignature}
            dateLabel={labels.patientDate}
          />
          <SignatureLine
            label={labels.staffReviewer}
            dateLabel={labels.staffDate}
          />
        </section>
      )}
      <footer class="workstation-screening-footer">
        {model.source ? (
          <p>
            {labels.source}:{" "}
            <a href={model.source.url} target="_blank" rel="noreferrer">
              {model.source.title}
            </a>{" "}
            · {model.source.labelRevision}
          </p>
        ) : (
          <p>{labels.noProductSource}</p>
        )}
      </footer>
    </article>
  );
}

function stageScreeningForPrint(
  model: InjectionPatientScreenDocument,
): () => void {
  window.dispatchEvent(new Event("console:print-replaced"));
  const old = document.getElementById("console-print-document");
  if (old) {
    render(null, old);
    old.remove();
  }
  const node = document.createElement("section");
  node.id = "console-print-document";
  document.body.append(node);
  render(<WorkstationScreeningDocument model={model} />, node);
  let frame = 0;
  const clean = () => {
    cancelAnimationFrame(frame);
    render(null, node);
    node.remove();
    window.removeEventListener("afterprint", clean);
    window.removeEventListener("console:locked", clean);
    window.removeEventListener("console:print-replaced", clean);
  };
  window.addEventListener("afterprint", clean, { once: true });
  window.addEventListener("console:locked", clean, { once: true });
  window.addEventListener("console:print-replaced", clean, { once: true });
  frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => {
      if (!node.isConnected) return clean();
      try {
        window.print();
      } catch {
        clean();
      }
    });
  });
  return clean;
}

export function WorkstationPatientScreening({
  encounter,
}: {
  encounter: InjectionEncounter;
}) {
  const [language, setLanguage] = useState<PatientScreenLanguage>("en");
  const printCleanup = useRef<(() => void) | null>(null);
  // Navigating to another encounter, changing the form, or locking the console
  // must never leave a patient's previously staged paper form in the DOM.
  useEffect(
    () => () => {
      printCleanup.current?.();
      printCleanup.current = null;
    },
    [encounter, language],
  );
  const canBuild = canBuildInjectionPatientScreenDocument(encounter);
  const model = buildInjectionPatientScreenDocument(encounter, language);
  return (
    <section
      class="workstation-screening-panel"
      aria-label="Patient screening form"
    >
      <div class="workstation-screening-toolbar">
        <div>
          <h3>Patient screening</h3>
          <p>
            Product-specific questions for the patient to complete on paper.
          </p>
        </div>
        <label>
          Form language
          <select
            value={language}
            onChange={(event) =>
              setLanguage(event.currentTarget.value as PatientScreenLanguage)
            }
          >
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
        </label>
        <button
          type="button"
          class="button secondary"
          disabled={!canBuild}
          onClick={() => {
            printCleanup.current?.();
            printCleanup.current = stageScreeningForPrint(model);
          }}
        >
          Print patient screening
        </button>
      </div>
      {canBuild ? (
        <details class="workstation-screening-preview">
          <summary>
            Preview {language === "es" ? "Spanish" : "English"} form ·{" "}
            {model.metadata.medication} · {model.metadata.phase}
          </summary>
          <p class="workstation-screening-preview-note">
            Review the completed paper form with the patient, then document
            findings in the clinical assessment.
          </p>
          <div class="workstation-screening-preview-scroll">
            <WorkstationScreeningDocument model={model} />
          </div>
        </details>
      ) : (
        <p class="workstation-screening-preview-note">
          Select the medication and dose to prepare the patient form.
        </p>
      )}
    </section>
  );
}
