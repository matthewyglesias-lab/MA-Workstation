import { useEffect, useRef, useState } from "preact/hooks";
import type { Activity, Overview } from "../shared/contracts.js";
import { Icon, Field, ErrorText, type Editor } from "./components.js";
import { request } from "./api.js";
export function EditorDialog({
  editor,
  data,
  canManage,
  onClose,
  onSaved,
}: {
  editor: Editor;
  data: Overview;
  canManage: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState(
    editor.original ? "reverse" : canManage ? "receive" : "reserve",
  );
  const [ownership, setOwnership] = useState("clinic");
  const [serviceStatus, setServiceStatus] = useState(
    editor.activity?.status || "planned",
  );
  const [handoffStatus, setHandoffStatus] = useState(
    editor.activity?.handoff || "pending",
  );
  const attempt = useRef<{ payload: string; key: string }>();
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const titles = {
    patient: "Link a Tebra patient",
    activity: "Start a service activity",
    product: "Add a stock product",
    lot: "Add a stock lot",
    movement: editor.original
      ? "Correct a movement"
      : "Record a stock movement",
    handoff: "Update service & handoff",
  };
  const options = (selected?: string) => (
    <>
      <option value="">Select a patient</option>
      {data.patients.map((p) => (
        <option value={p.id} selected={p.id === selected}>
          {p.displayName} · #{p.tebraId}
        </option>
      ))}
    </>
  );
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const value = (name: string) => String(form.get(name) || "").trim();
    let path = "",
      method = "POST",
      body: unknown;
    switch (editor.kind) {
      case "patient":
        path = "/patients";
        body = {
          displayName: value("name"),
          dob: value("dob"),
          tebraId: value("tebra"),
          verifiedInTebra: form.get("verified") === "on",
        };
        break;
      case "activity":
        path = "/activities";
        body = {
          patientId: editor.patient?.id || value("patient"),
          service: value("service"),
        };
        break;
      case "product":
        path = "/products";
        body = {
          name: value("name"),
          strength: value("strength"),
          unit: value("unit"),
          ndc: value("ndc") || null,
        };
        break;
      case "lot":
        path = "/lots";
        body = {
          productId: value("product"),
          lotNumber: value("lot"),
          expiresOn: value("expires"),
          location: value("location"),
          ownership,
          ownerPatientId: ownership === "patient" ? value("patient") : null,
        };
        break;
      case "movement":
        path = "/movements";
        body = {
          lotId: editor.lot!.id,
          kind,
          quantity: kind === "reverse" ? 0 : Number(value("quantity")),
          patientId:
            editor.original?.patientId ||
            editor.lot?.ownerPatientId ||
            value("patient") ||
            null,
          reason: value("reason"),
          reversesId: editor.original?.id || null,
        };
        break;
      case "handoff":
        path = `/activities/${editor.activity!.id}`;
        method = "PATCH";
        body = {
          expectedVersion: editor.activity!.version,
          status: value("status"),
          handoff: value("handoff"),
          tebraReference: value("reference") || null,
        };
        break;
    }
    const payload = JSON.stringify([path, method, body]);
    if (!attempt.current || attempt.current.payload !== payload)
      attempt.current = { payload, key: crypto.randomUUID() };
    setSaving(true);
    setError("");
    try {
      await request(path, method, body, attempt.current.key);
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      class="editor-dialog"
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!saving) onClose();
      }}
    >
      <div class="dialog-header">
        <div>
          <p class="eyebrow">CLINIC WORKSPACE</p>
          <h2 id="dialog-title">{titles[editor.kind]}</h2>
        </div>
        <button
          class="icon-button"
          type="button"
          aria-label="Close dialog"
          disabled={saving}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      <form onSubmit={submit}>
        <div class="dialog-body">
          <ErrorText error={error} />
          {editor.kind === "patient" && (
            <>
              <p class="form-note">
                Use the chart’s verified identity. The clinical record remains
                in Tebra.
              </p>
              <Field label="Patient display name">
                <input
                  name="name"
                  required
                  maxLength={160}
                  autoComplete="off"
                />
              </Field>
              <div class="form-grid">
                <Field label="Date of birth">
                  <input type="date" name="dob" required />
                </Field>
                <Field label="Tebra chart ID">
                  <input
                    name="tebra"
                    required
                    maxLength={64}
                    pattern="[A-Za-z0-9_-]+"
                  />
                </Field>
              </div>
              <label class="checkbox">
                <input type="checkbox" name="verified" required />I verified
                this identity and chart ID in Tebra.
              </label>
            </>
          )}
          {editor.kind === "activity" && (
            <>
              {editor.patient ? (
                <p class="form-note">
                  <strong>{editor.patient.displayName}</strong> · Tebra #
                  {editor.patient.tebraId}
                </p>
              ) : (
                <Field label="Patient">
                  <select name="patient" required>
                    {options()}
                  </select>
                </Field>
              )}
              <Field label="Service">
                <select name="service">
                  {["Injection", "UDS", "TMS", "Samples", "Forms"].map((s) => (
                    <option>{s}</option>
                  ))}
                </select>
              </Field>
              <p class="form-note">
                Creates an operational activity. This does not create an
                appointment or order in Tebra.
              </p>
            </>
          )}
          {editor.kind === "product" && (
            <>
              <Field label="Product name">
                <input name="name" required maxLength={160} />
              </Field>
              <Field label="Strength / formulation">
                <input name="strength" required maxLength={80} />
              </Field>
              <div class="form-grid">
                <Field label="Stock counting unit">
                  <select name="unit">
                    {["syringe", "kit", "tablet", "capsule", "vial"].map(
                      (u) => (
                        <option>{u}</option>
                      ),
                    )}
                  </select>
                </Field>
                <Field label="NDC (optional)">
                  <input name="ndc" maxLength={30} />
                </Field>
              </div>
              <p class="form-note">
                Count whole units. Partial vials and dose-to-volume conversion
                are not supported in this foundation build.
              </p>
            </>
          )}
          {editor.kind === "lot" && (
            <>
              <Field label="Product">
                <select name="product" required>
                  <option value="">Select a product</option>
                  {data.products.map((p) => (
                    <option value={p.id}>
                      {p.name} · {p.strength} · {p.unit}
                    </option>
                  ))}
                </select>
              </Field>
              <div class="form-grid">
                <Field label="Lot number">
                  <input name="lot" required maxLength={80} />
                </Field>
                <Field label="Expiration date">
                  <input name="expires" type="date" required />
                </Field>
              </div>
              <Field label="Storage location">
                <input
                  name="location"
                  required
                  maxLength={100}
                  placeholder="Office · cabinet or refrigerator"
                />
              </Field>
              <Field label="Supply ownership">
                <select
                  value={ownership}
                  onChange={(e) => setOwnership(e.currentTarget.value)}
                >
                  <option value="clinic">Clinic-owned</option>
                  <option value="sample">Clinic sample</option>
                  <option value="patient">Patient-specific supply</option>
                </select>
              </Field>
              {ownership === "patient" && (
                <Field label="Stock owner">
                  <select name="patient" required>
                    {options()}
                  </select>
                </Field>
              )}
              <p class="form-note">
                New lots start at zero. Record a receipt to add stock and
                preserve its movement history.
              </p>
            </>
          )}
          {editor.kind === "movement" && (
            <>
              <p class="form-note">
                <strong>Lot {editor.lot?.lotNumber}</strong> ·{" "}
                {editor.lot?.onHand} on hand · {editor.lot?.reserved} reserved
              </p>
              {editor.original ? (
                <p class="form-note">
                  Reverses the original {editor.original.kind} entry. Quantities
                  and the patient link are preserved automatically.
                </p>
              ) : (
                <>
                  <Field label="Movement">
                    <select
                      value={kind}
                      onChange={(e) => setKind(e.currentTarget.value)}
                    >
                      {(canManage
                        ? [
                            "receive",
                            "reserve",
                            "release",
                            "use",
                            "waste",
                            "adjust",
                          ]
                        : ["reserve", "release", "use"]
                      ).map((k) => (
                        <option value={k}>
                          {
                            {
                              receive: "Receive stock",
                              reserve: "Reserve for patient",
                              release: "Release reservation",
                              use: "Record use of reserved stock",
                              waste: "Record unreserved waste",
                              adjust: "Reconcile stock count",
                            }[k]
                          }
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label={
                      kind === "adjust"
                        ? "Quantity change (+ add / − remove)"
                        : "Quantity in whole stock units"
                    }
                  >
                    <input
                      name="quantity"
                      type="number"
                      step="1"
                      min={kind === "adjust" ? "-1000000" : "1"}
                      max="1000000"
                      required
                      defaultValue="1"
                    />
                  </Field>
                  {editor.lot?.ownerPatientId ? (
                    <p class="form-note">
                      Patient-owned supply:{" "}
                      {
                        data.patients.find(
                          (p) => p.id === editor.lot?.ownerPatientId,
                        )?.displayName
                      }
                    </p>
                  ) : (
                    <Field
                      label={
                        ["reserve", "release", "use"].includes(kind)
                          ? "Patient"
                          : "Patient link (optional)"
                      }
                    >
                      <select
                        name="patient"
                        required={["reserve", "release", "use"].includes(kind)}
                      >
                        {options(editor.patient?.id)}
                      </select>
                    </Field>
                  )}
                </>
              )}
              <Field label="Reason / operational reference">
                <textarea name="reason" required maxLength={300} rows={3} />
              </Field>
              {kind === "use" && (
                <p class="form-note">
                  Requires stock reserved for this patient. This records
                  inventory use only; confirm administration and document care
                  in Tebra.
                </p>
              )}
            </>
          )}
          {editor.kind === "handoff" && (
            <>
              <p class="form-note">
                <strong>{editor.patient?.displayName}</strong> ·{" "}
                {editor.activity?.service}
              </p>
              <Field label="Service progress">
                <select
                  name="status"
                  value={serviceStatus}
                  onChange={(e) =>
                    setServiceStatus(
                      e.currentTarget.value as Activity["status"],
                    )
                  }
                >
                  <option value="planned">Planned</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                </select>
              </Field>
              <Field label="Tebra documentation handoff">
                <select
                  name="handoff"
                  value={handoffStatus}
                  onChange={(e) =>
                    setHandoffStatus(
                      e.currentTarget.value as Activity["handoff"],
                    )
                  }
                >
                  <option value="pending">Not prepared</option>
                  <option value="prepared">Prepared · not yet filed</option>
                  <option value="filed">
                    I confirmed it was filed in Tebra
                  </option>
                </select>
              </Field>
              <Field label="Tebra filing reference (required only when filed)">
                <input
                  name="reference"
                  maxLength={200}
                  placeholder="Encounter date / document reference"
                />
              </Field>
              <p class="form-note">
                Prepared is a staff-reported status. This build does not
                generate notes or upload to Tebra. Filed handoffs cannot be
                overwritten.
              </p>
            </>
          )}
        </div>
        <div class="dialog-footer">
          <button
            type="button"
            class="button secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button class="button primary" type="submit" disabled={saving}>
            {saving
              ? "Saving…"
              : editor.kind === "movement"
                ? "Save movement"
                : "Save"}
            <Icon name="check" size={17} />
          </button>
        </div>
      </form>
    </dialog>
  );
}
