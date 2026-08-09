const STORAGE_PREFIX = "formflow.template-regions.v1";

const FIELD_PRESETS = {
  policyNumber: { label: "Policy Number", type: "identifier", x: 0.57, y: 0.125, width: 0.32, height: 0.045 },
  claimNumber: { label: "Claim Number", type: "identifier", x: 0.57, y: 0.18, width: 0.32, height: 0.045 },
  formType: { label: "Form Type", type: "text", x: 0.11, y: 0.125, width: 0.34, height: 0.045 },
  claimantName: { label: "Claimant Name", type: "name", x: 0.11, y: 0.29, width: 0.78, height: 0.047 },
  insuredName: { label: "Insured Name", type: "name", x: 0.11, y: 0.36, width: 0.78, height: 0.047 },
  phone: { label: "Phone Number", type: "phone", x: 0.11, y: 0.43, width: 0.36, height: 0.047 },
  email: { label: "Email Address", type: "email", x: 0.53, y: 0.43, width: 0.36, height: 0.047 },
  address: { label: "Address", type: "textarea", x: 0.11, y: 0.5, width: 0.78, height: 0.078 },
  lossDate: { label: "Date of Loss", type: "date", x: 0.11, y: 0.65, width: 0.26, height: 0.045 },
  reportedDate: { label: "Reported Date", type: "date", x: 0.4, y: 0.65, width: 0.26, height: 0.045 },
  claimCategory: { label: "Claim Category", type: "text", x: 0.69, y: 0.65, width: 0.2, height: 0.045 },
  description: { label: "Incident Description", type: "textarea", x: 0.11, y: 0.72, width: 0.78, height: 0.092 },
  amountClaimed: { label: "Amount Claimed", type: "amount", x: 0.11, y: 0.875, width: 0.35, height: 0.047 },
  currency: { label: "Currency", type: "currency", x: 0.49, y: 0.875, width: 0.16, height: 0.047 },
  paymentMethod: { label: "Payment Method", type: "text", x: 0.68, y: 0.875, width: 0.21, height: 0.047 },
};

const FALLBACK_LAYOUT = [
  [0.11, 0.125, 0.34, 0.045], [0.57, 0.125, 0.32, 0.045],
  [0.11, 0.2, 0.78, 0.045], [0.11, 0.29, 0.78, 0.045],
  [0.11, 0.36, 0.36, 0.045], [0.53, 0.36, 0.36, 0.045],
  [0.11, 0.46, 0.78, 0.075], [0.11, 0.61, 0.26, 0.045],
  [0.4, 0.61, 0.26, 0.045], [0.69, 0.61, 0.2, 0.045],
  [0.11, 0.69, 0.78, 0.09], [0.11, 0.86, 0.35, 0.045],
  [0.49, 0.86, 0.18, 0.045], [0.7, 0.86, 0.19, 0.045],
];

export const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "name", label: "Person name" },
  { value: "identifier", label: "Identifier" },
  { value: "date", label: "Date" },
  { value: "amount", label: "Amount" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "checkbox", label: "Checkbox" },
  { value: "table", label: "Table" },
  { value: "signature", label: "Signature" },
  { value: "textarea", label: "Long text" },
];

export const EXTRACTION_MODES = [
  { value: "printed", label: "Printed OCR" },
  { value: "handwriting", label: "Handwriting OCR" },
  { value: "checkbox", label: "Checkbox detection" },
  { value: "table", label: "Table extraction" },
  { value: "signature", label: "Signature check" },
];

export function labelToKey(label) {
  const cleaned = String(label ?? "")
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/^\s+|\s+$/g, "");
  if (!cleaned) return "newField";
  const words = cleaned.split(/\s+/);
  return words[0].toLowerCase() + words.slice(1).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
}

export function createRegion(key, index = 0, geometry = null) {
  const preset = FIELD_PRESETS[key];
  const fallback = FALLBACK_LAYOUT[index % FALLBACK_LAYOUT.length];
  const [x, y, width, height] = geometry
    ? [geometry.x, geometry.y, geometry.width, geometry.height]
    : preset
      ? [preset.x, preset.y, preset.width, preset.height]
      : fallback;

  return {
    id: `region-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    page: 1,
    key,
    label: preset?.label ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase()),
    type: preset?.type ?? "text",
    language: "my-en",
    extractionMode: "printed",
    required: ["policyNumber", "claimNumber", "claimantName", "lossDate", "amountClaimed"].includes(key),
    confidence: Math.max(0.71, 0.96 - (index % 7) * 0.035),
    x,
    y,
    width,
    height,
  };
}

export function createDetectedRegions(fieldKeys = []) {
  return fieldKeys.slice(0, 15).map((key, index) => createRegion(key, index));
}

export function createBlankRegion(geometry, index = 0) {
  return createRegion(`newField${index + 1}`, index, geometry);
}

export function loadRegions(registrationId, fieldKeys = []) {
  try {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}.${registrationId}`);
    if (saved) return JSON.parse(saved);
  } catch {
    // The editor remains usable if browser storage is unavailable.
  }
  return createDetectedRegions(fieldKeys);
}

export function saveRegions(registrationId, regions) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}.${registrationId}`, JSON.stringify(regions));
  } catch {
    // Region API persistence will replace this local draft cache later.
  }
}

export function validateRegions(regions) {
  const issues = [];
  const keys = new Map();

  regions.forEach((region) => {
    if (!String(region.label).trim()) issues.push({ regionId: region.id, message: "Field label is missing" });
    if (!String(region.key).trim()) issues.push({ regionId: region.id, message: "Field key is missing" });
    if (region.width < 0.025 || region.height < 0.012) issues.push({ regionId: region.id, message: "Region is too small" });
    if (region.x < 0 || region.y < 0 || region.x + region.width > 1 || region.y + region.height > 1) {
      issues.push({ regionId: region.id, message: "Region is outside the page" });
    }
    if (keys.has(region.key)) {
      issues.push({ regionId: region.id, message: `Duplicate key: ${region.key}` });
    } else {
      keys.set(region.key, region.id);
    }
  });

  if (!regions.length) issues.push({ regionId: null, message: "Add at least one extraction region" });
  return issues;
}

