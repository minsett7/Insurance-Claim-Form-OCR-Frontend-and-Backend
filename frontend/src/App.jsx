import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  Database,
  Download,
  FileCode2,
  FileJson,
  FileSpreadsheet,
  FileText,
  LayoutTemplate,
  Loader2,
  LockKeyhole,
  Menu,
  Moon,
  RefreshCw,
  ScanLine,
  Sun,
  Table2,
  Users,
} from "lucide-react";
import {
  API_BASE_URL,
  approveTemplateRegistration,
  deleteDocument as deleteBackendDocument,
  downloadBackendFile,
  fetchTemplateRegistration,
  fetchDashboardData,
  saveDocumentFields,
  updateDocumentStatus as updateBackendDocumentStatus,
  updateTemplateRegistrationFields,
} from "./api";
import {
  APP_ROUTES,
  DOCUMENT_STATUSES,
  getReviewPriority,
  hashForRoute,
  normalizeRoute,
  routeFromHash,
} from "./productModel";
import TemplateWorkspace from "./TemplateWorkspace";
import DocumentWorkspace from "./DocumentWorkspace";
import RecordsWorkspace from "./RecordsWorkspace";

const STORAGE_KEYS = { theme: "formflow.theme.v1" };

const DEFAULT_FORM_TYPES = [
  { id: "health", name: "Health", label: "Health Claim", accent: "#15803d" },
  { id: "life", name: "Life", label: "Life Claim", accent: "#4f46e5" },
  { id: "motor", name: "Motor", label: "Motor Claim", accent: "#b45309" },
  { id: "fire", name: "Fire", label: "Fire Claim", accent: "#b91c1c" },
];

const FIELD_LIBRARY = [
  { key: "policyNumber", label: "Policy Number", group: "Policy", type: "identifier", required: true },
  { key: "claimNumber", label: "Claim Number", group: "Policy", type: "identifier", required: true },
  { key: "formType", label: "Form Type", group: "Policy", type: "formType", required: true },
  { key: "claimantName", label: "Claimant Name", group: "Claimant", type: "name", required: true },
  { key: "insuredName", label: "Insured Name", group: "Claimant", type: "name", required: false },
  { key: "nrc", label: "National ID / NRC", group: "Claimant", type: "identifier", required: false },
  { key: "phone", label: "Phone", group: "Claimant", type: "phone", required: false },
  { key: "email", label: "Email", group: "Claimant", type: "email", required: false },
  { key: "address", label: "Address", group: "Claimant", type: "textarea", required: false },
  { key: "lossDate", label: "Loss Date", group: "Incident", type: "date", required: true },
  { key: "reportedDate", label: "Reported Date", group: "Incident", type: "date", required: false },
  { key: "claimCategory", label: "Claim Category", group: "Incident", type: "text", required: true },
  { key: "description", label: "Description", group: "Incident", type: "textarea", required: false },
  { key: "amountClaimed", label: "Amount Claimed", group: "Payment", type: "amount", required: true },
  { key: "currency", label: "Currency", group: "Payment", type: "currency", required: true },
  { key: "paymentMethod", label: "Payment Method", group: "Payment", type: "text", required: false },
  { key: "bankReference", label: "Bank Reference", group: "Payment", type: "identifier", required: false },
  { key: "assignedTeam", label: "Assigned Team", group: "Internal", type: "text", required: false },
  { key: "priority", label: "Priority", group: "Internal", type: "priority", required: false },
  { key: "reviewNotes", label: "Review Notes", group: "Internal", type: "textarea", required: false },
];

const FIELD_GROUPS = [
  { id: "Policy", icon: FileText },
  { id: "Claimant", icon: Users },
  { id: "Incident", icon: AlertCircle },
  { id: "Payment", icon: FileSpreadsheet },
  { id: "Internal", icon: LockKeyhole },
];

const DEFAULT_FIELD_KEYS = [
  "policyNumber", "claimNumber", "formType", "claimantName", "insuredName", "phone", "email", "address",
  "lossDate", "reportedDate", "claimCategory", "description", "amountClaimed", "currency", "paymentMethod",
  "bankReference", "assignedTeam", "priority",
];

function getRegistrationFields(job) {
  if (Array.isArray(job?.fields)) return job.fields;
  if (Array.isArray(job?.detectedFields)) return job.detectedFields;
  return DEFAULT_FIELD_KEYS;
}

function fieldByKey(key) {
  return FIELD_LIBRARY.find((field) => field.key === key);
}

function loadStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Preferences are optional when browser storage is unavailable.
  }
}

function nowText() {
  return new Date().toLocaleString("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).replace(",", "");
}

function normalizeAmount(value) {
  return String(value ?? "").replace(/[^\d.]/g, "");
}

function formatAmount(value, currency = "") {
  const amount = Number(normalizeAmount(value));
  if (!Number.isFinite(amount) || !normalizeAmount(value)) return value || "—";
  return `${amount.toLocaleString("en-US")}${currency ? ` ${currency}` : ""}`;
}

function statusSlug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function validateDocument(document, template) {
  const issues = {};
  const keys = template?.fields?.length ? template.fields : DEFAULT_FIELD_KEYS;
  keys.forEach((key) => {
    const field = fieldByKey(key);
    if (!field) return;
    const value = String(document.extracted?.[key] ?? "").trim();
    const score = document.confidenceByField?.[key] ?? document.confidence;
    const fieldIssues = [];
    if (field.required && !value) fieldIssues.push("Required field is missing");
    if (value && field.type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) fieldIssues.push("Invalid email format");
    if (value && field.type === "phone" && !/^\+?\d{6,15}$/.test(value.replace(/\s/g, ""))) fieldIssues.push("Invalid phone number");
    if (value && field.type === "date" && Number.isNaN(Date.parse(value))) fieldIssues.push("Invalid date");
    if (value && field.type === "amount" && !normalizeAmount(value)) fieldIssues.push("Amount must be numeric");
    if (score < 0.75) fieldIssues.push("Low OCR confidence");
    if (fieldIssues.length) issues[key] = fieldIssues;
  });
  return issues;
}

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [formTypes, setFormTypes] = useState(DEFAULT_FORM_TYPES);
  const [auditEvents, setAuditEvents] = useState([]);
  const [activePage, setActivePage] = useState(() => routeFromHash());
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [selectedRegistrationId, setSelectedRegistrationId] = useState("");
  const [recordSearch, setRecordSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(() => loadStored(STORAGE_KEYS.theme, "light") === "dark");
  const [apiLoading, setApiLoading] = useState(true);
  const [apiBusy, setApiBusy] = useState(false);
  const [apiError, setApiError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => { refreshData(); }, []);

  useEffect(() => {
    const handleRouteChange = () => setActivePage(routeFromHash());
    window.addEventListener("hashchange", handleRouteChange);
    if (!window.location.hash) window.history.replaceState(null, "", hashForRoute(activePage));
    return () => window.removeEventListener("hashchange", handleRouteChange);
  }, []);

  useEffect(() => {
    saveStored(STORAGE_KEYS.theme, darkMode ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const selectedDocument = documents.find((item) => item.id === selectedDocumentId) ?? documents[0] ?? null;
  const selectedRegistration = registrations.find((item) => item.id === selectedRegistrationId) ?? registrations[0] ?? null;
  const getFormType = (id) => formTypes.find((item) => item.id === id) ?? {
    id,
    name: id || "Uncategorized",
    label: id || "Uncategorized",
    description: "",
  };

  async function refreshData(options = {}) {
    const preferredDocumentId = options.documentId ?? selectedDocumentId;
    const preferredRegistrationId = options.registrationId ?? selectedRegistrationId;
    setApiLoading(true);
    setApiError("");
    try {
      const data = await fetchDashboardData();
      setTemplates(data.templates);
      setRegistrations(data.registrations);
      setFormTypes(data.formTypes?.length ? data.formTypes : DEFAULT_FORM_TYPES);
      setDocuments(data.documents);
      setAuditEvents(data.auditEvents ?? []);
      setSelectedDocumentId(data.documents.find((item) => item.id === preferredDocumentId)?.id ?? data.documents[0]?.id ?? "");
      setSelectedRegistrationId(data.registrations.find((item) => item.id === preferredRegistrationId)?.id ?? data.registrations[0]?.id ?? "");
    } catch (error) {
      setApiError(`Cannot connect to backend API at ${API_BASE_URL}. ${error.message}`);
    } finally {
      setApiLoading(false);
    }
  }

  const stats = useMemo(() => {
    const activeTemplates = templates.filter((template) => template.status === "Active").length;
    const pendingTemplates = registrations.filter((job) => job.status !== "Registered").length;
    const needsReview = documents.filter((document) => document.status === "Needs Review").length;
    const ready = documents.filter((document) => document.status === "Ready to Sync").length;
    const synced = documents.filter((document) => document.syncStatus === "Synced").length;
    const processing = documents.filter((document) => document.status === "Processing").length;
    const averageConfidence = documents.length ? documents.reduce((sum, document) => sum + document.confidence, 0) / documents.length : 0;
    return { activeTemplates, pendingTemplates, needsReview, ready, synced, processing, averageConfidence };
  }, [documents, templates, registrations]);

  const navItems = [
    { id: APP_ROUTES.WORK_QUEUE, label: "Work Queue", icon: ClipboardCheck, count: stats.needsReview },
    { id: APP_ROUTES.TEMPLATES, label: "Templates", icon: LayoutTemplate, count: stats.pendingTemplates },
    { id: APP_ROUTES.PROCESS, label: "Process Documents", icon: ScanLine },
    { id: APP_ROUTES.RECORDS, label: "Records", icon: Database },
    { id: APP_ROUTES.REPORTS, label: "Reports & Export", icon: Download },
  ];
  const activeNavItem = navItems.find((item) => item.id === activePage) ?? navItems[0];

  function navigate(page) {
    const nextPage = normalizeRoute(page);
    setActivePage(nextPage);
    window.history.pushState(null, "", hashForRoute(nextPage));
  }

  function updateDocumentField(key, value) {
    if (!selectedDocument) return;
    setDocuments((current) => current.map((document) => document.id === selectedDocument.id ? {
      ...document,
      status: document.syncStatus === "Synced" ? document.status : "Needs Review",
      extracted: { ...document.extracted, [key]: value },
      auditTrail: [...(document.auditTrail ?? []), { at: nowText(), action: `Updated ${fieldByKey(key)?.label ?? key}` }],
    } : document));
  }

  async function saveSelectedDocumentCorrections() {
    if (!selectedDocument) return;
    setApiBusy(true);
    setApiError("");
    try {
      await saveDocumentFields(selectedDocument.id, selectedDocument.extracted);
      setActionMessage("Corrections saved to backend.");
      await refreshData({ documentId: selectedDocument.id });
    } catch (error) {
      setApiError(`Could not save corrections. ${error.message}`);
    } finally {
      setApiBusy(false);
    }
  }

  async function setDocumentStatus(status) {
    if (!selectedDocument) return;
    setApiBusy(true);
    setApiError("");
    try {
      await updateBackendDocumentStatus(selectedDocument.id, status);
      setActionMessage(`Document status changed to ${status}.`);
      await refreshData({ documentId: selectedDocument.id });
    } catch (error) {
      setApiError(`Could not update document status. ${error.message}`);
    } finally {
      setApiBusy(false);
    }
  }

  async function deleteDocument(id) {
    if (!window.confirm("Delete this document and its review data?")) return;
    setApiBusy(true);
    setApiError("");
    try {
      await deleteBackendDocument(id);
      setActionMessage("Document deleted from backend.");
      await refreshData({ documentId: "" });
    } catch (error) {
      setApiError(`Could not delete document. ${error.message}`);
    } finally {
      setApiBusy(false);
    }
  }

  async function approveRegistration(jobId) {
    setApiBusy(true);
    setApiError("");
    try {
      await approveTemplateRegistration(jobId);
      setActionMessage("Template approved and registered.");
      await refreshData({ registrationId: jobId });
    } catch (error) {
      setApiError(`Could not approve template. ${error.message}`);
    } finally {
      setApiBusy(false);
    }
  }

  async function refreshRegistration(jobId, { quiet = false } = {}) {
    try {
      const registration = await fetchTemplateRegistration(jobId);
      setRegistrations((current) => {
        const exists = current.some((item) => item.id === jobId);
        return exists
          ? current.map((item) => item.id === jobId ? registration : item)
          : [registration, ...current];
      });
      setSelectedRegistrationId(jobId);
      return registration;
    } catch (error) {
      if (!quiet) setApiError(`Could not refresh template registration. ${error.message}`);
      throw error;
    }
  }

  async function saveRegistrationFields(jobId, fields) {
    setApiBusy(true);
    setApiError("");
    setRegistrations((current) => current.map((job) => job.id === jobId ? { ...job, fields, detectedFields: fields } : job));
    try {
      await updateTemplateRegistrationFields(jobId, fields);
      setActionMessage("Template field map saved.");
      await refreshData({ registrationId: jobId });
    } catch (error) {
      setApiError(`Could not save template fields. ${error.message}`);
      await refreshData({ registrationId: jobId });
    } finally {
      setApiBusy(false);
    }
  }

  async function downloadExport(path, fileName) {
    setApiError("");
    try {
      await downloadBackendFile(path, fileName);
    } catch (error) {
      setApiError(`Could not download export. ${error.message}`);
    }
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <div className="sidebar-header">
          <div className="brand"><span className="brand-mark"><ScanLine size={21} /></span>{sidebarOpen && <div><strong>FormFlow OCR</strong><span>Insurance operations</span></div>}</div>
          <button className="icon-button" type="button" onClick={() => setSidebarOpen((value) => !value)} aria-label="Toggle sidebar">{sidebarOpen ? <ChevronLeft size={18} /> : <Menu size={18} />}</button>
        </div>
        <nav className="side-nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={activePage === item.id ? "active" : ""} type="button" title={item.label} onClick={() => navigate(item.id)}><Icon size={18} />{sidebarOpen && <span>{item.label}</span>}{sidebarOpen && item.count > 0 && <em>{item.count}</em>}</button>;
          })}
        </nav>
        <div className="sidebar-footer">
          {sidebarOpen && <div className="operator-card"><span className="operator-avatar">CR</span><div><strong>Claims Review</strong><small>Operations team</small></div></div>}
          <button className="theme-button" type="button" onClick={() => setDarkMode((value) => !value)}>{darkMode ? <Sun size={17} /> : <Moon size={17} />}{sidebarOpen && <span>{darkMode ? "Light mode" : "Dark mode"}</span>}</button>
        </div>
      </aside>

      <main className={`workspace ${sidebarOpen ? "expanded" : "collapsed"}`}>
        <header className="workspace-topbar">
          <div className="topbar-context"><span>Operations</span><ChevronRight size={14} /><strong>{activeNavItem.label}</strong></div>
          <div className="topbar-actions"><span className={`system-state ${apiError ? "error" : apiLoading ? "loading" : ""}`}><i />{apiError ? "OCR services offline" : apiLoading ? "Checking services" : "OCR services connected"}</span><button className="icon-button" type="button" aria-label="Help"><CircleHelp size={18} /></button><button className="icon-button notification-button" type="button" aria-label="Notifications"><Bell size={18} />{(stats.needsReview + stats.pendingTemplates) > 0 && <i />}</button></div>
        </header>

        <div className="workspace-content">
          {activePage === APP_ROUTES.WORK_QUEUE && <WorkQueuePage stats={stats} registrations={registrations} documents={documents} onRefresh={() => { setActionMessage(""); refreshData(); }} setActivePage={navigate} getFormType={getFormType} />}
          {activePage === APP_ROUTES.TEMPLATES && <TemplateWorkspace templates={templates} registrations={registrations} selectedRegistration={selectedRegistration} selectedRegistrationId={selectedRegistrationId} setSelectedRegistrationId={setSelectedRegistrationId} approveRegistration={approveRegistration} refreshData={refreshData} refreshRegistration={refreshRegistration} saveRegistrationFields={saveRegistrationFields} setApiError={setApiError} formTypes={formTypes} getFormType={getFormType} getRegistrationFields={getRegistrationFields} />}
          {activePage === APP_ROUTES.PROCESS && <DocumentWorkspace documents={documents} templates={templates} selectedDocument={selectedDocument} selectedDocumentId={selectedDocumentId} setSelectedDocumentId={setSelectedDocumentId} updateDocumentField={updateDocumentField} saveSelectedDocumentCorrections={saveSelectedDocumentCorrections} setDocumentStatus={setDocumentStatus} syncSelectedDocument={() => setDocumentStatus("Synced")} deleteDocument={deleteDocument} refreshData={refreshData} setApiError={setApiError} fieldLibrary={FIELD_LIBRARY} fieldGroups={FIELD_GROUPS} validateDocument={validateDocument} getFormType={getFormType} />}
          {activePage === APP_ROUTES.RECORDS && <RecordsWorkspace documents={documents} templates={templates} auditEvents={auditEvents} recordSearch={recordSearch} setRecordSearch={setRecordSearch} selectedDocumentId={selectedDocumentId} setSelectedDocumentId={setSelectedDocumentId} setActivePage={navigate} getFormType={getFormType} formatAmount={formatAmount} />}
          {activePage === APP_ROUTES.REPORTS && <ExportHub documents={documents} downloadExport={downloadExport} />}
          {(apiLoading || apiBusy || apiError || actionMessage) && <ApiBanner loading={apiLoading || apiBusy} error={apiError} message={actionMessage} />}
        </div>
      </main>
    </div>
  );
}

function WorkQueuePage({ stats, registrations, documents, onRefresh, setActivePage, getFormType }) {
  const reviewDocuments = documents
    .filter((document) => document.status === DOCUMENT_STATUSES.NEEDS_REVIEW || document.status === DOCUMENT_STATUSES.FAILED)
    .sort((left, right) => Number(left.confidence) - Number(right.confidence));
  const latestDocuments = documents.slice(0, 5);
  const pendingRegistration = registrations.find((job) => job.status !== "Registered");

  return (
    <div className="page">
      <PageHeader eyebrow="Today’s work" title="Claims review work queue" description="Review OCR exceptions, approve template drafts, and move completed claims into your core system."><button className="button secondary" type="button" onClick={onRefresh}><RefreshCw size={16} /> Refresh</button></PageHeader>
      <section className="work-overview">
        <div className="work-intro-card"><div><span className="section-label">Start a workflow</span><h2>What would you like to process?</h2><p>Upload completed claims for extraction, or register a blank form as a reusable template.</p></div><div className="hero-actions"><button className="button primary" type="button" onClick={() => setActivePage(APP_ROUTES.PROCESS)}><ScanLine size={17} /> Process documents</button><button className="button secondary" type="button" onClick={() => setActivePage(APP_ROUTES.TEMPLATES)}><LayoutTemplate size={17} /> Register template</button></div></div>
        <div className="service-card"><span className="service-icon"><CheckCircle2 size={20} /></span><div><span className="section-label">Service status</span><strong>OCR pipeline is ready</strong><small>{stats.activeTemplates} active templates available for matching</small></div></div>
      </section>
      <section className="metrics-grid work-metrics"><MetricCard icon={<ClipboardCheck />} label="Needs review" value={stats.needsReview} tone="warn" /><MetricCard icon={<Loader2 />} label="Processing" value={stats.processing} /><MetricCard icon={<LayoutTemplate />} label="Template drafts" value={stats.pendingTemplates} tone="warn" /><MetricCard icon={<CheckCircle2 />} label="Ready to sync" value={stats.ready} tone="good" /></section>
      <div className="work-grid">
        <section className="panel review-queue-panel">
          <div className="panel-heading compact"><div><span className="section-label">Priority queue</span><h2>Documents requiring attention</h2><p>Items with validation issues and lower confidence appear first.</p></div><button className="button text-button" type="button" onClick={() => setActivePage(APP_ROUTES.PROCESS)}>View all <ChevronRight size={16} /></button></div>
          {reviewDocuments.length ? <div className="work-list">{reviewDocuments.slice(0, 6).map((document) => <button className="work-item" type="button" key={document.id} onClick={() => setActivePage(APP_ROUTES.PROCESS)}><span className={`priority-marker ${getReviewPriority(document)}`} /><span className="file-icon"><FileText size={18} /></span><span className="work-item-copy"><strong>{document.fileName}</strong><small>{getFormType(document.formTypeId).label} · {document.id}</small></span><span className="confidence-summary"><small>Confidence</small><strong>{Math.round(document.confidence * 100)}%</strong></span><StatusBadge status={document.status} /><ChevronRight size={17} /></button>)}</div> : <div className="queue-clear"><span><CheckCircle2 size={24} /></span><strong>Your review queue is clear</strong><p>New OCR exceptions and completed extractions will appear here.</p><button className="button secondary" type="button" onClick={() => setActivePage(APP_ROUTES.PROCESS)}>Process a document</button></div>}
        </section>
        <div className="work-side-stack">
          <section className="panel attention-panel"><PanelTitle eyebrow="Template registry" title="Attention needed" />{pendingRegistration ? <button className="attention-item" type="button" onClick={() => setActivePage(APP_ROUTES.TEMPLATES)}><span><AlertTriangle size={18} /></span><div><strong>Template awaiting review</strong><small>{pendingRegistration.fileName}</small></div><ChevronRight size={16} /></button> : <p className="quiet-copy">No template drafts require approval.</p>}</section>
          <section className="panel recent-panel"><PanelTitle eyebrow="Recent activity" title="Latest documents" />{latestDocuments.length ? <div className="activity-list compact-list">{latestDocuments.map((document) => <div className="activity-item" key={document.id}><span className="activity-icon"><Clock3 size={15} /></span><div><strong>{document.fileName}</strong><small>{document.id}</small></div><StatusBadge status={document.status} /></div>)}</div> : <p className="quiet-copy">No documents have been processed yet.</p>}</section>
        </div>
      </div>
    </div>
  );
}

function ExportHub({ documents, downloadExport }) {
  const ready = documents.filter((document) => document.status === "Ready to Sync" || document.status === "Synced");
  return (
    <div className="page">
      <PageHeader eyebrow="Output hub" title="Export and integration handoff" description="Export reviewed records for operations teams, downstream systems, and integration handoff." />
      <div className="export-grid">
        <ExportCard icon={<FileJson />} title="JSON" text="Structured OCR output with templates, confidence, and field values." meta={`${documents.length} records`} actionLabel="Download JSON" onClick={() => downloadExport("/api/export/json", `insurance-ocr-payload-${new Date().toISOString().slice(0, 10)}.json`)} />
        <ExportCard icon={<FileSpreadsheet />} title="CSV" text="Flat table for spreadsheet review, reconciliation, and manual import tasks." meta={`${documents.length} rows`} actionLabel="Download CSV" onClick={() => downloadExport("/api/export/csv", `insurance-ocr-records-${new Date().toISOString().slice(0, 10)}.csv`)} />
        <ExportCard icon={<Table2 />} title="Excel" text="Excel-compatible export for operations teams that work outside the claims system." meta="XLS compatible" actionLabel="Download Excel" onClick={() => downloadExport("/api/export/excel", `insurance-ocr-records-${new Date().toISOString().slice(0, 10)}.xls`)} />
        <ExportCard icon={<Database />} title="Database" text="Ready-record package shaped for later backend persistence." meta={`${ready.length} ready records`} actionLabel="Download handoff" onClick={() => downloadExport("/api/export/json", "insurance-ocr-database-handoff.json")} />
        <ExportCard icon={<FileCode2 />} title="API" text="API-style JSON payload for downstream claims services." meta="Frontend payload" actionLabel="Download API payload" onClick={() => downloadExport("/api/export/json", "insurance-ocr-api-payload.json")} />
        <ExportCard icon={<Archive />} title="Correction data" text="Human corrections and review events prepared for model improvement." meta="Audit included" actionLabel="Download corrections" onClick={() => downloadExport("/api/audit-events", "insurance-ocr-corrections.json")} />
      </div>
    </div>
  );
}

function ExportCard({ icon, title, text, meta, actionLabel, onClick }) {
  return <section className="export-card"><span>{icon}</span><strong>{title}</strong><p>{text}</p><small>{meta}</small><button className="button secondary" type="button" onClick={onClick}><Download size={16} /> {actionLabel}</button></section>;
}

function PageHeader({ eyebrow, title, description, children }) {
  return <header className="page-header"><div><span className="section-label">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children && <div className="page-actions">{children}</div>}</header>;
}

function PanelTitle({ eyebrow, title }) {
  return <div className="panel-heading"><div><span className="section-label">{eyebrow}</span><h2>{title}</h2></div></div>;
}

function MetricCard({ icon, label, value, tone = "default" }) {
  return <article className={`metric-card ${tone}`}><span>{icon}</span><div><strong>{value}</strong><small>{label}</small></div></article>;
}

function StatusBadge({ status }) {
  return <span className={`status-badge ${statusSlug(status)}`}>{status}</span>;
}

function ApiBanner({ loading, error, message }) {
  return <div className={`api-banner ${error ? "error" : ""}`}>{loading ? <Loader2 size={16} /> : error ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}<span>{error || message || "Loading backend data…"}</span></div>;
}
