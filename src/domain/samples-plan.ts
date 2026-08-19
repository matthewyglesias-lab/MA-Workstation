import type { SamplePackage, SamplePlanStep, SamplesEncounter } from "./samples";

export interface AdditionalSampleRow {
  id: string;
  strength: string;
  quantity: string;
  days: string;
  directions: string;
  lot: string;
  expiration: string;
}

export const patientIsEmpty = (patient: SamplesEncounter["patient"]): boolean =>
  !patient.name.trim() && !patient.dob.trim();

export const primaryPackage = (encounter: SamplesEncounter): SamplePackage =>
  encounter.packages.find((entry) => entry.id === "primary") ?? {
    id: "primary",
    label: "Primary package",
    medicationStrength: encounter.medicationLabel,
    quantity: encounter.quantity,
    lot: "",
    expiration: "",
  };

export const rowsFromEncounter = (encounter: SamplesEncounter): AdditionalSampleRow[] =>
  encounter.plan.map((step) => {
    const pkg = encounter.packages.find((entry) => entry.id === step.id);
    return {
      id: step.id,
      strength: step.strength,
      quantity: step.quantity,
      days: step.days ?? "",
      directions: step.directions,
      lot: pkg?.lot ?? "",
      expiration: pkg?.expiration ?? "",
    };
  });

export const buildPlanAndPackages = (
  medicationLabel: string,
  quantity: string,
  primaryLot: string,
  primaryExpiration: string,
  rows: AdditionalSampleRow[],
): { plan: SamplePlanStep[]; packages: SamplePackage[] } => {
  const plan: SamplePlanStep[] = rows.map((row) => ({
    id: row.id,
    strength: row.strength,
    quantity: row.quantity,
    days: row.days,
    directions: row.directions,
  }));
  const packages: SamplePackage[] = [
    {
      id: "primary",
      label: "Primary package",
      medicationStrength: medicationLabel,
      quantity,
      lot: primaryLot,
      expiration: primaryExpiration,
    },
    ...rows
      .filter((row) => row.quantity.trim())
      .map((row, index) => ({
        id: row.id,
        label: `Added package ${index + 2}`,
        medicationStrength: row.strength.trim() || medicationLabel,
        quantity: row.quantity,
        lot: row.lot,
        expiration: row.expiration,
      })),
  ];
  return { plan, packages };
};
