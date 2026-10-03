import type {
  AvsBlock,
  AvsDataRow,
  InjectionAvsModel,
} from "../shared/workstation/domain/injection-avs-content.js";
import { DEFAULT_AVS_CHROME } from "../shared/workstation/domain/injection-avs-render.js";

const identityOrder = [
  "PATIENT",
  "DOB",
  "RECORD NO",
  "PROVIDER",
  "VISIT DATE",
  "GIVEN BY",
];
const statusLabel = (status: InjectionAvsModel["documentStatus"]) =>
  status === "PATIENT COPY"
    ? "Patient copy"
    : status === "CARE HANDOFF"
      ? "Care handoff"
      : status;
const orderedIdentity = (model: InjectionAvsModel) =>
  [...model.identity]
    .sort(
      (left, right) =>
        identityOrder.indexOf(left.label) - identityOrder.indexOf(right.label),
    )
    .filter((row) => row.value.trim());

function DataRows({ rows }: { rows: readonly AvsDataRow[] }) {
  return (
    <dl class="lightfully-avs-pairs">
      {rows.map((row, index) => (
        <div key={`${row.label}-${index}`}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function InstructionBlock({ block }: { block: AvsBlock }) {
  return (
    <section
      class={`lightfully-avs-section lightfully-avs-section-${block.kind}${block.emphasis ? " lightfully-avs-alert" : ""}`}
    >
      <h2>{block.heading}</h2>
      {Boolean(block.rows?.length) && <DataRows rows={block.rows!} />}
      {block.paragraphs
        ?.filter((line) => line.trim())
        .map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      {Boolean(block.items?.length) && (
        <ul>
          {block.items!.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Presentation of the original Workstation AVS model. Clinical copy stays in
 * its source model; the sheet changes typography, spacing and visual hierarchy.
 * Timeline and guidance have no fixed height or pagination caps.
 */
export function LightfullyInjectionAvs({
  model,
}: {
  model: InjectionAvsModel;
}) {
  const [title, ...descriptor] = model.documentTitle.split(" - ");
  const patientName =
    model.identity.find((row) => row.label === "PATIENT")?.value ?? "";
  const patientDob =
    model.identity.find((row) => row.label === "DOB")?.value ?? "";
  return (
    <article
      class={`lightfully-avs${model.documentStatus === "STAFF PREVIEW - NOT FINAL" ? " lightfully-avs-draft" : ""}`}
      lang="en"
      aria-label={model.documentTitle}
    >
      <header class="lightfully-avs-header">
        <div class="lightfully-avs-brand-row">
          <div class="lightfully-avs-brand">
            <svg
              class="lightfully-avs-emblem"
              viewBox="0 0 44 44"
              aria-hidden="true"
            >
              <path d="M22 6c8.8 0 16 7.2 16 16-8.8 0-16-7.2-16-16Z" />
              <path d="M38 22c0 8.8-7.2 16-16 16 0-8.8 7.2-16 16-16Z" />
              <path d="M22 38C13.2 38 6 30.8 6 22c8.8 0 16 7.2 16 16Z" />
              <path d="M6 22C6 13.2 13.2 6 22 6c0 8.8-7.2 16-16 16Z" />
            </svg>
            <div>
              <p class="lightfully-avs-facility">
                {DEFAULT_AVS_CHROME.facilityName}
              </p>
              <p class="lightfully-avs-unit">
                {DEFAULT_AVS_CHROME.facilityUnit}
              </p>
            </div>
          </div>
          <div class="lightfully-avs-clinic">
            <span>San Bernardino clinic</span>
            <strong>{DEFAULT_AVS_CHROME.clinicPhone}</strong>
          </div>
        </div>
        <div class="lightfully-avs-title-row">
          <h1>
            {title}
            {descriptor.length > 0 && <span>{descriptor.join(" - ")}</span>}
          </h1>
          <span class="lightfully-avs-status">
            {statusLabel(model.documentStatus)}
          </span>
        </div>
        {model.documentSubtitle && (
          <p class="lightfully-avs-subtitle">{model.documentSubtitle}</p>
        )}
        <section
          class="lightfully-avs-identity"
          aria-label="Patient and visit details"
        >
          <DataRows rows={orderedIdentity(model)} />
        </section>
      </header>

      {model.leadAlerts.map((block, index) => (
        <InstructionBlock key={`lead-${index}`} block={block} />
      ))}

      <section class="lightfully-avs-treatment">
        <h2>Your treatment today</h2>
        <ol class="lightfully-avs-timeline" aria-label="Treatment timeline">
          {model.timeline.map((step, index) => (
            <li
              class={`lightfully-avs-step lightfully-avs-step-${step.state}`}
              key={index}
            >
              <div class="lightfully-avs-when">
                <strong>{step.when || "—"}</strong>
                {step.whenNote && <span>{step.whenNote}</span>}
              </div>
              <div class="lightfully-avs-rail" aria-hidden="true">
                <i />
              </div>
              <div class="lightfully-avs-step-body">
                <h3>{step.title}</h3>
                {step.dateLong && (
                  <p class="lightfully-avs-date">{step.dateLong}</p>
                )}
                {step.state === "due" && model.nextDose.instruction && (
                  <p class="lightfully-avs-instruction">
                    {model.nextDose.instruction}
                  </p>
                )}
                {step.detail
                  .filter((line) => line.trim())
                  .map((line, detailIndex) => (
                    <p key={detailIndex}>{line}</p>
                  ))}
                {step.state === "given" && model.administrationNote && (
                  <p>{model.administrationNote}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {model.nextDose.contactLines.length > 0 && (
        <section class="lightfully-avs-contact">
          <h2>Plan your next visit</h2>
          <DataRows rows={model.nextDose.contactLines} />
        </section>
      )}

      <div class="lightfully-avs-guidance">
        {model.blocks
          .filter((block) => block.kind !== "emergency")
          .map((block, index) => (
            <InstructionBlock key={`guidance-${index}`} block={block} />
          ))}
      </div>
      {model.blocks
        .filter((block) => block.kind === "emergency")
        .map((block, index) => (
          <InstructionBlock key={`urgent-${index}`} block={block} />
        ))}
      <InstructionBlock block={model.emergency} />

      <footer class="lightfully-avs-footer">
        <span>
          {patientName} - DOB {patientDob}
        </span>
        <span>
          {DEFAULT_AVS_CHROME.formId} - {DEFAULT_AVS_CHROME.reportId}
        </span>
      </footer>
    </article>
  );
}

/** The same visible AVS content for clipboard and the accessible text view. */
export function lightfullyAvsText(model: InjectionAvsModel): string {
  const blockLines = (block: AvsBlock): string[] => [
    block.heading,
    ...(block.rows ?? []).map((row) => `${row.label}: ${row.value}`),
    ...(block.paragraphs ?? []).filter((line) => line.trim()),
    ...(block.items ?? []).map((line) => `• ${line}`),
  ];
  const patientName =
    model.identity.find((row) => row.label === "PATIENT")?.value ?? "";
  const patientDob =
    model.identity.find((row) => row.label === "DOB")?.value ?? "";
  return [
    DEFAULT_AVS_CHROME.facilityName,
    DEFAULT_AVS_CHROME.facilityUnit,
    "San Bernardino clinic",
    DEFAULT_AVS_CHROME.clinicPhone,
    "",
    model.documentTitle,
    statusLabel(model.documentStatus),
    ...(model.documentSubtitle ? [model.documentSubtitle] : []),
    ...orderedIdentity(model).map((row) => `${row.label}: ${row.value}`),
    ...model.leadAlerts.flatMap((block) => ["", ...blockLines(block)]),
    "",
    "Your treatment today",
    ...model.timeline.flatMap((step) => [
      "",
      [step.when || "—", step.whenNote].filter(Boolean).join(" · "),
      step.title,
      ...(step.dateLong ? [step.dateLong] : []),
      ...(step.state === "due" && model.nextDose.instruction
        ? [model.nextDose.instruction]
        : []),
      ...step.detail.filter((line) => line.trim()),
      ...(step.state === "given" && model.administrationNote
        ? [model.administrationNote]
        : []),
    ]),
    ...(model.nextDose.contactLines.length
      ? [
          "",
          "Plan your next visit",
          ...model.nextDose.contactLines.map(
            (row) => `${row.label}: ${row.value}`,
          ),
        ]
      : []),
    ...model.blocks.flatMap((block) => ["", ...blockLines(block)]),
    "",
    ...blockLines(model.emergency),
    "",
    `${patientName} - DOB ${patientDob}`,
    `${DEFAULT_AVS_CHROME.formId} - ${DEFAULT_AVS_CHROME.reportId}`,
  ].join("\n");
}
