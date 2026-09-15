import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { Overview } from "../../../src/shared/contracts.js";
import type { InjectionCase } from "../../../src/shared/injections.js";
import { InjectionWorkspace } from "../../../src/web/InjectionWorkspace.js";
import { EditorDialog } from "../../../src/web/EditorDialog.js";
import { ErrorText } from "../../../src/web/components.js";
import {
  fixtureActor,
  fixtureTimezone,
  getInjections,
  getOverview,
  initializeFixture,
} from "./api.js";
import "../../../src/web/fonts.css";
import "../../../src/web/style.css";
import "./style.css";

function ClinicalFixture() {
  const [data, setData] = useState<Overview>();
  const [records, setRecords] = useState<InjectionCase[]>([]);
  const [error, setError] = useState("");
  const [linking, setLinking] = useState(false);
  const [generation, setGeneration] = useState(0);
  async function refresh() {
    const [overview, injections] = await Promise.all([
      getOverview(),
      getInjections(),
    ]);
    setData(overview);
    setRecords(injections);
  }
  async function reset() {
    try {
      setData(undefined);
      setError("");
      setLinking(false);
      await initializeFixture();
      await refresh();
      setGeneration((value) => value + 1);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  useEffect(() => {
    void reset();
  }, []);
  return (
    <div class="clinical-component-fixture app-shell">
      <header class="fixture-banner">
        <div>
          <strong>Clinical workflow test fixture</strong>
          <p>
            Fictional records · changes stay in this page · no account system or
            live API
          </p>
        </div>
        <button
          type="button"
          class="button secondary"
          onClick={() => void reset()}
        >
          Reset fixture
        </button>
      </header>
      <main class="fixture-content">
        <ErrorText error={error} />
        {!data && !error && (
          <p role="status">Preparing synthetic clinical encounters…</p>
        )}
        {data && (
          <>
            <p class="fixture-scenarios">
              Avery Chen: maintenance review and administration. Riley Bennett:
              completed note and AVS under “To file.”
            </p>
            <InjectionWorkspace
              key={generation}
              data={data}
              records={records}
              actor={fixtureActor}
              timezone={fixtureTimezone}
              onRefresh={refresh}
              onLinkPatient={() => setLinking(true)}
            />
            {linking && (
              <EditorDialog
                editor={{ kind: "patient" }}
                data={data}
                canManage
                onClose={() => setLinking(false)}
                onSaved={async () => {
                  setLinking(false);
                  await refresh();
                }}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
render(<ClinicalFixture />, document.getElementById("fixture-root")!);
