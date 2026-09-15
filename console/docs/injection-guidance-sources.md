# Injection guidance source audit

Version `2026-09-15.1`, reviewed 2026-09-15. The new console guide is an independently reviewed reference layer; it does not import the legacy workstation's dose calculations, timing windows, needle resolver, or completed-verification prose. The active Tebra order and verified history remain authoritative.

`src/shared/injection-guidance.ts` contains concise preparation, needle, clinical-review, incomplete-delivery, and aftercare prompts. Each resolved guide has a product ID, immutable version identity, source URL, and reviewed date. Responses to clinical checks must be entered explicitly. Displaying a reference or generating an AVS does not establish that a review, examination, administration, or counseling occurred.

English aftercare is a concise paraphrase; Spanish is its translation. Antipsychotic aftercare includes urgent symptom actions, prompt reporting of new uncontrolled movements, and applicable dizziness/driving precautions, with formulation-specific instructions retained. The warning and patient-counseling sections were rechecked for this addition. These instructions supplement the product Medication Guide and individualized discharge plan. Kit preparation summaries require the complete illustrated product instructions at the point of preparation; they are not standalone administration protocols.

The following primary sources were opened and the relevant administration and counseling sections checked during this change:

| Reference                                                                                                                     | Sections                                         |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| [Aristada Initio](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=b18fdfd9-31cd-4a2f-9f1c-ebc70d7a9403)              | 2.1–2.4, 5, 17                                   |
| [Aristada](https://labeling.alkermes.com/uspi_aristada.pdf)                                                                   | 2.1–2.5, 5, 17                                   |
| [Invega Sustenna](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=1af14e42-951d-414d-8564-5d5fce138554)              | 2.1–2.7, 5, 17                                   |
| [Invega Trinza](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=c39e65d7-fa44-4e4c-8b12-a654d3ed0eae)                | 2.1–2.8, 5, 17                                   |
| [Invega Hafyera](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=6cd61892-d2cb-434d-83ed-5c1b2c4e7a0b)               | 2.1–2.5, 5, 17                                   |
| [Erzofri](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=492bf9dd-868e-421a-92db-8cca8973aac1)                      | 2.1–2.7, 5, 17                                   |
| [Abilify Maintena](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee49f3b1-1650-47ff-9fb1-ea53fe0b92b6)             | 2.1–2.7, 5, 17                                   |
| [Abilify Asimtufii](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=da4c07fd-1130-4341-bb44-63acfa4162be)            | 2.1–2.5, 5, 17                                   |
| [Uzedy](https://www.uzedy.com/globalassets/uzedy/prescribing-information.pdf)                                                 | 2.1–2.7, 5, 17                                   |
| [Vivitrol](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cd11c435-b0f0-4bb9-ae78-60f101f3703f)                     | 2.1–2.6, 4, 5.1–5.3, 17.1                        |
| [Haloperidol decanoate](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=af0159a8-dff5-449a-aa2b-a0c430081e21)        | 2.1–2.3, 5, 17                                   |
| [Fluphenazine decanoate](https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=8caa3896-cde1-4cb1-9332-2e92bcf5c1f6) | Dosage and Administration; Warnings; Precautions |
| [Zyprexa Relprevv](https://www.accessdata.fda.gov/drugsatfda_docs/label/2026/022173s043lbl022173s040lbl.pdf)                  | 2.1–2.2, 5.1–5.2, 17; REMS                       |

For generic decanoate stock, staff must verify the actual manufacturer's labeling and presentation; recognizing an ingredient name does not authenticate the physical kit. No stock match, dose selection, laboratory interpretation, renal calculation, medication-interaction clearance, opioid-free clearance, or restart decision is performed by this module. Unknown or ambiguous recognized-product names return no guide; the general review remains available.

The source dates describe this review, not a clinical approval or automatic currency guarantee. Material source changes require re-review, new guide version identity, and review of encounter version handling. Returned guide objects are independent copies so UI use cannot mutate subsequent encounters.

Verification covers exact formulation separation, missing/ambiguous-name behavior, version/source completeness, unique answerable checks, bilingual aftercare structure, distinct incomplete-delivery paths, and mutation isolation. Clinical requirements remain separate from software test results.
