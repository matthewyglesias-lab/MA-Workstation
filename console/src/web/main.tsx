import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type {
  Actor,
  Overview,
  Patient,
  RuntimeInfo,
} from "../shared/contracts.js";
import type { InjectionCase } from "../shared/injections.js";
import {
  getOverview,
  getSession,
  getInjections,
  initialize,
  signOut,
} from "./api.js";
import {
  Icon,
  Badge,
  ErrorText,
  dateLabel,
  type Editor,
} from "./components.js";
import { EditorDialog } from "./EditorDialog.js";
import { InjectionWorkspace } from "./InjectionWorkspace.js";
import { SignInView } from "./SignInView.js";
import "./fonts.css";
import "./style.css";

const empty: Overview = {
  patients: [],
  activities: [],
  products: [],
  lots: [],
  movements: [],
};
type Page = "Injections" | "Patients" | "Inventory";

function App() {
  const [config, setConfig] = useState<RuntimeInfo>();
  const [actor, setActor] = useState<Actor>();
  const [data, setData] = useState<Overview>(empty);
  const [injections, setInjections] = useState<InjectionCase[]>([]);
  const [page, setPage] = useState<Page>("Injections");
  const [search, setSearch] = useState("");
  const [patientId, setPatientId] = useState<string>();
  const [editor, setEditor] = useState<Editor>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [lastLoaded, setLastLoaded] = useState<Date>();
  const sessionEpoch = useRef(0);
  const lastInteraction = useRef(Date.now());

  function clearSession() {
    document.getElementById("console-print-document")?.remove();
    sessionEpoch.current++;
    setActor(undefined);
    setData(empty);
    setInjections([]);
    setPatientId(undefined);
    setEditor(undefined);
    setSearch("");
    setMessage("");
    setError("");
    setLastLoaded(undefined);
    setBusy(false);
  }
  async function refresh() {
    const epoch = sessionEpoch.current;
    setBusy(true);
    try {
      const [overview, cases] = await Promise.all([
        getOverview(),
        getInjections(),
      ]);
      if (epoch !== sessionEpoch.current) return;
      setData(overview);
      setInjections(cases);
      setLastLoaded(new Date());
      setError("");
    } catch (e) {
      if (epoch === sessionEpoch.current) setError((e as Error).message);
      throw e;
    } finally {
      if (epoch === sessionEpoch.current) setBusy(false);
    }
  }
  async function loadSession() {
    const epoch = sessionEpoch.current;
    const session = await getSession();
    if (epoch !== sessionEpoch.current) return;
    lastInteraction.current = Date.now();
    setActor(session.actor);
    await refresh();
  }
  function lock() {
    clearSession();
    void signOut().catch(() => {});
  }
  useEffect(() => {
    window.addEventListener("console:locked", clearSession);
    void initialize()
      .then(async (c) => {
        setConfig(c);
        await loadSession();
      })
      .catch((e) => {
        setError(e.message);
        setBusy(false);
      });
    return () => window.removeEventListener("console:locked", clearSession);
  }, []);
  useEffect(() => {
    if (!actor) return;
    const expired = () => Date.now() - lastInteraction.current >= 5 * 60 * 1000;
    const track = (event: Event) => {
      if (expired()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        lock();
      } else lastInteraction.current = Date.now();
    };
    const check = () => {
      if (expired()) lock();
    };
    window.addEventListener("pointerdown", track, true);
    window.addEventListener("keydown", track, true);
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, 10000);
    return () => {
      window.removeEventListener("pointerdown", track, true);
      window.removeEventListener("keydown", track, true);
      document.removeEventListener("visibilitychange", check);
      clearInterval(timer);
    };
  }, [actor]);
  const canOperate = !!actor?.roles.includes("Console.Operator");
  const canManage = !!actor?.roles.includes("Inventory.Manager");
  const selected = data.patients.find((p) => p.id === patientId);
  const patient = (id: string) => data.patients.find((p) => p.id === id);
  const filteredPatients = data.patients.filter((p) =>
    `${p.displayName} ${p.tebraId} ${p.dob}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const today = config
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: config.clinicTimezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format()
    : "";
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
  if (!config)
    return (
      <div class="startup">
        <div class="brand-symbol">i</div>
        <p>
          {busy ? "Opening clinic console…" : "Unable to open clinic console"}
        </p>
        <ErrorText error={error} />
        {!busy && (
          <button class="button secondary" onClick={() => location.reload()}>
            Try again
          </button>
        )}
      </div>
    );
  if (!actor) return <SignInView config={config} onSignedIn={loadSession} />;
  return (
    <div class="app-shell">
      <aside class="sidebar">
        <a
          class="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("Injections");
          }}
        >
          <span class="brand-symbol">
            i<span />
          </span>
          <span>
            INLAND PSYCHIATRIC<small>Clinic console</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          {(["Injections", "Patients", "Inventory"] as Page[]).map((p) => (
            <button
              key={p}
              class={`nav-item ${page === p ? "active" : ""}`}
              aria-current={page === p ? "page" : undefined}
              onClick={() => navigate(p)}
            >
              <Icon name={p} />
              <span>{p}</span>
            </button>
          ))}
        </nav>
        <div class="sidebar-bottom">
          <div class="staff-avatar">
            {(actor.displayName || "Clinic staff")
              .split(" ")
              .map((s) => s[0])
              .slice(0, 2)
              .join("")}
          </div>
          <span class="staff-name">
            {actor.displayName || "Clinic staff"}
            <small>
              {canManage
                ? "Inventory manager"
                : canOperate
                  ? "Clinic operator"
                  : "View only"}
            </small>
          </span>
        </div>
      </aside>
      <div class="main-shell">
        <header class="topbar">
          <span class="breadcrumb">
            Clinic <span>/</span> {page}
          </span>
          <div class="topbar-actions">
            <span class="date-label">
              {new Date().toLocaleDateString("en-US", {
                timeZone: config.clinicTimezone,
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
            <button
              class="icon-button"
              title="Refresh records"
              aria-label="Refresh records"
              onClick={() => void refresh().catch(() => {})}
              disabled={busy}
            >
              ↻
            </button>
            <button class="button secondary small" onClick={lock}>
              Lock
            </button>
          </div>
        </header>
        {(config.mode === "demo" || config.mode === "preview") && (
          <div class="demo-banner">
            <strong>Demo</strong>
            <span>
              Fictional patients · changes reset · do not enter patient
              information
            </span>
          </div>
        )}
        <main>
          <ErrorText error={error} />
          <div class="sr-only" role="status">
            {message}
          </div>
          {busy && !lastLoaded ? (
            <div class="empty-state">Loading records…</div>
          ) : (
            <>
              {page === "Injections" && (
                <InjectionWorkspace
                  data={data}
                  records={injections}
                  actor={actor}
                  timezone={config.clinicTimezone}
                  onRefresh={refresh}
                  onLinkPatient={() => setEditor({ kind: "patient" })}
                />
              )}
              {page === "Patients" && (
                <>
                  <div class="page-heading">
                    <div>
                      <p class="eyebrow">CLINIC CONSOLE</p>
                      <h1>Patients</h1>
                    </div>
                    {canOperate && (
                      <button
                        class="button coral"
                        onClick={() => setEditor({ kind: "patient" })}
                      >
                        <Icon name="plus" size={17} />
                        Link patient
                      </button>
                    )}
                  </div>
                  {selected ? (
                    <>
                      <section class="patient-banner">
                        <div class="avatar">
                          {selected.displayName.slice(0, 1)}
                        </div>
                        <div>
                          <h2>{selected.displayName}</h2>
                          <p>
                            DOB {dateLabel(selected.dob)} <span>·</span> Tebra #
                            {selected.tebraId}
                          </p>
                        </div>
                        <button
                          class="button secondary small"
                          onClick={() => setPatientId(undefined)}
                        >
                          All patients
                        </button>
                      </section>
                      <InjectionWorkspace
                        key={selected.id}
                        data={data}
                        records={injections}
                        actor={actor}
                        timezone={config.clinicTimezone}
                        patientId={selected.id}
                        onRefresh={refresh}
                        onLinkPatient={() => setEditor({ kind: "patient" })}
                      />
                    </>
                  ) : (
                    <section class="panel">
                      <div class="section-heading">
                        <h2>Patient directory</h2>
                        <div class="search">
                          <Icon name="search" size={18} />
                          <input
                            aria-label="Search patients"
                            placeholder="Name, DOB, or chart ID"
                            value={search}
                            onInput={(e) => setSearch(e.currentTarget.value)}
                          />
                        </div>
                      </div>
                      <div class="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Patient</th>
                              <th>Date of birth</th>
                              <th>Tebra chart</th>
                              <th>Verified</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {filteredPatients.map((p) => (
                              <tr key={p.id}>
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
                                <td>
                                  {new Date(p.verifiedAt).toLocaleDateString()}
                                </td>
                                <td>
                                  <button
                                    class="text-button"
                                    onClick={() => openPatient(p)}
                                  >
                                    Open
                                    <Icon name="arrow" size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {!filteredPatients.length && (
                          <div class="empty-state">No patients found.</div>
                        )}
                      </div>
                    </section>
                  )}
                </>
              )}
              {page === "Inventory" && (
                <div class="page-heading">
                  <div>
                    <p class="eyebrow">CLINIC CONSOLE</p>
                    <h1>Inventory</h1>
                  </div>
                  {canManage && (
                    <button
                      class="button coral"
                      onClick={() => setEditor({ kind: "lot" })}
                    >
                      <Icon name="plus" size={17} />
                      Add stock lot
                    </button>
                  )}
                </div>
              )}
              {page === "Inventory" && (
                <>
                  <section class="panel">
                    <div class="section-heading">
                      <div>
                        <h2>Stock</h2>
                        <p>
                          Whole units · reserve, receive, and reconcile stock
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
                                    class={
                                      l.expiresOn < today ? "danger-text" : ""
                                    }
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
                                      Update stock
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
                        <p>Receipts, reservations, use, and corrections.</p>
                      </div>
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
                                  {m.kind === "use" ? "Used" : m.kind}
                                </strong>
                                <small>
                                  {new Date(m.createdAt).toLocaleString(
                                    "en-US",
                                    {
                                      timeZone: config?.clinicTimezone,
                                    },
                                  )}
                                </small>
                              </td>
                              <td>
                                {
                                  data.lots.find((l) => l.id === m.lotId)
                                    ?.lotNumber
                                }
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
            </>
          )}
          <footer class="workspace-footer">
            <span>
              <span class="connection-dot" />
              {config.mode === "sql" ? "Connected" : "Demo"} · Tebra is the
              clinical record
            </span>
            <span>
              {lastLoaded
                ? `Updated ${lastLoaded.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                : ""}{" "}
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
            setMessage("Saved.");
            await refresh();
          }}
        />
      )}
    </div>
  );
}
render(<App />, document.getElementById("app")!);
