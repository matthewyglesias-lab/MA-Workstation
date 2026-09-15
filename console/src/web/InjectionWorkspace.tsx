import { useState } from "preact/hooks";
import type { Actor, Overview } from "../shared/contracts.js";
import type { InjectionCase } from "../shared/injections.js";
import { Badge, Icon, dateLabel } from "./components.js";
import { InjectionDialog, type InjectionAction } from "./InjectionDialog.js";
import { InjectionDocuments } from "./InjectionDocuments.js";

export const statusLabel = {
  draft: "Needs review",
  reviewed: "Ready to administer",
  administered: "Administered",
  held: "On hold",
  cancelled: "Cancelled",
};
import { clinicDay, momentLabel } from "./injection-time.js";
export function injectionStatus(record: InjectionCase) {
  return record.administration?.delivery === "partial"
    ? "Partial dose"
    : record.administration?.delivery === "not_delivered"
      ? "Not delivered"
      : statusLabel[record.status];
}
const timingLabels = {
  scheduled: "Scheduled dose",
  initiation: "Initiation",
  late_or_missed: "Late / missed dose",
  unknown: "Timing unconfirmed",
};

export function InjectionWorkspace({
  data,
  records,
  actor,
  timezone,
  patientId,
  onRefresh,
  onLinkPatient,
}: {
  data: Overview;
  records: InjectionCase[];
  actor: Actor;
  timezone: string;
  patientId?: string;
  onRefresh: () => Promise<void>;
  onLinkPatient: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string>();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(patientId ? "all" : "active");
  const [action, setAction] = useState<InjectionAction>();
  const [notice, setNotice] = useState("");
  const [latestSaved, setLatestSaved] = useState<InjectionCase>();
  const canOperate = actor.roles.includes("Console.Operator");
  const today = clinicDay(timezone);
  const scoped = records.filter((r) => !patientId || r.patientId === patientId);
  const serverRecord = scoped.find((r) => r.id === selectedId);
  const record =
    latestSaved &&
    latestSaved.id === selectedId &&
    (!serverRecord || latestSaved.version >= serverRecord.version)
      ? latestSaved
      : serverRecord;
  const patient = (id: string) => data.patients.find((p) => p.id === id);
  const product = (id: string) => data.products.find((p) => p.id === id);
  const awaiting = scoped.filter(
    (r) =>
      ["administered", "held", "cancelled"].includes(r.status) &&
      r.handoff !== "filed",
  ).length;
  const ready = scoped.filter(
    (r) => r.status === "reviewed" && r.plannedOn === today,
  ).length;
  const active = scoped.filter((r) =>
    ["draft", "reviewed", "held"].includes(r.status),
  ).length;
  const shown = scoped
    .filter(
      (r) =>
        (filter === "all" ||
          (filter === "active"
            ? ["draft", "reviewed", "held"].includes(r.status)
            : filter === "handoff"
              ? ["administered", "held", "cancelled"].includes(r.status) &&
                r.handoff !== "filed"
              : filter === "ready"
                ? r.status === "reviewed" && r.plannedOn === today
                : r.plannedOn === today)) &&
        `${patient(r.patientId)?.displayName} ${patient(r.patientId)?.tebraId} ${product(r.productId)?.name}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        a.plannedOn.localeCompare(b.plannedOn) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  const selectedPatient = record && patient(record.patientId);
  const selectedProduct = record && product(record.productId);
  const lot = record?.review
    ? data.lots.find((l) => l.id === record.review!.lotId)
    : undefined;
  const frozenPatient =
    record?.administration?.reviewSnapshot.patientSnapshot ||
    record?.review?.patientSnapshot ||
    selectedPatient;
  const frozenProduct =
    record?.administration?.reviewSnapshot.productSnapshot ||
    record?.review?.productSnapshot ||
    selectedProduct;
  const editable =
    record && ["draft", "reviewed", "held"].includes(record.status);
  return (
    <div class="injection-workspace">
      {!record ? (
        <>
          <div class="page-heading">
            <div>
              {!patientId && <p class="eyebrow">CLINIC CONSOLE</p>}
              <h1>{patientId ? "Injection history" : "Injections"}</h1>
            </div>
            {canOperate && (
              <button class="button coral" onClick={() => setAction("create")}>
                <Icon name="plus" size={17} />
                New injection
              </button>
            )}
          </div>
          {!patientId && (
            <div class="queue-summary">
              <button
                class={filter === "active" ? "selected" : ""}
                onClick={() => setFilter("active")}
              >
                <strong>{active}</strong>
                <span>In progress</span>
              </button>
              <button
                class={filter === "ready" ? "selected" : ""}
                onClick={() => setFilter("ready")}
              >
                <strong>{ready}</strong>
                <span>Ready</span>
              </button>
              <button
                class={filter === "handoff" ? "selected" : ""}
                onClick={() => setFilter("handoff")}
              >
                <strong>{awaiting}</strong>
                <span>To file in Tebra</span>
              </button>
              <span class="queue-summary-note">{dateLabel(today)}</span>
            </div>
          )}
          <section class="panel queue-panel">
            <div class="section-heading">
              <div class="segmented" aria-label="Injection filters">
                {[
                  ["active", "Active"],
                  ["today", "Today"],
                  ["ready", "Ready"],
                  ["handoff", "To file"],
                  ["all", "All"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    class={filter === value ? "active" : ""}
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value!)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div class="search">
                <Icon name="search" size={17} />
                <input
                  aria-label="Search injections"
                  placeholder="Patient, chart ID, or medication"
                  value={search}
                  onInput={(e) => setSearch(e.currentTarget.value)}
                />
              </div>
            </div>
            <div class="table-wrap">
              <table class="injection-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Medication / order</th>
                    <th>Planned</th>
                    <th>Status</th>
                    <th>Tebra</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <button
                          class="patient-link"
                          onClick={() => {
                            setSelectedId(r.id);
                            setNotice("");
                          }}
                        >
                          {patient(r.patientId)?.displayName ||
                            "Linked patient"}
                        </button>
                        <small>
                          {patient(r.patientId)
                            ? `DOB ${dateLabel(patient(r.patientId)!.dob)} · #${patient(r.patientId)!.tebraId}`
                            : ""}
                        </small>
                      </td>
                      <td>
                        <strong>{product(r.productId)?.name}</strong>
                        <small>
                          {r.dose} {r.doseUnit} · {r.route}
                        </small>
                      </td>
                      <td>
                        {dateLabel(r.plannedOn)}
                        {r.plannedOn < today &&
                          ["draft", "reviewed"].includes(r.status) && (
                            <small class="danger-text">Review date</small>
                          )}
                      </td>
                      <td>
                        <Badge
                          tone={
                            r.status === "reviewed"
                              ? "teal"
                              : r.status === "administered"
                                ? "sage"
                                : r.status === "held"
                                  ? "butter"
                                  : ""
                          }
                        >
                          {injectionStatus(r)}
                        </Badge>
                      </td>
                      <td>
                        <span
                          class={
                            r.handoff === "filed" ? "success-text" : "muted"
                          }
                        >
                          {r.handoff === "filed"
                            ? "Filed"
                            : ["administered", "held", "cancelled"].includes(
                                  r.status,
                                )
                              ? "To file"
                              : "—"}
                        </span>
                      </td>
                      <td>
                        <button
                          class="button secondary small"
                          onClick={() => {
                            setSelectedId(r.id);
                            setNotice("");
                          }}
                        >
                          Open
                          <Icon name="arrow" size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!shown.length && (
                <div class="empty-state">
                  <Icon name="Injections" size={28} />
                  <h3>
                    {search
                      ? "No matching injections"
                      : "No injections in this view"}
                  </h3>
                  <p>
                    {!data.patients.length
                      ? "Link a patient to start."
                      : "Add an injection from the current Tebra order."}
                  </p>
                  {canOperate && (
                    <button
                      class="button secondary"
                      onClick={() =>
                        data.patients.length
                          ? setAction("create")
                          : onLinkPatient()
                      }
                    >
                      {data.patients.length ? "New injection" : "Link patient"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
        </>
      ) : (
        <>
          <div class="detail-toolbar">
            <button
              class="text-button"
              onClick={() => {
                setSelectedId(undefined);
                setNotice("");
              }}
            >
              ← All injections
            </button>
            {patientId && <Badge>{injectionStatus(record)}</Badge>}
            <span class="muted">
              Updated {momentLabel(record.updatedAt, timezone)}
            </span>
          </div>
          {!patientId && (
            <section class="case-patient-banner">
              <div class="avatar">{frozenPatient?.displayName.slice(0, 1)}</div>
              <div class="patient-identity">
                <h1>{frozenPatient?.displayName}</h1>
                <p>
                  DOB {frozenPatient && dateLabel(frozenPatient.dob)}
                  <span>·</span>Tebra #{frozenPatient?.tebraId}
                </p>
              </div>
              <div class="case-patient-status">
                <Badge
                  tone={
                    record.status === "reviewed"
                      ? "teal"
                      : record.status === "administered"
                        ? "sage"
                        : record.status === "held"
                          ? "butter"
                          : ""
                  }
                >
                  {injectionStatus(record)}
                </Badge>
                <small>{dateLabel(record.plannedOn)}</small>
              </div>
            </section>
          )}
          <div class="case-progress" aria-label="Injection progress">
            {["Order", "Safety review", "Administration", "Tebra filing"].map(
              (label, index) => {
                const complete =
                  index === 0 ||
                  (index === 1 && !!(record.review || record.administration)) ||
                  (index === 2 && !!record.administration) ||
                  (index === 3 && record.handoff === "filed");
                const nextIndex =
                  record.status === "cancelled"
                    ? 3
                    : record.status === "draft" || record.status === "held"
                      ? 1
                      : record.status === "reviewed"
                        ? 2
                        : 3;
                const current = index === nextIndex && !complete;
                return (
                  <div
                    key={label}
                    class={`${complete ? "complete" : ""} ${current ? "current" : ""}`}
                    aria-current={current ? "step" : undefined}
                  >
                    <span>
                      {complete ? <Icon name="check" size={13} /> : index + 1}
                    </span>
                    {label}
                  </div>
                );
              },
            )}
          </div>
          {notice && (
            <div class="notice" role="status">
              {notice}
            </div>
          )}
          {record.disposition && (
            <div class="clinical-callout">
              <strong>
                {record.disposition.status === "held" ? "On hold" : "Cancelled"}
              </strong>
              <p>{record.disposition.reason}</p>
              <small>{momentLabel(record.disposition.at, timezone)}</small>
            </div>
          )}
          {record.status === "reviewed" && record.plannedOn !== today && (
            <div class="error" role="alert">
              This review is from another clinic date. Update the order and
              repeat the safety review before administration.
            </div>
          )}
          <div class="case-layout">
            <div class="case-main">
              <section class="panel">
                <div class="section-heading">
                  <h2>Order</h2>
                  {canOperate && editable && (
                    <button
                      class="text-button"
                      onClick={() => setAction("edit")}
                    >
                      {record.status === "held"
                        ? "Resume & review order"
                        : "Edit order"}
                    </button>
                  )}
                </div>
                <div class="order-drug">
                  <h2>{frozenProduct?.name}</h2>
                  <p>{frozenProduct?.strength}</p>
                  <strong>
                    {record.dose} {record.doseUnit}
                    <span>·</span>
                    {record.route}
                    <span>·</span>
                    {record.site}
                  </strong>
                </div>
                <dl class="clinical-facts">
                  <div>
                    <dt>Ordering provider</dt>
                    <dd>{record.orderingProvider}</dd>
                  </div>
                  <div>
                    <dt>Tebra order</dt>
                    <dd>{record.tebraOrderReference}</dd>
                  </div>
                  <div>
                    <dt>Planned date</dt>
                    <dd>{dateLabel(record.plannedOn)}</dd>
                  </div>
                  <div>
                    <dt>Last administered</dt>
                    <dd>
                      {record.lastAdministrationAt
                        ? momentLabel(record.lastAdministrationAt, timezone)
                        : record.lastAdministrationOn
                          ? dateLabel(record.lastAdministrationOn)
                          : "Not recorded"}
                    </dd>
                  </div>
                  <div>
                    <dt>Timing</dt>
                    <dd>{timingLabels[record.timingCategory]}</dd>
                  </div>
                  <div>
                    <dt>Next due per order</dt>
                    <dd>
                      {record.nextDueOn
                        ? dateLabel(record.nextDueOn)
                        : "Not confirmed"}
                    </dd>
                  </div>
                </dl>
                <div class="detail-note">
                  <span>Provider timing plan</span>
                  <p>{record.timingPlan}</p>
                </div>
              </section>
              <section class="panel">
                <div class="section-heading">
                  <h2>Safety review</h2>
                  {record.review && <Badge tone="sage">Reviewed</Badge>}
                </div>
                {record.review ? (
                  <>
                    <div class="review-checks">
                      {[
                        "Two identifiers",
                        "Current order",
                        "Allergies",
                        "Medication & stock",
                        "Timing plan",
                        "Consent",
                      ].map((c) => (
                        <span key={c}>
                          <Icon name="check" size={14} />
                          {c}
                        </span>
                      ))}
                    </div>
                    <dl class="clinical-facts">
                      <div>
                        <dt>Allergy review</dt>
                        <dd>{record.review.allergyReview}</dd>
                      </div>
                      <div>
                        <dt>Observation plan</dt>
                        <dd>{record.review.observationPlan}</dd>
                      </div>
                    </dl>
                    <div class="detail-note">
                      <span>Vitals</span>
                      <p>
                        {record.review.vitals.status === "not_recorded"
                          ? `Not recorded: ${record.review.vitals.reason}`
                          : [
                              record.review.vitals.bpSystolic !== null
                                ? `BP ${record.review.vitals.bpSystolic}/${record.review.vitals.bpDiastolic}`
                                : null,
                              record.review.vitals.pulse !== null
                                ? `Pulse ${record.review.vitals.pulse}`
                                : null,
                              record.review.vitals.temperatureC !== null
                                ? `${record.review.vitals.temperatureC} °C`
                                : null,
                              record.review.vitals.oxygenSaturation !== null
                                ? `SpO₂ ${record.review.vitals.oxygenSaturation}%`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                      </p>
                    </div>
                    <details class="review-detail">
                      <summary>Screening & preparation details</summary>
                      <dl class="clinical-facts">
                        <div>
                          <dt>Medication-specific review</dt>
                          <dd>{record.review.clinicalReview}</dd>
                        </div>
                        <div>
                          <dt>Preparation</dt>
                          <dd>{record.review.preparation}</dd>
                        </div>
                        <div>
                          <dt>Site assessment</dt>
                          <dd>{record.review.siteAssessment}</dd>
                        </div>
                      </dl>
                    </details>
                    <small class="review-timestamp">
                      Reviewed {momentLabel(record.review.reviewedAt, timezone)}
                    </small>
                  </>
                ) : (
                  <div class="section-empty">
                    <p>
                      Confirm the order, screening, and supply before
                      administration.
                    </p>
                    {canOperate && record.status === "draft" && (
                      <button
                        class="button primary"
                        onClick={() => setAction("review")}
                      >
                        Begin safety review
                        <Icon name="arrow" size={16} />
                      </button>
                    )}
                  </div>
                )}
              </section>
              {record.administration && (
                <section class="panel">
                  <div class="section-heading">
                    <h2>
                      {record.administration.delivery === "not_delivered"
                        ? "Administration attempt"
                        : "Administration"}
                    </h2>
                    <Badge
                      tone={
                        record.administration.delivery === "complete"
                          ? "sage"
                          : "butter"
                      }
                    >
                      {injectionStatus(record)}
                    </Badge>
                  </div>
                  <dl class="clinical-facts">
                    <div>
                      <dt>
                        {record.administration.delivery === "not_delivered"
                          ? "Attempted"
                          : "Administered"}
                      </dt>
                      <dd>
                        {momentLabel(
                          record.administration.administeredAt,
                          timezone,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>
                        {record.administration.delivery === "not_delivered"
                          ? "Performed by"
                          : "Administered by"}
                      </dt>
                      <dd>{record.administration.administeredByName}</dd>
                    </div>
                    <div>
                      <dt>Delivered dose</dt>
                      <dd>
                        {record.administration.delivery === "complete"
                          ? `${record.dose} ${record.doseUnit}`
                          : record.administration.actualDose === null
                            ? "Unknown"
                            : `${record.administration.actualDose} ${record.doseUnit}`}
                      </dd>
                    </div>
                    {record.administration.issueAction && (
                      <div>
                        <dt>Issue / provider action</dt>
                        <dd>{record.administration.issueAction}</dd>
                      </div>
                    )}
                    <div>
                      <dt>Tolerance</dt>
                      <dd>{record.administration.tolerance}</dd>
                    </div>
                    <div>
                      <dt>Observation</dt>
                      <dd>{record.administration.observation}</dd>
                    </div>
                  </dl>
                </section>
              )}
              {(record.administration ||
                record.status === "held" ||
                record.status === "cancelled") &&
                frozenPatient &&
                frozenProduct && (
                  <InjectionDocuments
                    record={record}
                    patient={frozenPatient}
                    product={frozenProduct}
                    lot={lot}
                    timezone={timezone}
                  />
                )}
              {!!record.amendments.length && (
                <section class="panel">
                  <div class="section-heading">
                    <h2>Addenda</h2>
                  </div>
                  <div class="audit-list">
                    {record.amendments.map((a) => (
                      <article key={a.id}>
                        <strong>{a.reason}</strong>
                        <p>{a.text}</p>
                        <small>{momentLabel(a.createdAt, timezone)}</small>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </div>
            <aside class="case-aside">
              <section class="panel next-action">
                <div class="section-heading">
                  <h2>Next step</h2>
                </div>
                {record.status === "draft" ? (
                  <>
                    <p>Complete the safety review.</p>
                    {canOperate && (
                      <button
                        class="button primary"
                        onClick={() => setAction("review")}
                      >
                        Review injection
                      </button>
                    )}
                  </>
                ) : record.status === "reviewed" ? (
                  <>
                    <p>
                      Confirm actual administration, tolerance, and observation.
                    </p>
                    {canOperate && (
                      <button
                        class="button primary"
                        disabled={record.plannedOn !== today}
                        onClick={() => setAction("administer")}
                      >
                        Record administration
                      </button>
                    )}
                  </>
                ) : record.status === "administered" ? (
                  <>
                    <p>
                      {record.handoff === "filed"
                        ? "Documentation filed in Tebra."
                        : "Review the note, then file it in Tebra."}
                    </p>
                    {canOperate && record.handoff !== "filed" && (
                      <button
                        class="button primary"
                        onClick={() => setAction("file")}
                      >
                        Confirm filed in Tebra
                      </button>
                    )}
                    {canOperate && (
                      <button
                        class="button secondary"
                        onClick={() => setAction("amend")}
                      >
                        Add addendum
                      </button>
                    )}
                  </>
                ) : record.status === "held" ? (
                  <>
                    <p>Resolve the hold, then review the order again.</p>
                    {canOperate && (
                      <button
                        class="button primary"
                        onClick={() => setAction("edit")}
                      >
                        Resume injection
                      </button>
                    )}
                  </>
                ) : (
                  <p>This injection was cancelled.</p>
                )}
                {canOperate &&
                  ["held", "cancelled"].includes(record.status) &&
                  record.handoff !== "filed" && (
                    <button
                      class="button secondary"
                      onClick={() => setAction("file")}
                    >
                      Confirm filed in Tebra
                    </button>
                  )}
                {canOperate && editable && (
                  <div class="quiet-actions">
                    {record.status !== "held" && (
                      <button
                        class="text-button"
                        onClick={() => setAction("hold")}
                      >
                        Hold
                      </button>
                    )}
                    <button
                      class="text-button danger-text"
                      onClick={() => setAction("cancel")}
                    >
                      Cancel injection
                    </button>
                  </div>
                )}
              </section>
              <section class="panel stock-summary">
                <div class="section-heading">
                  <h2>Supply</h2>
                </div>
                {record.review ? (
                  <>
                    <strong>
                      {record.review.stockUnits} {frozenProduct?.unit}
                      {record.review.stockUnits !== 1 ? "s" : ""}
                    </strong>
                    <Badge tone={record.administration ? "sage" : "teal"}>
                      {record.administration ? "Used" : "Reserved"}
                    </Badge>
                    <dl>
                      <dt>Lot</dt>
                      <dd>{record.review.lotSnapshot.lotNumber}</dd>
                      <dt>Expires</dt>
                      <dd>{dateLabel(record.review.lotSnapshot.expiresOn)}</dd>
                      <dt>Source</dt>
                      <dd>
                        {record.review.lotSnapshot.ownership === "patient"
                          ? "Patient supply"
                          : record.review.lotSnapshot.ownership === "sample"
                            ? "Sample"
                            : "Clinic stock"}
                      </dd>
                      <dt>Location</dt>
                      <dd>{record.review.lotSnapshot.location}</dd>
                    </dl>
                  </>
                ) : (
                  <p class="muted">
                    {record.status === "held" || record.status === "cancelled"
                      ? "No stock reserved. Any reservation was released."
                      : "Select and reserve stock during the safety review."}
                  </p>
                )}
              </section>
              {!!record.filings.length && (
                <section class="panel">
                  <div class="section-heading">
                    <h2>Tebra filing</h2>
                  </div>
                  <div class="audit-list">
                    {record.filings.map((f) => (
                      <article key={f.id}>
                        <strong>{f.tebraReference}</strong>
                        <small>{momentLabel(f.filedAt, timezone)}</small>
                        <small>
                          {f.amendmentCount
                            ? `Includes ${f.amendmentCount} addendum entries`
                            : "Original note"}
                        </small>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </aside>
          </div>
        </>
      )}
      {action && (
        <InjectionDialog
          key={`${action}-${record?.id || "new"}`}
          action={action}
          record={record}
          patientId={patientId}
          data={data}
          actor={actor}
          timezone={timezone}
          onClose={() => setAction(undefined)}
          onSaved={async (result) => {
            setLatestSaved(result);
            setAction(undefined);
            setSelectedId(result.id);
            setNotice("Saved.");
            try {
              await onRefresh();
            } catch {
              setNotice(
                "Saved. Refresh to load the latest inventory and workspace records.",
              );
            }
          }}
        />
      )}
    </div>
  );
}
