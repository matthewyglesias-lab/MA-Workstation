import { useState } from "preact/hooks";
import type { InjectionCase } from "../shared/injections.js";
import { Field } from "./components.js";

export function InjectionOrderContext({ record }: { record?: InjectionCase }) {
  const context = record?.clinicalContext;
  const [scheduleUnit, setScheduleUnit] = useState(
    context?.schedule?.unit || "",
  );
  return (
    <section class="form-section order-context">
      <h3>Treatment context</h3>
      <div class="form-grid">
        <Field label="Treatment phase">
          <select name="phase" required defaultValue={context?.phase || ""}>
            <option value="">Select the ordered pathway</option>
            <option value="maintenance">Maintenance</option>
            <option value="initiation">Initiation — other pathway</option>
            <option value="day_1">Initiation — Day 1</option>
            <option value="day_8">Initiation — Day 8</option>
            <option value="restart">Restart / re-initiation</option>
            <option value="switching">Transition from another treatment</option>
          </select>
        </Field>
        <Field label="Indication per order">
          <input
            name="indication"
            maxLength={500}
            defaultValue={context?.indication || ""}
            placeholder="Record if available in the verified order"
          />
        </Field>
      </div>
      <div class="form-grid">
        <Field label="Ordered interval unit">
          <select
            name="scheduleUnit"
            value={scheduleUnit}
            onChange={(e) => setScheduleUnit(e.currentTarget.value)}
          >
            <option value="">Use the provider’s dated plan</option>
            <option value="days">Days</option>
            <option value="weeks">Weeks</option>
            <option value="months">Calendar months</option>
          </select>
        </Field>
        {scheduleUnit && (
          <Field label="Repeat every">
            <input
              name="scheduleEvery"
              type="number"
              min="1"
              max="365"
              step="1"
              required
              defaultValue={context?.schedule?.every}
            />
          </Field>
        )}
      </div>
      <p class="field-help">
        Record the interval exactly as ordered. Calendar months and a fixed
        number of weeks are different.
      </p>
      <div class="form-grid">
        <Field label="Previous product / formulation">
          <input
            name="priorProduct"
            maxLength={200}
            defaultValue={context?.priorProduct || ""}
          />
        </Field>
        <Field label="Previous dose and units">
          <input
            name="priorDose"
            maxLength={200}
            defaultValue={context?.priorDose || ""}
          />
        </Field>
      </div>
      <Field label="History source">
        <input
          name="historySource"
          maxLength={1000}
          defaultValue={context?.historySource || ""}
          placeholder="Tebra MAR/date, external administration record, or history requiring confirmation"
        />
      </Field>
      <Field label="Shared treatment plan reference (optional)">
        <input
          name="linkedPlan"
          maxLength={1000}
          defaultValue={context?.linkedPlan || ""}
          placeholder="Same reference for separately tracked initiation components"
        />
      </Field>
      <p class="field-help">
        Use a separate injection record for each physical injection. A shared
        plan reference links the records for review; it does not record another
        component as given.
      </p>
    </section>
  );
}
