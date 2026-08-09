export const APP_ROUTES = Object.freeze({
  WORK_QUEUE: "work",
  TEMPLATES: "templates",
  PROCESS: "process",
  RECORDS: "records",
  REPORTS: "reports",
});

const ROUTE_ALIASES = Object.freeze({
  command: APP_ROUTES.WORK_QUEUE,
  register: APP_ROUTES.TEMPLATES,
  export: APP_ROUTES.REPORTS,
  formTypes: APP_ROUTES.TEMPLATES,
});

export const TEMPLATE_STATUSES = Object.freeze({
  UPLOADING: "Uploading",
  ANALYZING: "Analyzing",
  NEEDS_REVIEW: "Needs Review",
  DRAFT: "Draft",
  ACTIVE: "Active",
  ARCHIVED: "Archived",
  FAILED: "Failed",
});

export const DOCUMENT_STATUSES = Object.freeze({
  UPLOADING: "Uploading",
  QUALITY_CHECK: "Quality Check",
  MATCHING: "Matching Template",
  EXTRACTING: "Extracting",
  NEEDS_REVIEW: "Needs Review",
  READY: "Ready to Sync",
  SYNCED: "Synced",
  FAILED: "Failed",
});

export const TEMPLATE_PIPELINE = Object.freeze([
  "Upload",
  "Preprocess",
  "Detect regions",
  "Read labels",
  "Map fields",
  "Human review",
  "Approval",
]);

export const DOCUMENT_PIPELINE = Object.freeze([
  "Quality check",
  "Template match",
  "Alignment",
  "Extraction",
  "Validation",
  "Human review",
]);

export const CONFIDENCE_THRESHOLDS = Object.freeze({
  HIGH: 0.9,
  REVIEW: 0.75,
});

export function normalizeRoute(route) {
  const normalized = ROUTE_ALIASES[route] ?? route;
  return Object.values(APP_ROUTES).includes(normalized) ? normalized : APP_ROUTES.WORK_QUEUE;
}

export function routeFromHash(hash = window.location.hash) {
  return normalizeRoute(String(hash).replace(/^#\/?/, ""));
}

export function hashForRoute(route) {
  return `#/${normalizeRoute(route)}`;
}

export function getReviewPriority(document) {
  if (!document) return "normal";
  if (document.status === DOCUMENT_STATUSES.FAILED || Number(document.confidence) < CONFIDENCE_THRESHOLDS.REVIEW) {
    return "urgent";
  }
  if (document.status === DOCUMENT_STATUSES.NEEDS_REVIEW) return "review";
  return "normal";
}

