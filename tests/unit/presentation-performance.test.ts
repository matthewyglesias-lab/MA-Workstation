import { describe, expect, it, vi } from "vitest";
import { createRecordListView } from "../../src/presentation/record-list-view";
import {
  notesTableAccessibleLabels, patientNoteAccessibleLabels,
  notesTableRowAccessibleLabel, patientNoteOpenAccessibleLabel,
  type NotesTableRow,
} from "../../src/presentation/notes/note-table-model";

function row(index: number): NotesTableRow {
  return { key: `injection:${index}`, recordId: String(index), noteType: "injection",
    typeLabel: "Injection", patientLabel: `Synthetic ${index}`, status: "incomplete",
    visit: {raw: "2026-10-01", label: "Oct 1, 2026", sortTime: 1, source: "documented-visit", precision: "date"}, lock: null };
}

describe("linear accessible-name projection", () => {
  it.each([0, 1, 20, 200])("preserves both existing label rules for %i rows", count => {
    const rows = Array.from({length: count}, (_, i) => row(i));
    expect(notesTableAccessibleLabels(rows)).toEqual(rows.map(r => notesTableRowAccessibleLabel(r, rows)));
    expect(patientNoteAccessibleLabels(rows)).toEqual(rows.map(r => patientNoteOpenAccessibleLabel(r, rows)));
  });
  it("preserves same-key and distinct-key collision semantics", () => {
    const rows = [row(1), row(1), {...row(2), patientLabel: "Synthetic 1"}, row(3)];
    expect(notesTableAccessibleLabels(rows)).toEqual(rows.map(r => notesTableRowAccessibleLabel(r, rows)));
    expect(patientNoteAccessibleLabels(rows)).toEqual(rows.map(r => patientNoteOpenAccessibleLabel(r, rows)));
    const repeated = [row(1),row(1)];
    expect(notesTableAccessibleLabels(repeated)).toEqual(repeated.map(r => notesTableRowAccessibleLabel(r,repeated)));
  });
  it("reads each row's display facts only once instead of scanning peers per row", () => {
    const read = vi.fn((i: number) => `Synthetic ${i}`);
    const rows = Array.from({length: 1000}, (_, i) => ({...row(i), get patientLabel(){return read(i);}}));
    const labels = notesTableAccessibleLabels(rows);
    expect(labels).toHaveLength(1000);
    expect(read).toHaveBeenCalledTimes(1000);
  });
  it("records a synthetic same-process calculation benchmark, not a whole-app speed claim", () => {
    const rows = Array.from({length: 1000}, (_, i) => row(i));
    const timings = (run: () => unknown) => {
      run(); const values: number[] = [];
      for(let i=0;i<5;i++){const start=performance.now();run();values.push(performance.now()-start);}
      return values.sort((a,b)=>a-b)[2]!;
    };
    const oldMs = timings(()=>rows.map(r=>notesTableRowAccessibleLabel(r,rows)));
    const newMs = timings(()=>notesTableAccessibleLabels(rows));
    console.log("PRESENTATION_BENCHMARK", JSON.stringify({rows:1000,legacyMedianMs:oldMs,linearMedianMs:newMs,rounds:5}));
    expect(notesTableAccessibleLabels(rows)).toEqual(rows.map(r=>notesTableRowAccessibleLabel(r,rows)));
  });
});

describe("bounded, snapshot-local record-list projection", () => {
  const records = [
    {id:"a",status:"draft",patient:{name:"Synthetic Alpha"},addenda:[]},
    {id:"b",status:"completed",patient:{name:"Synthetic Beta"},addenda:[{text:"exact follow-up phrase"}]},
  ];
  it("does not serialize for an empty query and maps each row once", () => {
    const spy=vi.spyOn(JSON,"stringify");const map=vi.fn(r=>r.id);
    const view=createRecordListView(records,map);
    expect(view("","all")).toEqual(["a","b"]);
    expect(view("","locked")).toEqual(["b"]);
    expect(view("","draft")).toEqual(["a"]);
    expect(view("","addenda")).toEqual(["b"]);
    expect(spy).not.toHaveBeenCalled();expect(map).toHaveBeenCalledTimes(2);spy.mockRestore();
  });
  it("searches the whole record, caches once per snapshot and never narrows semantics", () => {
    const spy=vi.spyOn(JSON,"stringify");const view=createRecordListView(records,r=>r.id);
    expect(view(" SYNTHETIC ","all")).toEqual(["a","b"]);
    expect(view("follow-up phrase","all")).toEqual(["b"]);
    expect(view('"status":"completed"',"all")).toEqual(["b"]);
    expect(view("missing","all")).toEqual([]);
    expect(spy).toHaveBeenCalledTimes(2);spy.mockRestore();
  });
  it("rebuilds for a repository reload and does not retain stale record output", () => {
    const before=createRecordListView(records,r=>r.id);
    expect(before("Beta","all")).toEqual(["b"]);
    const fresh=records.map(r=>({...r,patient:{name:"Synthetic Changed"}}));
    const after=createRecordListView(fresh,r=>r.id);
    expect(after("Beta","all")).toEqual([]);
    expect(after("Changed","all")).toEqual(["a","b"]);
    expect(records[1]!.patient.name).toBe("Synthetic Beta");
  });
  it("keeps oversized records searchable without retaining their large strings", () => {
    const large=[{id:"large",status:"draft",payload:"x".repeat(530_000)+"needle"}];
    const spy=vi.spyOn(JSON,"stringify");const view=createRecordListView(large,r=>r.id);
    expect(view("needle","all")).toEqual(["large"]);
    expect(view("needle","all")).toEqual(["large"]);
    expect(spy).toHaveBeenCalledTimes(2);spy.mockRestore();
  });
});
