import { describe, expect, it } from "vitest";

import {
  DOCUMENTATION_DIVIDER,
  DocumentationEngine,
  formatFormsDocumentation,
  formatInjectionDocumentation,
  formatSamplesDocumentation,
  formatUdsDocumentation,
} from "../../src/documentation";
import type { ClinicalEvaluation } from "../../src/domain/contracts";

describe("dense SmartPhrase documentation", () => {
  it("formats a routine injection into the existing three Tebra section bodies", () => {
    const note = formatInjectionDocumentation({
      chiefComplaint: {
        summary: "Maintenance LAI visit — Abilify Maintena 400 mg.",
        visitType: "Maintenance injection",
        purpose: "Scheduled LAI",
        encounterDate: "Jul 30, 2026",
      },
      disposition: { kind: "administered" },
      preAdministration: {
        orderPurpose: "Scheduled maintenance dose",
        orderVerification: "Active order matched to patient and product",
        previousDoseDate: "Jul 2, 2026",
        previousSite: "Right deltoid",
        timingReview: "28 days since previous dose; within ordered interval",
        allergiesReview: "Reviewed with patient",
        vitals: {
          bloodPressure: "118/74",
          heartRate: "72",
          temperature: "98.4 °F",
        },
        reviewItems: [
          "Patient identity and medication rights verified.",
          "Left deltoid selected for site rotation.",
        ],
      },
      components: [
        {
          medication: "Abilify Maintena",
          dose: "400 mg",
          route: "IM",
          site: "Left deltoid",
          administrationDate: "Jul 30, 2026",
          administrationTime: "9:14 AM",
          administeredBy: "M. Yglesias, MA",
          response: "Tolerated without immediate concern reported by staff.",
          ndc: "59148-072-80",
          lot: "A24031",
          expiration: "03/2028",
        },
      ],
      followUp: {
        nextDoseDate: "Aug 27, 2026",
        orderingProvider: "J. Clinician, PMHNP",
        appointmentStatus: "Return date reviewed with patient",
      },
    });

    expect(note.cc).toBe(
      [
        "Maintenance LAI visit — Abilify Maintena 400 mg.",
        "",
        "Visit: Maintenance injection",
        "Purpose: Scheduled LAI",
        "Encounter date: Jul 30, 2026",
      ].join("\n"),
    );
    expect(note.assessment).toBe(
      [
        "PRE-ADMINISTRATION REVIEW",
        "Active-order purpose / encounter context: Scheduled maintenance dose",
        "Order verification: Active order matched to patient and product",
        "Previous dose date: Jul 2, 2026",
        "Previous injection site: Right deltoid",
        "Timing review: 28 days since previous dose; within ordered interval",
        "Allergies: Reviewed with patient",
        "Vitals: BP 118/74 · HR 72 · Temp 98.4 °F",
        "• Patient identity and medication rights verified.",
        "• Left deltoid selected for site rotation.",
      ].join("\n"),
    );
    expect(note.plan).toBe(
      [
        "MEDICATION ADMINISTRATION",
        "→ Abilify Maintena",
        "  Medication: Abilify Maintena",
        "  Dose: 400 mg",
        "  Route: IM",
        "  Site: Left deltoid",
        "  Administration date: Jul 30, 2026",
        "  Actual administration time: 9:14 AM",
        "  Administered by: M. Yglesias, MA",
        "  Response: Tolerated without immediate concern reported by staff.",
        "",
        "PRODUCT TRACEABILITY",
        "→ Abilify Maintena",
        "  Medication: Abilify Maintena",
        "  Dose: 400 mg",
        "  NDC / product code: 59148-072-80",
        "  Lot: A24031",
        "  Expiration: 03/2028",
        "",
        "FOLLOW-UP",
        "Next dose due: Aug 27, 2026",
        "Ordering provider: J. Clinician, PMHNP",
        "Appointment status: Return date reviewed with patient",
      ].join("\n"),
    );
    expect(note.sections.map((section) => section.destination)).toEqual([
      "CC",
      "Assessment",
      "Plan",
    ]);
    expect(note.all).toBe(
      [note.cc, note.assessment, note.plan].join(
        `\n\n${DOCUMENTATION_DIVIDER}\n\n`,
      ),
    );
    expect(note.all).not.toMatch(/^(CC|ASSESSMENT|PLAN)$/m);
  });

  it("uses a disposition-safe non-administration note even if product fields were entered", () => {
    const note = formatInjectionDocumentation({
      chiefComplaint: {
        summary: "Injection visit requiring provider review.",
      },
      disposition: {
        kind: "held",
        reason: "Blood pressure exceeded the provider-defined parameter.",
        notified: "A. Provider, PMHNP",
        decisionTime: "Jul 30, 2026 at 10:42 AM",
        direction: "Hold today and repeat blood pressure after rest.",
        nextStep: "Clinic will contact patient after provider reassessment.",
      },
      components: [
        {
          medication: "Aristada",
          dose: "882 mg",
          route: "IM",
          site: "Left gluteal",
          administrationTime: "10:35 AM",
          administeredBy: "M. Yglesias, MA",
          ndc: "65757-403-03",
          lot: "L24008",
          expiration: "01/2028",
        },
      ],
    });

    expect(note.plan).toBe(
      [
        "DISPOSITION — MEDICATION NOT ADMINISTERED",
        "Disposition: Held",
        "Reason: Blood pressure exceeded the provider-defined parameter.",
        "Provider / recipient notified: A. Provider, PMHNP",
        "Contact / decision time: Jul 30, 2026 at 10:42 AM",
        "Direction / outcome: Hold today and repeat blood pressure after rest.",
        "Next step: Clinic will contact patient after provider reassessment.",
        "",
        "PRODUCT IDENTIFICATION",
        "→ Aristada",
        "  Medication: Aristada",
        "  Dose: 882 mg",
        "  NDC / product code: 65757-403-03",
        "  Lot: L24008",
        "  Expiration: 01/2028",
      ].join("\n"),
    );
    expect(note.plan).not.toContain("MEDICATION ADMINISTRATION");
    expect(note.plan).not.toContain("Actual administration time");
    expect(note.plan).not.toContain("Administered by");
  });

  it("documents paired aripiprazole initiation as two separately traceable injections", () => {
    const note = formatInjectionDocumentation({
      disposition: { kind: "administered" },
      components: [
        {
          label: "Initio component",
          medication: "Aristada Initio",
          dose: "675 mg",
          route: "IM",
          site: "Right deltoid",
          administrationTime: "11:02 AM",
          ndc: "65757-050-03",
          lot: "I24011",
          expiration: "04/2028",
        },
        {
          label: "Maintenance component",
          medication: "Aristada",
          dose: "882 mg",
          route: "IM",
          site: "Left gluteal",
          administrationTime: "11:07 AM",
          ndc: "65757-403-03",
          lot: "A24019",
          expiration: "06/2028",
        },
      ],
      initiation: {
        kind: "aripiprazole-two-injection",
        orderVerification:
          "Active one-day initiation order and current product information verified",
        oralDose: "Aripiprazole 30 mg PO once",
        notes: [
          "Separate anatomical sites used for the two injection components.",
        ],
      },
    });

    expect(note.plan).toContain(
      [
        "MEDICATION ADMINISTRATION",
        "→ Component 1: Initio component",
        "  Medication: Aristada Initio",
        "  Dose: 675 mg",
        "  Route: IM",
        "  Site: Right deltoid",
        "  Actual administration time: 11:02 AM",
        "→ Component 2: Maintenance component",
        "  Medication: Aristada",
        "  Dose: 882 mg",
        "  Route: IM",
        "  Site: Left gluteal",
        "  Actual administration time: 11:07 AM",
      ].join("\n"),
    );
    expect(note.plan).toContain(
      [
        "INITIATION PROTOCOL",
        "Protocol: Aripiprazole one-day initiation · two separate injections",
        "Order verification: Active one-day initiation order and current product information verified",
        "Ordered oral dose: Aripiprazole 30 mg PO once",
        "• Separate anatomical sites used for the two injection components.",
      ].join("\n"),
    );
    expect(note.plan.match(/NDC \/ product code:/g)).toHaveLength(2);
    expect(note.plan.match(/Lot:/g)).toHaveLength(2);
    expect(note.plan.match(/Expiration:/g)).toHaveLength(2);
  });

  it("formats the supplied Sustenna Day 8 target and window without recalculating them", () => {
    const note = formatInjectionDocumentation({
      disposition: { kind: "administered" },
      components: [
        {
          medication: "Invega Sustenna",
          dose: "156 mg",
          route: "IM",
          site: "Left deltoid",
        },
      ],
      initiation: {
        kind: "sustenna-day-8",
        orderVerification:
          "Day 1 record and active Day 8 provider order verified",
        day1Date: "Jul 23, 2026",
        day8TargetDate: "Jul 30, 2026",
        windowStart: "Jul 26, 2026",
        windowEnd: "Aug 3, 2026",
        scheduledOrAdministeredDate: "Jul 30, 2026",
        timingReview: "Given on target date",
      },
    });

    expect(note.plan).toContain(
      [
        "INITIATION PROTOCOL",
        "Protocol: Invega Sustenna Day 8 initiation",
        "Order verification: Day 1 record and active Day 8 provider order verified",
        "Day 1 administration date: Jul 23, 2026",
        "Day 8 target: Jul 30, 2026",
        "Permitted window: Jul 26, 2026 → Aug 3, 2026",
        "Scheduled / administered date: Jul 30, 2026",
        "Timing review: Given on target date",
      ].join("\n"),
    );
  });

  it("retains product issue and escalation notification, time, direction, and next step", () => {
    const note = formatInjectionDocumentation({
      disposition: { kind: "administered" },
      components: [{ medication: "Perseris", dose: "120 mg" }],
      handling: {
        productIssue: "Syringe resistance noted after administration began.",
        productIssueAction:
          "Administration stopped; remaining product quarantined per clinic process.",
      },
      exception: {
        summary: "Incomplete dose suspected.",
        notified: "B. Clinician, MD",
        notificationTime: "Jul 30, 2026 at 1:18 PM",
        direction: "Do not repeat dose today.",
        nextStep:
          "Provider will determine follow-up after product investigation.",
      },
    });

    expect(note.plan).toContain(
      [
        "PRODUCT / DEVICE ISSUE",
        "Issue: Syringe resistance noted after administration began.",
        "Action / disposition: Administration stopped; remaining product quarantined per clinic process.",
        "",
        "EXCEPTION / ESCALATION",
        "Event: Incomplete dose suspected.",
        "Notification: B. Clinician, MD",
        "Notification / decision time: Jul 30, 2026 at 1:18 PM",
        "Direction / action: Do not repeat dose today.",
        "Next step: Provider will determine follow-up after product investigation.",
      ].join("\n"),
    );
  });

  it("writes the UDS screen as one chart encounter note", () => {
    const note = formatUdsDocumentation({
      collection: {
        reason: "Routine monitoring",
        collectedAt: "7/30/26 0848",
        collectedBy: "M. Yglesias, MA",
        specimen: "Urine",
        device: "Integrated 14-panel cup",
        lot: "UDS24071",
        expiration: "12/2027",
        temperature: "Acceptable",
      },
      controlReview: {
        control: "Valid control line",
        controlState: "valid",
        validity: "acceptable",
        validityState: "acceptable",
        integrity: ["Physical cup and displayed panel readings verified."],
      },
      resultGroups: [
        {
          label: "Point-of-care panel results",
          results: [
            { analyte: "AMP", result: "Negative", state: "neg" },
            { analyte: "MET", result: "Preliminary positive", state: "pos" },
            { analyte: "OPI", result: "Negative", state: "neg" },
          ],
        },
      ],
      medicationAlignmentState: "not aligned",
      patientContext: "Patient reports no non-prescribed stimulant use.",
      outsideLabPlanState: "recommended",
    });

    // One block, in the chart's own voice: a line that stands alone, the
    // objective record, then what happens next. No section headings, no
    // bulleted worksheet transcription, and no patient identity - the chart
    // this is pasted into already knows whose it is.
    expect(note.text).toBe(
      [
        "POC urine drug screen — routine monitoring; Integrated 14-panel cup; +MET, all other tested panels negative; validity acceptable; provider review requested.",
        "",
        "Collection: Urine specimen collected 7/30/26 0848 by M. Yglesias, MA; temperature acceptable.",
        "Device: Integrated 14-panel cup · Lot UDS24071 · Exp 12/2027.",
        "Quality control: Valid control line; validity markers acceptable. Physical cup and displayed panel readings verified.",
        "",
        "Results (preliminary/presumptive): MET preliminary positive. Negative — AMP, OPI.",
        "",
        "Medication alignment: Result is not explained by the available medication list; clinician review requested.",
        "Patient context: Patient reports no non-prescribed stimulant use.",
        "",
        "Plan: Point-of-care immunoassay result; confirm unexpected findings by definitive laboratory method. Preliminary positive finding(s) routed for provider review in clinical context. Outside laboratory confirmation recommended if clinically indicated.",
      ].join("\n"),
    );
    expect(note.sections).toHaveLength(1);
    expect(note.sections[0]?.id).toBe("uds-note");
    expect(note.headline).toBe(
      "POC urine drug screen — routine monitoring; Integrated 14-panel cup; +MET, all other tested panels negative; validity acceptable; provider review requested.",
    );
  });

  it("names an unreadable panel and refuses to summarize a screen with no readings", () => {
    const unreadable = formatUdsDocumentation({
      collection: { reason: "Provider ordered", device: "14-panel cup" },
      controlReview: {
        control: "Valid control line",
        controlState: "valid",
        validityState: "needs review",
      },
      resultGroups: [
        {
          label: "Point-of-care panel results",
          results: [
            { analyte: "BZO", result: "Invalid / unreadable", state: "invalid" },
            { analyte: "AMP", result: "Negative", state: "neg" },
          ],
        },
      ],
    });
    expect(unreadable.headline).toBe(
      "POC urine drug screen — provider ordered; 14-panel cup; BZO invalid / unreadable, all other tested panels negative; validity markers require review; repeat or confirmation needed.",
    );
    expect(unreadable.text).toContain(
      "Results (preliminary/presumptive): BZO invalid / unreadable. Negative — AMP.",
    );
    expect(unreadable.text).toContain(
      "Repeat the affected panel(s) or use outside laboratory confirmation per provider direction.",
    );
    expect(unreadable.text).toContain(
      "Validity markers require provider review before interpretation.",
    );

    // Nothing about results, and no preliminary caveat, before a reading
    // exists to caveat.
    const waiting = formatUdsDocumentation({
      collection: { reason: "Routine monitoring", device: "14-panel cup" },
    });
    expect(waiting.text).toBe(
      [
        "POC urine drug screen — routine monitoring; 14-panel cup; results not yet documented.",
        "",
        "Device: 14-panel cup.",
      ].join("\n"),
    );
    expect(waiting.text).not.toMatch(/negative|immunoassay/i);
  });

  it("still reads a caller that predates result states, without inventing a reading", () => {
    const note = formatUdsDocumentation({
      summary: "Point-of-care UDS completed for medication monitoring.",
      collection: { device: "Integrated 14-panel cup" },
      resultGroups: [
        {
          label: "Stimulants",
          results: [
            { analyte: "AMP", result: "Negative" },
            { analyte: "MET", result: "Preliminary positive" },
            { analyte: "ETG", result: "Sent to reference laboratory" },
          ],
        },
      ],
      clinicianAttention: ["Preliminary MET positive requires provider review."],
      plan: ["Route result to ordering clinician for interpretation in clinical context."],
    });

    // An explicit summary stays the note's opening line, the canonical labels
    // still group, and a reading this formatter cannot classify is reported
    // exactly as the caller gave it rather than guessed at.
    expect(note.headline).toBe("Point-of-care UDS completed for medication monitoring.");
    expect(note.text).toContain(
      "Results (preliminary/presumptive): MET preliminary positive. Negative — AMP. ETG: Sent to reference laboratory.",
    );
    expect(note.text).toContain(
      "Clinician attention: Preliminary MET positive requires provider review.",
    );
    expect(note.text).toContain(
      "Route result to ordering clinician for interpretation in clinical context.",
    );
  });

  it("formats every physical sample package and explicit reviewed-today confirmation", () => {
    const note = formatSamplesDocumentation({
      summary: "Oral medication samples provided per prescriber direction.",
      patient: "A. Patient",
      dob: "04/18/1987",
      purpose: "Starter titration",
      prescriber: "J. Clinician, PMHNP",
      dispensedBy: "M. Yglesias, MA",
      packages: [
        {
          label: "Starter package",
          medication: "Vraylar",
          strength: "1.5 mg",
          dosageForm: "Capsules",
          quantity: "7 capsules",
          packageId: "Box 1 of 2",
          ndc: "61874-0115-11",
          lot: "V15071",
          expiration: "01/2028",
        },
        {
          label: "Continuation package",
          medication: "Vraylar",
          strength: "3 mg",
          dosageForm: "Capsules",
          quantity: "7 capsules",
          packageId: "Box 2 of 2",
          ndc: "61874-0130-11",
          lot: "V30092",
          expiration: "02/2028",
        },
      ],
      planSteps: [
        {
          medication: "Vraylar",
          strength: "1.5 mg",
          quantity: "7 capsules",
          dateRange: "Jul 31–Aug 6, 2026",
          directions: "Take 1 capsule by mouth daily as prescribed.",
        },
        {
          medication: "Vraylar",
          strength: "3 mg",
          quantity: "7 capsules",
          dateRange: "Aug 7–Aug 13, 2026",
          directions: "Then take 1 capsule by mouth daily as prescribed.",
        },
      ],
      counseling: [
        "Strength sequence and transition date reviewed with patient.",
      ],
      handoutStatus: "Provided",
      reviewedToday: {
        reviewedAt: "Jul 30, 2026 at 2:05 PM",
        reviewedBy: "M. Yglesias, MA",
      },
      followUp: ["Call clinic before changing the prescriber-directed sequence."],
    });

    expect(note.text).toContain(
      [
        "PACKAGE TRACEABILITY",
        "→ Starter package: Vraylar 1.5 mg",
        "  Medication: Vraylar",
        "  Strength: 1.5 mg",
        "  Dosage form: Capsules",
        "  Quantity / package: 7 capsules",
        "  Package identifier: Box 1 of 2",
        "  NDC / product code: 61874-0115-11",
        "  Lot: V15071",
        "  Expiration: 01/2028",
        "→ Continuation package: Vraylar 3 mg",
        "  Medication: Vraylar",
        "  Strength: 3 mg",
        "  Dosage form: Capsules",
        "  Quantity / package: 7 capsules",
        "  Package identifier: Box 2 of 2",
        "  NDC / product code: 61874-0130-11",
        "  Lot: V30092",
        "  Expiration: 02/2028",
      ].join("\n"),
    );
    expect(note.text).toContain(
      [
        "REVIEW CONFIRMATION",
        "Reviewed today: Jul 30, 2026 at 2:05 PM",
        "Reviewed by: M. Yglesias, MA",
      ].join("\n"),
    );
    expect(note.text.match(/Package identifier:/g)).toHaveLength(2);
  });

  it("formats a forms handoff without inventing approval or release", () => {
    const note = formatFormsDocumentation({
      summary: "Work-status letter request received.",
      patient: "A. Patient",
      dob: "04/18/1987",
      requestCategory: "Work / school",
      documentType: "Return-to-work letter",
      requestDate: "Jul 30, 2026",
      requestNotes: "Patient requests a return date of Aug 3.",
      status: "Provider review",
      assignedProvider: "J. Clinician, PMHNP",
      assignedStaff: "M. Yglesias, MA",
      targetDate: "Jul 31, 2026",
      deliveryMethod: "Patient portal after approval",
      patientNotification: "Patient advised request is under review",
      actions: ["Draft routed to assigned provider."],
      followUp: ["Release only after provider approval is documented."],
    });

    expect(note.text).toBe(
      [
        "Work-status letter request received.",
        "",
        "DOCUMENT / REQUEST",
        "Patient: A. Patient",
        "DOB: 04/18/1987",
        "Request category: Work / school",
        "Document type: Return-to-work letter",
        "Request date: Jul 30, 2026",
        "Request notes: Patient requests a return date of Aug 3.",
        "",
        "WORKFLOW STATUS",
        "Status: Provider review",
        "Assigned provider: J. Clinician, PMHNP",
        "Assigned staff: M. Yglesias, MA",
        "Due / target date: Jul 31, 2026",
        "Delivery / pickup: Patient portal after approval",
        "Patient notification: Patient advised request is under review",
        "",
        "ACTION / FOLLOW-UP",
        "→ Draft routed to assigned provider.",
        "→ Release only after provider approval is documented.",
      ].join("\n"),
    );
    expect(note.text).not.toContain("Approved");
    expect(note.text).not.toContain("Released");
  });

  it("omits empty conditional blocks and only charts explicit evaluation output", () => {
    const evaluation: ClinicalEvaluation<{
      documentation: { note: string[] };
    }> = {
      workflow: "uds",
      readiness: "blocked",
      stops: [
        {
          code: "control_missing",
          message: "Control must be documented before finalization.",
          severity: "stop",
        },
      ],
      warnings: [],
      recommendations: [],
      calculatedDates: {},
      output: {
        documentation: {
          note: ["Repeat collection per documented provider direction."],
        },
      },
    };

    const note = DocumentationEngine.format(
      "uds",
      { collection: { device: "14-panel cup" } },
      evaluation,
    );

    expect(note.text).toBe(
      [
        "POC urine drug screen — 14-panel cup; results not yet documented.",
        "",
        "Device: 14-panel cup.",
        "",
        "Plan: Repeat collection per documented provider direction.",
      ].join("\n"),
    );
    expect(note.text).not.toContain("Quality control");
    expect(note.text).not.toContain("Results (");
    expect(note.text).not.toContain("Control must be documented");
    expect(note.text).not.toContain("none documented");
    expect(note.text).not.toContain("negative");
  });
});

