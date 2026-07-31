import { describe, expect, it } from "vitest";

import {
  legacyInjectionResponseFact,
  mapLegacyInitiationProtocol,
  readLegacyFormsDocumentation,
  readLegacySamplesDocumentation,
} from "../../src/legacy/documentation-adapter";

describe("legacy dense-documentation adapter", () => {
  it("preserves the selected injection response without inventing negative findings", () => {
    expect(legacyInjectionResponseFact("Tolerated well")).toBe(
      "Tolerated well",
    );
    expect(legacyInjectionResponseFact("Minor bleeding, controlled")).toBe(
      "Minor bleeding, controlled",
    );
    expect(legacyInjectionResponseFact("Mild site discomfort")).toBe(
      "Mild site discomfort",
    );

    const formatted = [
      legacyInjectionResponseFact("Tolerated well"),
      legacyInjectionResponseFact("Minor bleeding, controlled"),
      legacyInjectionResponseFact("Mild site discomfort"),
    ].join("\n");
    expect(formatted).not.toMatch(
      /no (?:immediate complication|swelling)|without acute reaction/i,
    );
  });

  it("uses the exact entered custom response in preference to a selected preset", () => {
    expect(
      legacyInjectionResponseFact(
        "Tolerated well",
        "  Local redness observed; provider notified.  ",
      ),
    ).toBe("Local redness observed; provider notified.");
  });

  it("does not invent a provider-approval release instruction from Forms status", () => {
    const selected = (text: string) => ({
      textContent: text,
      querySelector: () => ({ textContent: text }),
    });
    const controls: Record<string, object> = {
      formsPtName: { value: "QA, Forms" },
      formsDate: { value: "2026-07-30" },
      formsDue: { value: "2026-08-01" },
      formsFee: {
        value: "No fee / not applicable",
        selectedOptions: [{ textContent: "No fee / not applicable" }],
      },
      formsNotified: {
        value: "Not yet notified",
        selectedOptions: [{ textContent: "Not yet notified" }],
      },
      formsDelivery: {
        value: "Patient pickup",
        selectedOptions: [{ textContent: "Patient pickup" }],
      },
    };
    const selections: Record<string, object> = {
      "#formsTypeGrid .form-kind.on": selected("Records / other"),
      "#letterTypeChips .letter-chip.on": selected("Medical records request"),
      "#formsStatusChips .form-status.on": selected("Provider review"),
    };
    const doc = {
      getElementById: (id: string) => controls[id] ?? null,
      querySelector: (selector: string) => selections[selector] ?? null,
    } as unknown as Document;

    const input = readLegacyFormsDocumentation(doc);

    expect(input).toMatchObject({
      patient: "QA, Forms",
      status: "Provider review",
      deliveryMethod: "Patient pickup",
    });
    expect(input?.approvalStatus).toBeUndefined();
    expect(input?.actions).toBeUndefined();
  });

  it("maps only explicitly documented Forms actions, approval, and follow-up", () => {
    const selected = (text: string) => ({
      textContent: text,
      querySelector: () => ({ textContent: text }),
    });
    const controls: Record<string, object> = {
      formsPtName: { value: "QA, Forms" },
      formsDate: { value: "2026-07-30" },
      formsApproval: {
        value: "Provider approved for release",
        selectedOptions: [{ textContent: "Provider approved for release" }],
      },
      formsAction: { value: "Draft routed to release queue." },
      formsFollowUp: { value: "Staff to notify patient today." },
      formsFee: {
        value: "No fee / not applicable",
        selectedOptions: [{ textContent: "No fee / not applicable" }],
      },
      formsNotified: {
        value: "Not yet notified",
        selectedOptions: [{ textContent: "Not yet notified" }],
      },
      formsDelivery: {
        value: "Patient pickup",
        selectedOptions: [{ textContent: "Patient pickup" }],
      },
    };
    const selections: Record<string, object> = {
      "#formsTypeGrid .form-kind.on": selected("Records / other"),
      "#letterTypeChips .letter-chip.on": selected("Medical records request"),
      "#formsStatusChips .form-status.on": selected("Ready"),
    };
    const doc = {
      getElementById: (id: string) => controls[id] ?? null,
      querySelector: (selector: string) => selections[selector] ?? null,
    } as unknown as Document;

    expect(readLegacyFormsDocumentation(doc)).toMatchObject({
      approvalStatus: "Provider approved for release",
      actions: ["Draft routed to release queue."],
      followUp: ["Staff to notify patient today."],
    });
  });

  it("maps explicit sample handout and follow-up status and omits blank defaults", () => {
    const controls: Record<string, object> = {
      samplePtName: { value: "QA, Samples" },
      sampleDOB: { value: "01/02/1990" },
      sampleHandoutStatus: {
        value: "Printed and provided",
        selectedOptions: [{ textContent: "Printed and provided" }],
      },
      sampleFollowUp: { value: "Call after pharmacy benefit review." },
    };
    const doc = {
      getElementById: (id: string) => controls[id] ?? null,
      querySelector: () => null,
      querySelectorAll: () => [],
    } as unknown as Document;
    const win = {
      samplePackageTraceEntries: () => [],
      sampleDoseEntries: () => [],
      sampleReviewConfirmationCurrent: () => false,
    } as unknown as Window;

    expect(readLegacySamplesDocumentation(doc, win)).toMatchObject({
      handoutStatus: "Printed and provided",
      followUp: ["Call after pharmacy benefit review."],
    });

    controls.sampleHandoutStatus = {
      value: "",
      selectedOptions: [{ textContent: "Not separately documented" }],
    };
    controls.sampleFollowUp = { value: "" };
    const blankOptional = readLegacySamplesDocumentation(doc, win);
    expect(blankOptional?.handoutStatus).toBeUndefined();
    expect(blankOptional?.followUp).toBeUndefined();
  });

  it("preserves paired aripiprazole as a separately traceable second injection", () => {
    const mapped = mapLegacyInitiationProtocol(
      {
        protocol: "aristada-initio-sameday",
        planVerified: true,
        oralStatus: "administered",
        second: {
          dose: "675 mg",
          site: "R deltoid",
          ndc: "65757-050-03",
          lot: "I24011",
          exp: "2028-04",
          given: true,
          orderVerified: true,
          note: "Kit prepared per product instructions.",
        },
      },
      "Aristada 882 mg",
      "2026-07-30",
      "11:07",
      "Aristada INITIO + first ARISTADA, same encounter",
    );

    expect(mapped.protocol).toMatchObject({
      kind: "aripiprazole-two-injection",
      label: "Aristada INITIO + first ARISTADA, same encounter",
      orderVerification:
        "Active provider initiation / re-initiation order and current product information verified",
      oralDose:
        "Aripiprazole 30 mg PO once — documented as administered today",
    });
    expect(mapped.protocol?.notes).toEqual([
      "Component 2 product and exact dose verified against the active order.",
      "Component 2 note: Kit prepared per product instructions.",
    ]);
    expect(mapped.protocol?.day8TargetDate).toBeUndefined();
    expect(mapped.protocol?.windowStart).toBeUndefined();
    expect(mapped.protocol?.windowEnd).toBeUndefined();
    expect(mapped.secondComponent).toEqual({
      label: "Injection component 2",
      medication: "Aristada Initio",
      dose: "675 mg",
      route: "IM",
      site: "R deltoid",
      administrationTime: "11:07 AM",
      ndc: "65757-050-03",
      lot: "I24011",
      expiration: "04/2028",
    });
  });

  it("never emits a second injection component until legacy state confirms it was given", () => {
    const mapped = mapLegacyInitiationProtocol(
      {
        protocol: "maintena-1day",
        planVerified: true,
        oralStatus: "verified",
        second: {
          dose: "400 mg",
          site: "L deltoid",
          ndc: "59148-072-80",
          lot: "A24031",
          exp: "2028-03",
          given: false,
          orderVerified: true,
        },
      },
      "Abilify Maintena",
      "2026-07-30",
      "",
    );

    expect(mapped.protocol?.kind).toBe("aripiprazole-two-injection");
    expect(mapped.protocol?.oralDose).toBe(
      "Aripiprazole 20 mg PO once — verified in active record / eMAR",
    );
    expect(mapped.secondComponent).toBeUndefined();
  });

  it("carries the existing Sustenna Day 8 target and ±4-day window into documentation", () => {
    const mapped = mapLegacyInitiationProtocol(
      {
        protocol: "sustenna-day8",
        planVerified: true,
        sustennaOrder: "standard",
        day1Date: "2026-07-23",
      },
      "Invega Sustenna",
      "2026-07-30",
      "",
    );

    expect(mapped.protocol).toEqual({
      kind: "sustenna-day-8",
      label: "Invega Sustenna Day 8 initiation",
      orderVerification:
        "Active provider initiation / re-initiation order and current product information verified",
      oralDose: undefined,
      oralPlan: undefined,
      day1Date: "Jul 23, 2026",
      day8TargetDate: "Jul 30, 2026",
      windowStart: "Jul 26, 2026",
      windowEnd: "Aug 3, 2026",
      scheduledOrAdministeredDate: "Jul 30, 2026",
      timingReview:
        "Administration date is within the displayed ±4-day window.",
      notes: ["Ordered initiation category: Standard order."],
    });
  });
});
