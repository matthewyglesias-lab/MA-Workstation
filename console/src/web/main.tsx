import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import type {
  Activity,
  Actor,
  Lot,
  Movement,
  Overview,
  Patient,
  RuntimeInfo,
} from "../shared/contracts.js";
import { getOverview, getSession, initialize, signIn, signOut } from "./api.js";
import {
  Icon,
  Badge,
  ErrorText,
  dateLabel,
  type Editor,
} from "./components.js";
import { EditorDialog } from "./EditorDialog.js";
import "./style.css";

const empty: Overview = {
  patients: [],
  activities: [],
  products: [],
  lots: [],
  movements: [],
};
type Page = "Today" | "Patients" | "Work" | "Inventory" | "Manage";
function App() {
  const [config, setConfig] = useState<RuntimeInfo>();
  const [actor, setActor] = useState<Actor>();
  const [data, setData] = useState<Overview>(empty);
  const [page, setPage] = useState<Page>("Today");
  const [search, setSearch] = useState("");
  const [patientId, setPatientId] = useState<string>();
  const [editor, setEditor] = useState<Editor>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [lastLoaded, setLastLoaded] = useState<Date>();
  async function refresh() {
    setBusy(true);
    try {
      setData(await getOverview());
      setLastLoaded(new Date());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void initialize()
      .then(async (c) => {
        setConfig(c);
        const session = await getSession();
        setActor(session.actor);
        await refresh();
      })
      .catch((e) => {
        setError(e.message);
        setBusy(false);
      });
  }, []);
  const canOperate = !!actor?.roles.includes("Console.Operator");
  const canManage = !!actor?.roles.includes("Inventory.Manager");
  const selected = data.patients.find((p) => p.id === patientId);
  const patient = (id: string) => data.patients.find((p) => p.id === id);
  const filteredPatients = data.patients.filter((p) =>
    `${p.displayName} ${p.tebraId} ${p.dob}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const activities = data.activities.filter(
    (a) =>
      (!selected || a.patientId === selected.id) &&
      (!search ||
        `${patient(a.patientId)?.displayName} ${a.service}`
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  const today = config
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: config.clinicTimezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format()
    : "";
  const expired = data.lots.filter((l) => l.onHand > 0 && l.expiresOn < today);
  const waiting = data.activities.filter((a) => a.status !== "completed");
  const pending = data.activities.filter(
    (a) => a.status === "completed" && a.handoff !== "filed",
  );
  function navigate(next: Page) {
    setPage(next);
    setSearch("");
    setPatientId(undefined);
  }
  function openPatient(p: Patient) {
    setPatientId(p.id);
    setPage("Patients");
    setSearch("");
  }
  const heroText = {
    Today: [
      "A clear view of the day.",
      "Your patients, next steps, and clinical supplies—in one calm workspace.",
    ],
    Patients: [
      "Every patient. One connected view.",
      "Operational context linked to the authoritative Tebra chart.",
    ],
    Work: [
      "Keep the next step moving.",
      "Service progress and chart handoff, tracked separately.",
    ],
    Inventory: [
      "Know what’s here. Know what’s next.",
      "Traceable stock, patient reservations, and a history behind every change.",
    ],
    Manage: [
      "A foundation that can grow.",
      "Clear responsibilities and connected workflows for the whole clinic.",
    ],
  };
  return (
    <div class="app-shell">
      <aside class="sidebar">
        <a
          class="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("Today");
          }}
        >
          <span class="brand-icon">
            <Icon name="leaf" size={24} />
          </span>
          <span>
            inland<span class="brand-sub">CLINIC CONSOLE</span>
          </span>
        </a>
        <div class="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          {(["Today", "Patients", "Work", "Inventory", "Manage"] as Page[]).map(
            (p) => (
              <button
                class={`nav-item ${page === p ? "active" : ""}`}
                aria-current={page === p ? "page" : undefined}
                onClick={() => navigate(p)}
              >
                <Icon name={p} />
                <span>{p}</span>
                {p === "Work" && pending.length > 0 && (
                  <span class="nav-count">{pending.length}</span>
                )}
              </button>
            ),
          )}
        </nav>
        <div class="sidebar-bottom">
          <span class="connection-dot" /> Alongside Tebra
          <p>Clinical truth stays in the chart.</p>
          <div class="staff-avatar">IP</div>
          <span class="staff-name">
            Inland Psychiatric<small>Clinic workspace</small>
          </span>
        </div>
      </aside>
      <div class="main-shell">
        <header class="topbar">
          <span class="breadcrumb">
            Workspace <span>/</span> {page}
          </span>
          <div class="topbar-actions">
            <span class="date-label">
              {new Date().toLocaleDateString("en-US", {
                timeZone: config?.clinicTimezone || "America/Los_Angeles",
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
            <button
              class="icon-button"
              title="Refresh records"
              aria-label="Refresh records"
              onClick={refresh}
              disabled={busy}
            >
              ↻
            </button>
            {config?.mode === "sql" && (
              <button
                class="button secondary small"
                onClick={() => {
                  if (actor) {
                    setData(empty);
                    setActor(undefined);
                    setPatientId(undefined);
                    setEditor(undefined);
                    setLastLoaded(undefined);
                    void signOut().catch((e) => setError(e.message));
                  } else {
                    void signIn().catch((e) => setError(e.message));
                  }
                }}
              >
                {actor ? "Sign out" : "Sign in"}
              </button>
            )}
          </div>
        </header>
        {config?.mode === "demo" && (
          <div class="demo-banner">
            <strong>Demonstration workspace</strong>
            <span>
              Synthetic data only · changes reset when the demo server restarts.
            </span>
          </div>
        )}
        <main>
          <div class="hero">
            <div>
              <p class="eyebrow">
                {page === "Today"
                  ? "A LITTLE CLARITY, EVERY DAY"
                  : page.toUpperCase()}
              </p>
              <h1>{heroText[page][0]}</h1>
              <p class="subtitle">{heroText[page][1]}</p>
            </div>
            {page !== "Manage" &&
              (page === "Inventory" ? canManage : canOperate) && (
                <button
                  class="button primary"
                  onClick={() =>
                    setEditor({
                      kind:
                        page === "Inventory"
                          ? "lot"
                          : page === "Patients"
                            ? "patient"
                            : "activity",
                      patient: selected,
                    })
                  }
                >
                  <Icon name="plus" size={18} />
                  {page === "Inventory"
                    ? "Add stock lot"
                    : page === "Patients"
                      ? "Link patient"
                      : "New activity"}
                </button>
              )}
          </div>
          <ErrorText error={error} />
          <div class="sr-only" role="status">
            {message}
          </div>
          {busy && !lastLoaded && (
            <div class="empty-state">Loading your workspace…</div>
          )}
          {selected && (
            <section class="patient-banner">
              <div class="avatar">{selected.displayName.slice(0, 1)}</div>
              <div>
                <h2>{selected.displayName}</h2>
                <p>
                  DOB {dateLabel(selected.dob)} <span>·</span> Tebra #
                  {selected.tebraId}
                </p>
              </div>
              <div class="patient-source">
                <Badge tone="sage">Tebra-linked</Badge>
                <small>
                  Identity checked{" "}
                  {new Date(selected.verifiedAt).toLocaleDateString()}
                </small>
              </div>
              <button
                class="icon-button"
                aria-label="Close patient context"
                onClick={() => setPatientId(undefined)}
              >
                <Icon name="close" />
              </button>
            </section>
          )}
          {page === "Today" && (
            <>
              <div class="metric-grid">
                <button
                  class="metric lavender"
                  onClick={() => navigate("Work")}
                >
                  <span>Active services</span>
                  <strong>{waiting.length}</strong>
                  <small>
                    Ready for your next step <Icon name="arrow" size={16} />
                  </small>
                </button>
                <button class="metric peach" onClick={() => navigate("Work")}>
                  <span>Awaiting chart handoff</span>
                  <strong>{pending.length}</strong>
                  <small>
                    Completed · not yet filed <Icon name="arrow" size={16} />
                  </small>
                </button>
                <button
                  class="metric butter"
                  onClick={() => navigate("Inventory")}
                >
                  <span>Stock needing attention</span>
                  <strong>{expired.length}</strong>
                  <small>
                    Expired lots with stock <Icon name="arrow" size={16} />
                  </small>
                </button>
              </div>
              <div class="today-grid">
                <section class="panel">
                  <div class="section-heading">
                    <div>
                      <h2>Care in motion</h2>
                      <p>Open activities across the clinic</p>
                    </div>
                    <button
                      class="text-button"
                      onClick={() => navigate("Work")}
                    >
                      View work <Icon name="arrow" size={16} />
                    </button>
                  </div>
                  {waiting.length ? (
                    waiting.slice(0, 6).map((a) => (
                      <button
                        class="activity-row"
                        onClick={() => {
                          const p = patient(a.patientId);
                          if (p) openPatient(p);
                        }}
                      >
                        <span class="avatar lavender">
                          {patient(a.patientId)?.displayName.slice(0, 1) || "?"}
                        </span>
                        <span class="row-title">
                          {patient(a.patientId)?.displayName ||
                            "Linked patient"}
                          <small>
                            {a.service} · {a.status.replace("_", " ")}
                          </small>
                        </span>
                        <Badge>{a.service}</Badge>
                        <Icon name="arrow" size={16} />
                      </button>
                    ))
                  ) : (
                    <div class="empty-state">
                      No open activities. Start one when a patient needs a
                      service.
                    </div>
                  )}
                </section>
                <aside class="insight-panel">
                  <span class="insight-icon">
                    <Icon name="leaf" size={28} />
                  </span>
                  <p class="eyebrow">CONNECTED, WITH CLARITY</p>
                  <h2>
                    A helpful engine.
                    <br /> A trusted chart.
                  </h2>
                  <p>
                    Prepare and track the work here. Confirm clinical
                    information in Tebra and finish the documentation handoff
                    there.
                  </p>
                  <div class="insight-rule" />
                  <strong>One action at a time</strong>
                  <p>
                    Reservations protect patient supply. Inventory use and chart
                    filing remain explicit, separate steps.
                  </p>
                </aside>
              </div>
            </>
          )}
          {(page === "Patients" || page === "Work") && (
            <section class="panel">
              <div class="section-heading">
                <div>
                  <h2>
                    {selected
                      ? "Patient activities"
                      : page === "Patients"
                        ? "Patient directory"
                        : "Service worklist"}
                  </h2>
                  <p>
                    {selected
                      ? "Service progress and documentation handoff"
                      : "Search the loaded workspace records"}
                  </p>
                </div>
                <div class="search">
                  <Icon name="search" size={18} />
                  <input
                    aria-label="Search patients and work"
                    placeholder="Search name, chart ID…"
                    value={search}
                    onInput={(e) => setSearch(e.currentTarget.value)}
                  />
                </div>
                {selected && canOperate && (
                  <button
                    class="button secondary small"
                    onClick={() =>
                      setEditor({ kind: "activity", patient: selected })
                    }
                  >
                    Add activity
                  </button>
                )}
              </div>
              {page === "Patients" && !selected ? (
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Patient</th>
                        <th>Date of birth</th>
                        <th>Tebra chart</th>
                        <th>Identity verified</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPatients.map((p) => (
                        <tr>
                          <td>
                            <button
                              class="patient-link"
                              onClick={() => openPatient(p)}
                            >
                              {p.displayName}
                            </button>
                          </td>
                          <td>{dateLabel(p.dob)}</td>
                          <td>#{p.tebraId}</td>
                          <td>{new Date(p.verifiedAt).toLocaleDateString()}</td>
                          <td>
                            <button
                              class="text-button"
                              onClick={() => openPatient(p)}
                            >
                              Open <Icon name="arrow" size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!filteredPatients.length && (
                    <div class="empty-state">
                      No matching patients. Link a verified Tebra chart to
                      begin.
                    </div>
                  )}
                </div>
              ) : (
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Patient / service</th>
                        <th>Service progress</th>
                        <th>Tebra handoff</th>
                        <th>Next step</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activities.map((a) => (
                        <tr>
                          <td>
                            <strong>
                              {patient(a.patientId)?.displayName ||
                                "Linked patient"}
                            </strong>
                            <small>{a.service}</small>
                          </td>
                          <td>
                            <Badge
                              tone={a.status === "completed" ? "sage" : ""}
                            >
                              {a.status.replace("_", " ")}
                            </Badge>
                          </td>
                          <td>
                            <Badge
                              tone={
                                a.handoff === "filed"
                                  ? "sage"
                                  : a.handoff === "prepared"
                                    ? "peach"
                                    : ""
                              }
                            >
                              {a.handoff === "pending"
                                ? "Not prepared"
                                : a.handoff === "prepared"
                                  ? "Prepared · not filed"
                                  : "Filed in Tebra"}
                            </Badge>
                          </td>
                          <td>
                            {canOperate && a.handoff !== "filed" ? (
                              <button
                                class="button secondary small"
                                onClick={() =>
                                  setEditor({
                                    kind: "handoff",
                                    activity: a,
                                    patient: patient(a.patientId),
                                  })
                                }
                              >
                                Update activity
                              </button>
                            ) : (
                              <span class="muted">
                                {a.tebraReference || "View only"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!activities.length && (
                    <div class="empty-state">No activities here yet.</div>
                  )}
                </div>
              )}
            </section>
          )}
          {page === "Inventory" && (
            <>
              <section class="panel">
                <div class="section-heading">
                  <div>
                    <h2>Medication & supply stock</h2>
                    <p>
                      Whole stock units · quantities are not medication doses
                    </p>
                  </div>
                  {canManage && (
                    <button
                      class="button secondary small"
                      onClick={() => setEditor({ kind: "product" })}
                    >
                      <Icon name="plus" size={16} /> Add product
                    </button>
                  )}
                </div>
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Product / lot</th>
                        <th>Supply source</th>
                        <th>Expiration</th>
                        <th>On hand</th>
                        <th>Reserved</th>
                        <th>Available</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.lots.map((l) => {
                        const p = data.products.find(
                          (p) => p.id === l.productId,
                        );
                        return (
                          <tr>
                            <td>
                              <strong>{p?.name || "Product"}</strong>
                              <small>
                                {p?.strength} · lot {l.lotNumber}
                              </small>
                              <small>{l.location}</small>
                            </td>
                            <td>
                              <Badge>{l.ownership}</Badge>
                              {l.ownerPatientId && (
                                <small>
                                  {patient(l.ownerPatientId)?.displayName ||
                                    "Linked owner"}
                                </small>
                              )}
                            </td>
                            <td>
                              <span
                                class={l.expiresOn < today ? "danger-text" : ""}
                              >
                                {dateLabel(l.expiresOn)}
                              </span>
                              {l.expiresOn < today && (
                                <small class="danger-text">Expired</small>
                              )}
                            </td>
                            <td class="number">{l.onHand}</td>
                            <td class="number">{l.reserved}</td>
                            <td class="number">
                              <strong>{l.onHand - l.reserved}</strong>
                              <small>{p?.unit}s</small>
                            </td>
                            <td>
                              {(canManage || canOperate) && (
                                <button
                                  class="button secondary small"
                                  onClick={() =>
                                    setEditor({ kind: "movement", lot: l })
                                  }
                                >
                                  Record movement
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!data.lots.length && (
                    <div class="empty-state">
                      Add a product and stock lot, then record its receipt.
                    </div>
                  )}
                </div>
              </section>
              <section class="panel history">
                <div class="section-heading">
                  <div>
                    <h2>Movement history</h2>
                    <p>
                      Original entries remain intact. Corrections create a
                      linked reversal.
                    </p>
                  </div>
                  <Badge>Auditable</Badge>
                </div>
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Movement</th>
                        <th>Lot / patient</th>
                        <th>Stock change</th>
                        <th>Reserved change</th>
                        <th>Reason</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.movements.slice(0, 30).map((m) => (
                        <tr>
                          <td>
                            <strong>
                              {m.kind === "use" ? "Recorded use" : m.kind}
                            </strong>
                            <small>
                              {new Date(m.createdAt).toLocaleString("en-US", {
                                timeZone: config?.clinicTimezone,
                              })}
                            </small>
                          </td>
                          <td>
                            {data.lots.find((l) => l.id === m.lotId)?.lotNumber}
                            <small>
                              {m.patientId
                                ? patient(m.patientId)?.displayName ||
                                  "Linked patient"
                                : "Clinic stock"}
                            </small>
                          </td>
                          <td class="number">
                            {m.stockDelta > 0 ? "+" : ""}
                            {m.stockDelta}
                          </td>
                          <td class="number">
                            {m.reservedDelta > 0 ? "+" : ""}
                            {m.reservedDelta}
                          </td>
                          <td>{m.reason}</td>
                          <td>
                            {canManage &&
                              m.kind !== "reverse" &&
                              !data.movements.some(
                                (r) => r.reversesId === m.id,
                              ) && (
                                <button
                                  class="text-button"
                                  onClick={() =>
                                    setEditor({
                                      kind: "movement",
                                      lot: data.lots.find(
                                        (l) => l.id === m.lotId,
                                      ),
                                      original: m,
                                    })
                                  }
                                >
                                  Correct
                                </button>
                              )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!data.movements.length && (
                    <div class="empty-state">
                      Stock changes will appear here.
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
          {page === "Manage" && (
            <div class="manage-grid">
              <section class="panel manage-card">
                <Icon name="Patients" size={28} />
                <h2>Tebra remains authoritative</h2>
                <p>
                  This console stores verified identity links and operational
                  work. It does not synchronize with Tebra or replace orders,
                  diagnoses, medication lists, or signed chart notes.
                </p>
                <Badge tone="sage">Explicit handoff</Badge>
              </section>
              <section class="panel manage-card">
                <Icon name="Inventory" size={28} />
                <h2>Inventory foundations</h2>
                <p>
                  Receipts, patient reservations, releases, use, waste,
                  adjustments, and reversals share one movement history.
                  Patient-owned supply stays with its owner.
                </p>
                <button
                  class="text-button"
                  onClick={() => navigate("Inventory")}
                >
                  Manage inventory <Icon name="arrow" size={16} />
                </button>
              </section>
              <section class="panel manage-card">
                <Icon name="Work" size={28} />
                <h2>First build · foundation</h2>
                <p>
                  Clinical decision support, note generation, kiosk integration,
                  transfers, partial-vial tracking, and automated notifications
                  are planned extensions. This build does not perform those
                  actions.
                </p>
                <Badge>Version 0.1</Badge>
              </section>
            </div>
          )}
          <footer class="workspace-footer">
            <span>
              <span class="connection-dot" />
              {config?.mode === "demo"
                ? "Local synthetic demo"
                : actor
                  ? "Connected workspace"
                  : "Awaiting sign-in"}
            </span>
            <span>
              {lastLoaded
                ? `Loaded ${lastLoaded.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · refresh for staff updates`
                : "No records loaded"}{" "}
              · First 250 records per module
            </span>
          </footer>
        </main>
      </div>
      {editor && (
        <EditorDialog
          editor={editor}
          data={data}
          canManage={canManage}
          onClose={() => setEditor(undefined)}
          onSaved={async () => {
            setEditor(undefined);
            setMessage("Saved successfully.");
            await refresh();
          }}
        />
      )}
    </div>
  );
}

render(<App />, document.getElementById("app")!);
