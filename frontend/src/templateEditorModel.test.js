import test from "node:test";
import assert from "node:assert/strict";

import {
  acceptAllReviewRequirements,
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
  review_required: true,
  review_reasons: ["verify label"],
  enabled: true,
  geometry_source: "PP-DocLayoutV3",
};

test("canonical draft regions round-trip without losing authoritative fields", () => {
  const editor = draftRegionToEditor(backendRegion);
  editor.label = "Policy ID";
  editor.reviewRequired = false;
  editor.reviewReasons = [];

  const saved = editorRegionToDraft(editor);
  assert.equal(saved.id, backendRegion.id);
  assert.deepEqual(saved.source_region_ids, backendRegion.source_region_ids);
  assert.deepEqual(saved.bbox, backendRegion.bbox);
  assert.equal(saved.label, "Policy ID");
  assert.equal(saved.review_required, false);
  assert.deepEqual(saved.review_reasons, []);
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

test("legacy trace metadata does not become a review requirement", () => {
  const editor = draftRegionToEditor({
    ...backendRegion,
    review_required: undefined,
    review_reasons: undefined,
    review_flags: [
      "source=llama_cpp_batched_mapping",
      "batch=1",
      "model_decision=ACCEPT",
      "model_note=Submission Date",
    ],
  });

  assert.equal(editor.reviewRequired, false);
  assert.deepEqual(editor.reviewReasons, []);
});

test("review flags and duplicate enabled keys block approval", () => {
  const first = draftRegionToEditor(backendRegion);
  const second = draftRegionToEditor({
    ...backendRegion,
    id: "region_page_001_region_0004",
    field_id: "policy_number_2",
    source_region_ids: ["region_page_001_region_0004"],
    review_required: false,
    review_reasons: [],
  });

  const messages = validateRegions([first, second]).map((issue) => issue.message);
  assert(messages.some((message) => message.startsWith("Review required:")));
  assert(messages.includes("Duplicate key: policy_number"));
});

test("bulk acceptance clears every model review requirement without changing fields", () => {
  const flagged = draftRegionToEditor(backendRegion);
  const clear = draftRegionToEditor({
    ...backendRegion,
    id: "region_page_001_region_0004",
    field_id: "claim_number",
    key: "claim_number",
    source_region_ids: ["region_page_001_region_0004"],
    review_required: false,
    review_reasons: [],
  });

  const accepted = acceptAllReviewRequirements([flagged, clear]);

  assert.deepEqual(accepted.map((region) => [region.reviewRequired, region.reviewReasons]), [[false, []], [false, []]]);
  assert.equal(accepted[0].id, flagged.id);
  assert.equal(accepted[0].key, flagged.key);
  assert.notEqual(accepted[0], flagged);
  assert.equal(accepted[1], clear);
});

test("disabled authoritative regions remain present but do not block validation", () => {
  const enabled = draftRegionToEditor({ ...backendRegion, review_required: false, review_reasons: [] });
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

test("small in-page regions do not block approval", () => {
  const small = draftRegionToEditor({
    ...backendRegion,
    review_required: false,
    review_reasons: [],
    bbox: { x: 0.5, y: 0.5, width: 0.001, height: 0.001 },
  });

  assert.deepEqual(validateRegions([small]), []);
});
