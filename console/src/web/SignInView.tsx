import { useState } from "preact/hooks";
import type { RuntimeInfo } from "../shared/contracts.js";
import { signIn } from "./api.js";
import { ErrorText, Field } from "./components.js";
function savedStaff() {
  try {
    return localStorage.getItem("console.staffCode") || "";
  } catch {
    return "";
  }
}
export function SignInView({
  config,
  onSignedIn,
}: {
  config: RuntimeInfo;
  onSignedIn: () => Promise<void>;
}) {
  const synthetic = config.mode !== "sql";
  const [staffCode, setStaffCode] = useState(synthetic ? "demo" : savedStaff());
  const [changeStaff, setChangeStaff] = useState(!staffCode);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(staffCode.trim(), pin);
      try {
        if (!synthetic)
          localStorage.setItem("console.staffCode", staffCode.trim());
      } catch {
        /* Storage is optional. */
      }
      setPin("");
      await onSignedIn();
    } catch (e) {
      setError((e as Error).message);
      setPin("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main class="signin-page">
      <section class="signin-card" aria-labelledby="signin-title">
        <p class="eyebrow">INLAND PSYCHIATRIC</p>
        <h1 id="signin-title">Clinic console</h1>
        <p class="signin-intro">Sign in to your workspace.</p>
        <form onSubmit={submit}>
          {config.authMode !== "entra" && (
            <>
              {changeStaff ? (
                <Field label="Staff ID">
                  <input
                    name="username"
                    autoComplete="username"
                    autoFocus
                    value={staffCode}
                    maxLength={64}
                    required
                    onInput={(e) => setStaffCode(e.currentTarget.value)}
                  />
                </Field>
              ) : (
                <div class="signin-staff">
                  <span>{staffCode}</span>
                  <button
                    type="button"
                    class="text-button"
                    onClick={() => {
                      setChangeStaff(true);
                      setPin("");
                    }}
                  >
                    Change staff
                  </button>
                </div>
              )}
              <Field label="PIN">
                <input
                  name="password"
                  type="password"
                  inputMode="numeric"
                  autoComplete="current-password"
                  autoFocus={!changeStaff}
                  pattern="[0-9]{4,12}"
                  minLength={4}
                  maxLength={12}
                  required
                  value={pin}
                  onInput={(e) =>
                    setPin(e.currentTarget.value.replace(/\D/g, ""))
                  }
                />
              </Field>
            </>
          )}
          <ErrorText error={error} />
          <button class="button primary signin-submit" disabled={busy}>
            {busy
              ? "Signing in…"
              : config.authMode === "entra"
                ? "Sign in with Microsoft"
                : "Sign in"}
          </button>
        </form>
        {synthetic && (
          <p class="signin-demo">
            Preview PIN: <strong>123456</strong> · fictional patients only
          </p>
        )}
      </section>
    </main>
  );
}
