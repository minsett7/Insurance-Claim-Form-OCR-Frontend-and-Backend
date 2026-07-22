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

function processedToExtracted(document) {
  const processedFields = document.processed?.fields ?? {};
  const extracted = {
    policyNumber: "",
    claimNumber: "",
    formType: FORM_TYPE_LABELS[document.form_type_id] ?? "Insurance Claim",
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

export function adaptTemplate(template) {
  return {
    id: template.id,
    name: template.name,
    formTypeId: template.form_type_id,
    formTypeLabel: FORM_TYPE_LABELS[template.form_type_id] ?? template.form_type_id,
    version: template.version ?? "1.0",
    status: apiStatusToUi(template.status),
    confidenceScore: Number(template.confidence_score ?? template.confidenceScore ?? 0),
    owner: FORM_TYPE_OWNERS[template.form_type_id] ?? "Claims",
    updatedAt: String(template.updated_at ?? template.updatedAt ?? "").slice(0, 10),
    fields: fieldsToUi(template.fields ?? []),
    sourceFile: template.source_file ?? template.sourceFile ?? "",
  };
}

export function adaptRegistration(registration) {
  const fields = fieldsToUi(registration.fields ?? []);
  return {
    id: registration.id,
    fileName: registration.file_name,
    formTypeId: registration.form_type_id,
    status: apiStatusToUi(registration.status),
    stage: registration.status === "registered" ? 9 : 7,
    uploadedAt: registration.created_at ?? "",
    approvedAt: registration.approved_at ?? null,
    qualityScore: Number(registration.quality_score ?? 0.86),
    layoutScore: Number(registration.layout_score ?? 0.78),
    detectedRegions: Number(registration.detected_regions ?? 0),
    fields,
    detectedFields: fields,
    templateId: registration.template_id,
  };
}

export function adaptDocument(document) {
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
    extracted: processedToExtracted(document),
    confidenceByField: confidenceByField(document),
    auditTrail: [
      { at: document.created_at ?? "", action: "Uploaded to backend" },
      ...(document.processed ? [{ at: document.updated_at ?? "", action: "Post-processing completed" }] : []),
    ],
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const data = await response.json();
      detail = data.detail ?? detail;
    } catch {
      // Keep HTTP status text when the server does not return JSON.
    }
    throw new Error(detail);
  }
  return response.json();
}

function fileFormData(files) {
  const formData = new FormData();
  Array.from(files).forEach((file) => formData.append("files", file));
  return formData;
}

export async function fetchDashboardData() {
  const [templates, registrations, documents] = await Promise.all([
    request("/api/templates"),
    request("/api/template-registrations"),
    request("/api/documents"),
  ]);

  return {
    templates: templates.map(adaptTemplate),
    registrations: registrations.map(adaptRegistration),
    documents: documents.map(adaptDocument),
  };
}

export async function uploadTemplateRegistration(formTypeId, files) {
  return request(`/api/template-registrations?form_type_id=${encodeURIComponent(formTypeId)}`, {
    method: "POST",
    body: fileFormData(files),
  });
}

export async function approveTemplateRegistration(registrationId) {
  return request(`/api/template-registrations/${encodeURIComponent(registrationId)}/approve`, {
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
  return request(`/api/documents?template_id=${encodeURIComponent(templateId)}&process_immediately=true`, {
    method: "POST",
    body: fileFormData(files),
  });
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
