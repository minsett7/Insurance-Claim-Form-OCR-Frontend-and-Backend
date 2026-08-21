const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const FIELD_TO_UI = {
  policy_number: "policyNumber",
  claim_reference: "claimNumber",
  form_type: "formType",
  claimant_name: "claimantName",
  insured_name: "insuredName",
  nrc: "nrc",
  phone: "phone",
  email: "email",
  address: "address",
  loss_date: "lossDate",
  reported_date: "reportedDate",
  claim_category: "claimCategory",
  description: "description",
  amount_claimed: "amountClaimed",
  currency: "currency",
  payment_method: "paymentMethod",
  bank_reference: "bankReference",
};

const UI_TO_FIELD = Object.fromEntries(Object.entries(FIELD_TO_UI).map(([apiKey, uiKey]) => [uiKey, apiKey]));

const FORM_TYPE_LABELS = {
  health: "Health Claim",
  life: "Life Claim",
  motor: "Motor Claim",
  fire: "Fire Claim",
};

const FORM_TYPE_OWNERS = {
  health: "Health Claims",
  life: "Life Claims",
  motor: "Motor Claims",
  fire: "Fire Claims",
};

const API_TO_UI_STATUS = {
  active: "Active",
  draft: "Draft",
  needs_approval: "Needs Approval",
  needs_resubmission: "Needs Resubmission",
  validating: "Validating",
  preprocessing: "Preprocessing",
  extracting: "Extracting",
  contract_validation: "Contract Validation",
  vlm_queued: "VLM Queued",
  vlm_running: "VLM Running",
  relationship_validation: "Relationship Validation",
  registered: "Registered",
  uploaded: "Uploaded",
  processing: "Processing",
  needs_review: "Needs Review",
  ready_to_sync: "Ready to Sync",
  synced: "Synced",
  failed: "Failed",
  not_synced: "Not Synced",
  pending: "Pending",
};

const UI_TO_API_STATUS = Object.fromEntries(Object.entries(API_TO_UI_STATUS).map(([apiStatus, uiStatus]) => [uiStatus, apiStatus]));

function titleFromStatus(status) {
  return String(status ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function apiStatusToUi(status) {
  return API_TO_UI_STATUS[status] ?? titleFromStatus(status);
}

export function uiStatusToApi(status) {
  return UI_TO_API_STATUS[status] ?? String(status ?? "").toLowerCase().replace(/\s+/g, "_");
}

function apiFieldToUi(field) {
  return FIELD_TO_UI[field] ?? field;
}

function uiFieldToApi(field) {
  return UI_TO_FIELD[field] ?? field;
}

function fieldsToUi(fields = []) {
  return fields.map(apiFieldToUi);
}

function fieldsToApi(fields = []) {
  return fields.map(uiFieldToApi);
}

function confidenceFromProcessed(processed) {
  const values = Object.values(processed?.fields ?? {})
    .map((field) => Number(field.confidence))
    .filter(Number.isFinite);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function categoryLabel(formTypeId, formTypes = []) {
  return formTypes.find((category) => category.id === formTypeId)?.name
    ?? formTypes.find((category) => category.id === formTypeId)?.label
    ?? FORM_TYPE_LABELS[formTypeId]
    ?? formTypeId
    ?? "Insurance Claim";
}

function processedToExtracted(document, formTypes = []) {
  const processedFields = document.processed?.fields ?? {};
  const extracted = {
    policyNumber: "",
    claimNumber: "",
    formType: categoryLabel(document.form_type_id, formTypes),
    claimantName: "",
    insuredName: "",
    nrc: "",
    phone: "",
    email: "",
    address: "",
    lossDate: "",
    reportedDate: "",
    claimCategory: "",
    description: "",
    amountClaimed: "",
    currency: "MMK",
    paymentMethod: "",
    bankReference: "",
    assignedTeam: FORM_TYPE_OWNERS[document.form_type_id] ?? "Claims Review",
    priority: "Normal",
    reviewNotes: "",
  };

  Object.entries(processedFields).forEach(([apiKey, field]) => {
    const uiKey = apiFieldToUi(apiKey);
    extracted[uiKey] = field?.value ?? "";
  });

  const reviewFields = document.processed?.summary?.review_fields ?? [];
  if (reviewFields.length) {
    extracted.reviewNotes = `Review required: ${reviewFields.map(apiFieldToUi).join(", ")}`;
  }

  return extracted;
}

function confidenceByField(document) {
  const scores = {};
  Object.entries(document.processed?.fields ?? {}).forEach(([apiKey, field]) => {
    const score = Number(field?.confidence);
    if (Number.isFinite(score)) scores[apiFieldToUi(apiKey)] = score;
  });
  return scores;
}

function pageByField(document) {
  const pages = {};
  Object.entries(document.processed?.fields ?? {}).forEach(([apiKey, field]) => {
    pages[apiFieldToUi(apiKey)] = Number(field?.page ?? 1);
  });
  return pages;
}

function metadataByField(document) {
  const metadata = {};
  Object.entries(document.processed?.fields ?? {}).forEach(([apiKey, field]) => {
    metadata[apiFieldToUi(apiKey)] = {
      label: field?.label ?? apiKey.replace(/_/g, " "),
      type: field?.field_type === "table" ? "textarea" : "text",
    };
  });
  return metadata;
}

export function correctionPayloadFromExtracted(extracted) {
  const fields = {};
  Object.entries(extracted ?? {}).forEach(([uiKey, value]) => {
    const apiKey = uiFieldToApi(uiKey);
    if (apiKey !== uiKey || FIELD_TO_UI[apiKey]) {
      fields[apiKey] = value ?? "";
    }
  });
  return { fields };
}

export function adaptTemplate(template, formTypes = []) {
  return {
    id: template.id,
    name: template.name,
    description: template.description ?? "",
    formTypeId: template.form_type_id,
    formTypeLabel: categoryLabel(template.form_type_id, formTypes),
    version: template.version ?? "1.0",
    status: apiStatusToUi(template.status),
    confidenceScore: Number(template.confidence_score ?? template.confidenceScore ?? 0),
    owner: FORM_TYPE_OWNERS[template.form_type_id] ?? `${categoryLabel(template.form_type_id, formTypes)} Team`,
    updatedAt: String(template.updated_at ?? template.updatedAt ?? "").slice(0, 10),
    fields: fieldsToUi(template.fields ?? []),
    sourceFile: template.source_file ?? template.sourceFile ?? "",
  };
}

export function adaptRegistration(registration) {
  const draft = registration.draft ?? null;
  const pages = draft?.pages ?? (draft?.page ? [draft.page] : []);
  const fields = (draft?.regions ?? []).map((region) => region.key).filter(Boolean);
  return {
    id: registration.id,
    name: registration.name ?? registration.file_name,
    description: registration.description ?? "",
    fileName: registration.file_name,
    formTypeId: registration.form_type_id,
    status: apiStatusToUi(registration.status),
    rawStatus: registration.status,
    progress: registration.progress ?? { stage: registration.status, percent: 0 },
    stage: Number(registration.progress?.percent ?? 0),
    uploadedAt: registration.created_at ?? "",
    approvedAt: registration.approved_at ?? null,
    qualityScore: Number(registration.quality_score ?? draft?.quality_summary?.actionable_coverage_ratio ?? 0),
    layoutScore: Number(registration.layout_score ?? 0.78),
    detectedRegions: Number(registration.detected_regions ?? 0),
    fields,
    detectedFields: fields,
    templateId: registration.template_id,
    preprocessing: registration.preprocessing ?? null,
    layoutStatus: registration.layout_status ?? "pending",
    ocrStatus: registration.ocr_status ?? "pending",
    failure: registration.failure ?? null,
    draft,
    draftRevision: Number(registration.draft_revision ?? draft?.revision ?? 0),
    imageIdentity: registration.image_identity ?? null,
    imageIdentities: registration.image_identities ?? (registration.image_identity ? [registration.image_identity] : []),
    pages,
    pageUrls: pages.map((page) => page.image_url ? `${API_BASE_URL}${page.image_url}` : null),
    pageUrl: pages[0]?.image_url ? `${API_BASE_URL}${pages[0].image_url}` : null,
    correlationId: registration.correlation_id ?? null,
  };
}

export function adaptDocument(document, formTypes = []) {
  return {
    id: document.id,
    fileName: document.file_name,
    templateId: document.template_id,
    formTypeId: document.form_type_id,
    uploadTime: document.created_at ?? "",
    source: "Backend API",
    status: apiStatusToUi(document.status),
    syncStatus: apiStatusToUi(document.sync_status),
    confidence: confidenceFromProcessed(document),
    pages: document.pages ?? 1,
    processingTime: document.status === "processing" ? "Running" : "Completed",
    pipelineStage: document.status === "processing" ? 4 : 7,
    extracted: processedToExtracted(document, formTypes),
    confidenceByField: confidenceByField(document),
    pageByField: pageByField(document),
    fieldMetadata: metadataByField(document),
    pageAlignmentScores: document.processed?.summary?.page_alignment_scores ?? {},
    sourceUrl: `${API_BASE_URL}/api/v1/documents/${encodeURIComponent(document.id)}/source`,
    alignedPageBaseUrl: document.processed?.summary?.aligned_page_count && document.downstream_ids?.document_job_id
      ? `${API_BASE_URL}/api/v1/documents/${encodeURIComponent(document.id)}/pages`
      : null,
    templateMatch: document.template_match ?? null,
    auditTrail: [
      { at: document.created_at ?? "", action: "Uploaded to backend" },
      ...(document.processed ? [{ at: document.updated_at ?? "", action: "Post-processing completed" }] : []),
    ],
  };
}

export function adaptAuditEvent(event) {
  return {
    id: event.id,
    actor: event.actor ?? "system",
    action: event.action ?? "updated record",
    targetType: event.target_type ?? "record",
    targetId: event.target_id ?? "",
    createdAt: event.created_at ?? "",
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const data = await response.json();
      const responseDetail = data.detail ?? data;
      detail = typeof responseDetail === "string" ? responseDetail : JSON.stringify(responseDetail);
    } catch {
      // Keep HTTP status text when the server does not return JSON.
    }
    throw new Error(detail);
  }
  if (response.status === 204) return null;
  return response.json();
}

function fileFormData(files) {
  const formData = new FormData();
  Array.from(files).forEach((file) => formData.append("files", file));
  return formData;
}

export async function fetchDashboardData() {
  const [templates, registrations, documents, auditEvents, formTypes] = await Promise.all([
    request("/api/templates"),
    request("/api/template-registrations"),
    request("/api/documents"),
    request("/api/audit-events"),
    request("/api/v1/form-categories"),
  ]);

  return {
    templates: templates.map((template) => adaptTemplate(template, formTypes)),
    registrations: registrations.map(adaptRegistration),
    documents: documents.map((document) => adaptDocument(document, formTypes)),
    auditEvents: auditEvents.map(adaptAuditEvent).reverse(),
    formTypes,
  };
}

export async function uploadTemplateRegistration(metadata, files, preprocessingPolicy = "auto") {
  const items = await Promise.all(Array.from(files).map((file) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", metadata.name);
    formData.append("description", metadata.description ?? "");
    formData.append("form_type_id", metadata.formTypeId);
    formData.append("language", metadata.language ?? "my-en");
    formData.append("preprocessing_policy", preprocessingPolicy);
    return request("/api/v1/template-registrations", { method: "POST", body: formData });
  }));
  return { items };
}

export async function updateTemplateRegistrationMetadata(registrationId, metadata) {
  const registration = await request(`/api/v1/template-registrations/${encodeURIComponent(registrationId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: metadata.name,
      description: metadata.description ?? "",
      form_type_id: metadata.formTypeId,
    }),
  });
  return adaptRegistration(registration);
}

export async function deleteTemplateRegistration(registrationId) {
  return request(`/api/v1/template-registrations/${encodeURIComponent(registrationId)}`, { method: "DELETE" });
}

export async function createFormCategory(category) {
  return request("/api/v1/form-categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(category),
  });
}

export async function updateFormCategory(categoryId, category) {
  return request(`/api/v1/form-categories/${encodeURIComponent(categoryId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(category),
  });
}

export async function deleteFormCategory(categoryId) {
  return request(`/api/v1/form-categories/${encodeURIComponent(categoryId)}`, { method: "DELETE" });
}

export async function approveTemplateRegistration(registrationId) {
  return request(`/api/v1/template-registrations/${encodeURIComponent(registrationId)}/approve`, {
    method: "POST",
  });
}

export async function fetchTemplateRegistration(registrationId) {
  const registration = await request(`/api/v1/template-registrations/${encodeURIComponent(registrationId)}`);
  return adaptRegistration(registration);
}

export async function saveTemplateRegistrationDraft(registrationId, draft) {
  const registration = await request(`/api/v1/template-registrations/${encodeURIComponent(registrationId)}/draft`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return adaptRegistration(registration);
}

export async function validateTemplateRegistration(registrationId) {
  return request(`/api/v1/template-registrations/${encodeURIComponent(registrationId)}/validate`, {
    method: "POST",
  });
}

export async function updateTemplateRegistrationFields(registrationId, fields) {
  return request(`/api/template-registrations/${encodeURIComponent(registrationId)}/fields`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: fieldsToApi(fields) }),
  });
}

export async function uploadCompletedDocuments(templateId, files) {
  const templateQuery = templateId ? `&template_id=${encodeURIComponent(templateId)}` : "";
  return request(`/api/documents?process_immediately=true${templateQuery}`, {
    method: "POST",
    body: fileFormData(files),
  });
}

export async function fetchTemplateLayout(templateId) {
  return request(`/api/v1/templates/${encodeURIComponent(templateId)}/layout`);
}

export async function overrideDocumentTemplate(documentId, templateId) {
  return request(`/api/v1/documents/${encodeURIComponent(documentId)}/template-match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template_id: templateId, reason: "Selected by reviewer" }),
  });
}

export async function reprocessDocument(documentId) {
  return request(`/api/v1/documents/${encodeURIComponent(documentId)}/reprocess`, { method: "POST" });
}

export async function saveDocumentFields(documentId, extracted) {
  return request(`/api/documents/${encodeURIComponent(documentId)}/fields`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(correctionPayloadFromExtracted(extracted)),
  });
}

export async function updateDocumentStatus(documentId, status) {
  return request(`/api/documents/${encodeURIComponent(documentId)}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: uiStatusToApi(status) }),
  });
}

export async function deleteDocument(documentId) {
  return request(`/api/documents/${encodeURIComponent(documentId)}`, {
    method: "DELETE",
  });
}

export async function downloadBackendFile(path, fileName) {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export { API_BASE_URL };
