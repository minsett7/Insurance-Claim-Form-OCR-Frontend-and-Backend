import test from "node:test";
import assert from "node:assert/strict";

import {
  draftRegionToEditor,
  editorRegionToDraft,
  validateRegions,
} from "./templateEditorModel.js";

const backendRegion = {
  id: "region_page_001_region_0003",
  field_id: "policy_number",
  key: "policy_number",
  label: "Policy Number",
  data_type: "text",
  extraction_mode: "printed_text",
  required: true,
  confidence: 0.91,
  bbox: { x: 0.2, y: 0.1, width: 0.5, height: 0.05 },
  source_region_ids: ["region_page_001_region_0003"],
  review_flags: ["verify label"],
  enabled: true,
  geometry_source: "PP-DocLayoutV3",
};

test("canonical draft regions round-trip without losing authoritative fields", () => {
  const editor = draftRegionToEditor(backendRegion);
  editor.label = "Policy ID";
  editor.reviewFlags = [];

  const saved = editorRegionToDraft(editor);
  assert.equal(saved.id, backendRegion.id);
  assert.deepEqual(saved.source_region_ids, backendRegion.source_region_ids);
  assert.deepEqual(saved.bbox, backendRegion.bbox);
  assert.equal(saved.label, "Policy ID");
  assert.deepEqual(saved.review_flags, []);
});

test("page-two regions keep their canonical page during editor round-trip", () => {
  const editor = draftRegionToEditor({
    ...backendRegion,
    id: "region_page_002_region_0001",
    page: 2,
    source_region_ids: ["region_page_002_region_0001"],
  });

  assert.equal(editor.page, 2);
  assert.equal(editorRegionToDraft(editor).page, 2);
});

test("review flags and duplicate enabled keys block approval", () => {
  const first = draftRegionToEditor(backendRegion);
  const second = draftRegionToEditor({
    ...backendRegion,
    id: "region_page_001_region_0004",
    field_id: "policy_number_2",
    source_region_ids: ["region_page_001_region_0004"],
    review_flags: [],
  });

  const messages = validateRegions([first, second]).map((issue) => issue.message);
  assert(messages.some((message) => message.startsWith("Review required:")));
  assert(messages.includes("Duplicate key: policy_number"));
});

test("disabled authoritative regions remain present but do not block validation", () => {
  const enabled = draftRegionToEditor({ ...backendRegion, review_flags: [] });
  const disabled = draftRegionToEditor({
    ...backendRegion,
    id: "region_page_001_region_0004",
    field_id: "unresolved_field",
    key: "",
    extraction_mode: "",
    source_region_ids: ["region_page_001_region_0004"],
    enabled: false,
  });

  assert.deepEqual(validateRegions([enabled, disabled]), []);
  assert.equal(editorRegionToDraft(disabled).enabled, false);
});
