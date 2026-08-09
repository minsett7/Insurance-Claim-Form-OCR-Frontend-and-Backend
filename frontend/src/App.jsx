import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  Bell,
  BookOpenCheck,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  CloudUpload,
  Database,
  Download,
  FileCheck2,
  FileCode2,
  FileJson,
  FileSearch,
  FileSpreadsheet,
  FileText,
  Flame,
  Gauge,
  HeartPulse,
  LayoutDashboard,
  LayoutTemplate,
  Loader2,
  LockKeyhole,
  Menu,
  Moon,
  Plus,
  RefreshCw,
  Save,
  ScanLine,
  Search,
  Send,
  Settings,
  Shield,
  SlidersHorizontal,
  Sun,
  Table2,
  Trash2,
  UploadCloud,
  Users,
  Workflow,
  X,
} from "lucide-react";
import {
  API_BASE_URL,
  approveTemplateRegistration,
  deleteDocument as deleteBackendDocument,
  downloadBackendFile,
  fetchDashboardData,
  saveDocumentFields,
  updateDocumentStatus as updateBackendDocumentStatus,
  updateTemplateRegistrationFields,
  uploadCompletedDocuments,
  uploadTemplateRegistration,
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

const STORAGE_KEYS = {
  theme: "insureocr.theme.v2",
};

const FORM_TYPES = [
  {
    id: "health",
    name: "Health",
    label: "Health Claim",
    icon: HeartPulse,
    accent: "#15803d",
    owner: "Health Claims",
    description: "Medical reimbursement, hospitalization, and clinical claim forms.",
  },
  {
    id: "life",
    name: "Life",
    label: "Life Claim",
    icon: Shield,
    accent: "#4f46e5",
    owner: "Life Claims",
    description: "Life policy claim forms, beneficiary records, and payout requests.",
  },
  {
    id: "motor",
    name: "Motor",
    label: "Motor Claim",
    icon: Car,
    accent: "#b45309",
    owner: "Motor Claims",
    description: "Vehicle accident, repair estimate, and motor policy claim forms.",
  },
  {
    id: "fire",
    name: "Fire",
    label: "Fire Claim",
    icon: Flame,
    accent: "#b91c1c",
    owner: "Fire Claims",
    description: "Fire, property damage, stock loss, and incident report forms.",
  },
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
  "policyNumber",
  "claimNumber",
  "formType",
  "claimantName",
  "insuredName",
  "phone",
  "email",
  "address",
  "lossDate",
  "reportedDate",
  "claimCategory",
  "description",
  "amountClaimed",
  "currency",
  "paymentMethod",
  "bankReference",
  "assignedTeam",
  "priority",
];

function getFormType(id) {
  return FORM_TYPES.find((item) => item.id === id) ?? FORM_TYPES[0];
}

function getRegistrationFields(job) {
  if (Array.isArray(job?.fields)) return job.fields;
  if (Array.isArray(job?.detectedFields)) return job.detectedFields;
  return DEFAULT_FIELD_KEYS;
}

function toPercent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
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
    // The UI still works if browser storage is unavailable.
  }
}

function nowText() {
  return new Date().toLocaleString("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).replace(",", "");
}

function normalizeAmount(value) {
  return String(value ?? "").replace(/[^\d.]/g, "");
}

function formatAmount(value, currency = "") {
  const amount = Number(normalizeAmount(value));
  if (!Number.isFinite(amount) || !normalizeAmount(value)) return value || "-";
  return `${amount.toLocaleString("en-US")}${currency ? ` ${currency}` : ""}`;
}

function confidenceTone(value) {
  const numeric = Number(value);
  if (numeric >= 0.9) return "good";
  if (numeric >= 0.75) return "warn";
  return "bad";
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

function App() {
  const [documents, setDocuments] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [activePage, setActivePage] = useState(() => routeFromHash());
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [selectedRegistrationId, setSelectedRegistrationId] = useState("");
  const [activeFieldGroup, setActiveFieldGroup] = useState("Policy");
  const [recordSearch, setRecordSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(() => loadStored(STORAGE_KEYS.theme, "light") === "dark");
  const [apiLoading, setApiLoading] = useState(true);
  const [apiBusy, setApiBusy] = useState(false);
  const [apiError, setApiError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    refreshData();
  }, []);

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

  async function refreshData(options = {}) {
    const preferredDocumentId = options.documentId ?? selectedDocumentId;
    const preferredRegistrationId = options.registrationId ?? selectedRegistrationId;
    setApiLoading(true);
    setApiError("");

    try {
      const data = await fetchDashboardData();
      setTemplates(data.templates);
      setRegistrations(data.registrations);
      setDocuments(data.documents);
      setAuditEvents(data.auditEvents ?? []);
      setSelectedDocumentId(data.documents.find((item) => item.id === preferredDocumentId)?.id ?? data.documents[0]?.id ?? "");
      setSelectedRegistrationId(
        data.registrations.find((item) => item.id === preferredRegistrationId)?.id ?? data.registrations[0]?.id ?? "",
      );
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
    const averageConfidence = documents.length
      ? documents.reduce((sum, document) => sum + document.confidence, 0) / documents.length
      : 0;
    return { activeTemplates, pendingTemplates, needsReview, ready, synced, processing, averageConfidence };
  }, [documents, templates, registrations]);

  const filteredDocuments = useMemo(() => {
    const query = recordSearch.trim().toLowerCase();
    if (!query) return documents;

    return documents.filter((document) => {
      const template = templates.find((item) => item.id === document.templateId);
      const values = [
        document.id,
        document.fileName,
        document.status,
        document.syncStatus,
        template?.name,
        getFormType(document.formTypeId).label,
        ...Object.values(document.extracted ?? {}),
      ];
      return values.join(" ").toLowerCase().includes(query);
    });
  }, [documents, recordSearch, templates]);

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

  function refreshBackendData() {
    setActionMessage("");
    refreshData();
  }

  function updateDocumentField(key, value) {
    if (!selectedDocument) return;
    setDocuments((current) =>
      current.map((document) =>
        document.id === selectedDocument.id
          ? {
              ...document,
              status: document.syncStatus === "Synced" ? document.status : "Needs Review",
              extracted: { ...document.extracted, [key]: value },
              auditTrail: [
                ...(document.auditTrail ?? []),
                { at: nowText(), action: `Updated ${fieldByKey(key)?.label ?? key}` },
              ],
            }
          : document,
      ),
    );
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

  async function syncSelectedDocument() {
    if (!selectedDocument) return;
    await setDocumentStatus("Synced");
  }

  async function deleteDocument(id) {
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

  async function saveRegistrationFields(jobId, fields) {
    setApiBusy(true);
    setApiError("");
    setRegistrations((current) =>
      current.map((job) => (job.id === jobId ? { ...job, fields, detectedFields: fields } : job)),
    );
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
          <div className="brand">
            <span className="brand-mark"><ScanLine size={21} /></span>
            {sidebarOpen && (
              <div>
                <strong>FormFlow OCR</strong>
                <span>Insurance operations</span>
              </div>
            )}
          </div>
          <button className="icon-button" type="button" onClick={() => setSidebarOpen((value) => !value)} aria-label="Toggle sidebar">
            {sidebarOpen ? <ChevronLeft size={18} /> : <Menu size={18} />}
          </button>
        </div>

        <nav className="side-nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={activePage === item.id ? "active" : ""}
                type="button"
                title={item.label}
                onClick={() => navigate(item.id)}
              >
                <Icon size={18} />
                {sidebarOpen && <span>{item.label}</span>}
                {sidebarOpen && item.count > 0 && <em>{item.count}</em>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          {sidebarOpen && (
            <div className="operator-card">
              <span className="operator-avatar">CR</span>
              <div>
                <strong>Claims Review</strong>
                <small>Operations team</small>
              </div>
            </div>
          )}
          <button className="theme-button" type="button" onClick={() => setDarkMode((value) => !value)}>
            {darkMode ? <Sun size={17} /> : <Moon size={17} />}
            {sidebarOpen && <span>{darkMode ? "Light mode" : "Dark mode"}</span>}
          </button>
        </div>
      </aside>

      <main className={`workspace ${sidebarOpen ? "expanded" : "collapsed"}`}>
        <header className="workspace-topbar">
          <div className="topbar-context">
            <span>Operations</span>
            <ChevronRight size={14} />
            <strong>{activeNavItem.label}</strong>
          </div>
          <div className="topbar-actions">
            <span className={`system-state ${apiError ? "error" : apiLoading ? "loading" : ""}`}>
              <i /> {apiError ? "OCR services offline" : apiLoading ? "Checking services" : "OCR services connected"}
            </span>
            <button className="icon-button" type="button" aria-label="Help"><CircleHelp size={18} /></button>
            <button className="icon-button notification-button" type="button" aria-label="Notifications">
              <Bell size={18} />
              {(stats.needsReview + stats.pendingTemplates) > 0 && <i />}
            </button>
          </div>
        </header>

        <div className="workspace-content">
        {activePage === APP_ROUTES.WORK_QUEUE && (
          <WorkQueuePage
            stats={stats}
            templates={templates}
            registrations={registrations}
            documents={documents}
            onRefresh={refreshBackendData}
            setActivePage={navigate}
          />
        )}
        {activePage === APP_ROUTES.TEMPLATES && (
          <TemplateWorkspace
            templates={templates}
            registrations={registrations}
            selectedRegistration={selectedRegistration}
            selectedRegistrationId={selectedRegistrationId}
            setSelectedRegistrationId={setSelectedRegistrationId}
            approveRegistration={approveRegistration}
            refreshData={refreshData}
            saveRegistrationFields={saveRegistrationFields}
            setApiError={setApiError}
            formTypes={FORM_TYPES}
            getFormType={getFormType}
            getRegistrationFields={getRegistrationFields}
          />
        )}
        {activePage === APP_ROUTES.PROCESS && (
          <DocumentWorkspace
            documents={documents}
            templates={templates}
            selectedDocument={selectedDocument}
            selectedDocumentId={selectedDocumentId}
            setSelectedDocumentId={setSelectedDocumentId}
            updateDocumentField={updateDocumentField}
            saveSelectedDocumentCorrections={saveSelectedDocumentCorrections}
            setDocumentStatus={setDocumentStatus}
            syncSelectedDocument={syncSelectedDocument}
            deleteDocument={deleteDocument}
            refreshData={refreshData}
            setApiError={setApiError}
            fieldLibrary={FIELD_LIBRARY}
            fieldGroups={FIELD_GROUPS}
            validateDocument={validateDocument}
            getFormType={getFormType}
          />
        )}
        {activePage === APP_ROUTES.RECORDS && (
          <RecordsWorkspace
            documents={documents}
            templates={templates}
            auditEvents={auditEvents}
            recordSearch={recordSearch}
            setRecordSearch={setRecordSearch}
            selectedDocumentId={selectedDocumentId}
            setSelectedDocumentId={setSelectedDocumentId}
            setActivePage={navigate}
            getFormType={getFormType}
            formatAmount={formatAmount}
          />
        )}
        {activePage === APP_ROUTES.REPORTS && (
          <ExportHub documents={documents} downloadExport={downloadExport} />
        )}
        {(apiLoading || apiBusy || apiError || actionMessage) && (
          <ApiBanner loading={apiLoading || apiBusy} error={apiError} message={actionMessage} />
        )}
        </div>
      </main>
    </div>
  );
}

function WorkQueuePage({ stats, templates, registrations, documents, onRefresh, setActivePage }) {
  const reviewDocuments = documents
    .filter((document) => document.status === DOCUMENT_STATUSES.NEEDS_REVIEW || document.status === DOCUMENT_STATUSES.FAILED)
    .sort((a, b) => Number(a.confidence) - Number(b.confidence));
  const latestDocuments = documents.slice(0, 5);
  const pendingRegistration = registrations.find((job) => job.status !== "Registered");

  return (
    <div className="page">
      <PageHeader
        eyebrow="Today’s work"
        title="Claims review work queue"
        description="Review OCR exceptions, approve template drafts, and move completed claims into your core system."
      >
        <button className="button secondary" type="button" onClick={onRefresh}>
          <RefreshCw size={16} /> Refresh
        </button>
      </PageHeader>

      <section className="work-overview">
        <div className="work-intro-card">
          <div>
            <span className="section-label">Start a workflow</span>
            <h2>What would you like to process?</h2>
            <p>Upload completed claims for extraction, or register a blank form as a reusable template.</p>
          </div>
          <div className="hero-actions">
            <button className="button primary" type="button" onClick={() => setActivePage(APP_ROUTES.PROCESS)}>
              <ScanLine size={17} /> Process documents
            </button>
            <button className="button secondary" type="button" onClick={() => setActivePage(APP_ROUTES.TEMPLATES)}>
              <LayoutTemplate size={17} /> Register template
            </button>
          </div>
        </div>

        <div className="service-card">
          <span className="service-icon"><CheckCircle2 size={20} /></span>
          <div>
            <span className="section-label">Service status</span>
            <strong>OCR pipeline is ready</strong>
            <small>{stats.activeTemplates} active templates available for matching</small>
          </div>
        </div>
      </section>

      <section className="metrics-grid work-metrics">
        <MetricCard icon={<ClipboardCheck />} label="Needs review" value={stats.needsReview} tone="warn" />
        <MetricCard icon={<Loader2 />} label="Processing" value={stats.processing} />
        <MetricCard icon={<LayoutTemplate />} label="Template drafts" value={stats.pendingTemplates} tone="warn" />
        <MetricCard icon={<CheckCircle2 />} label="Ready to sync" value={stats.ready} tone="good" />
      </section>

      <div className="work-grid">
        <section className="panel review-queue-panel">
          <div className="panel-heading compact">
            <div>
              <span className="section-label">Priority queue</span>
              <h2>Documents requiring attention</h2>
              <p>Items with validation issues and lower confidence appear first.</p>
            </div>
            <button className="button text-button" type="button" onClick={() => setActivePage(APP_ROUTES.PROCESS)}>
              View all <ChevronRight size={16} />
            </button>
          </div>

          {reviewDocuments.length ? (
            <div className="work-list">
              {reviewDocuments.slice(0, 6).map((document) => (
                <button className="work-item" type="button" key={document.id} onClick={() => setActivePage(APP_ROUTES.PROCESS)}>
                  <span className={`priority-marker ${getReviewPriority(document)}`} />
                  <span className="file-icon"><FileText size={18} /></span>
                  <span className="work-item-copy">
                    <strong>{document.fileName}</strong>
                    <small>{getFormType(document.formTypeId).label} · {document.id}</small>
                  </span>
                  <span className="confidence-summary">
                    <small>Confidence</small>
                    <strong>{Math.round(document.confidence * 100)}%</strong>
                  </span>
                  <StatusBadge status={document.status} />
                  <ChevronRight size={17} />
                </button>
              ))}
            </div>
          ) : (
            <div className="queue-clear">
              <span><CheckCircle2 size={24} /></span>
              <strong>Your review queue is clear</strong>
              <p>New OCR exceptions and completed extractions will appear here.</p>
              <button className="button secondary" type="button" onClick={() => setActivePage(APP_ROUTES.PROCESS)}>
                Process a document
              </button>
            </div>
          )}
        </section>

        <div className="work-side-stack">
          <section className="panel attention-panel">
            <PanelTitle eyebrow="Template registry" title="Attention needed" />
            {pendingRegistration ? (
              <button className="attention-item" type="button" onClick={() => setActivePage(APP_ROUTES.TEMPLATES)}>
                <span><AlertTriangle size={18} /></span>
                <div>
                  <strong>Template awaiting review</strong>
                  <small>{pendingRegistration.fileName}</small>
                </div>
                <ChevronRight size={16} />
              </button>
            ) : (
              <p className="quiet-copy">No template drafts require approval.</p>
            )}
          </section>

          <section className="panel recent-panel">
            <PanelTitle eyebrow="Recent activity" title="Latest documents" />
            {latestDocuments.length ? (
              <div className="activity-list compact-list">
                {latestDocuments.map((document) => (
                  <div className="activity-item" key={document.id}>
                    <span className="activity-icon"><Clock3 size={15} /></span>
                    <div>
                      <strong>{document.fileName}</strong>
                      <small>{document.id}</small>
                    </div>
                    <StatusBadge status={document.status} />
                  </div>
                ))}
              </div>
            ) : <p className="quiet-copy">No documents have been processed yet.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}

function FormTypesPage({ templates, documents, setActivePage }) {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Form type registry"
        title="Supported claim form types"
        description="The current MVP supports four form types. Each form type can hold reusable templates for completed-form processing."
      >
        <button className="button primary" type="button" onClick={() => setActivePage("register")}>
          <Plus size={16} /> Register template
        </button>
      </PageHeader>

      <div className="form-type-grid">
        {FORM_TYPES.map((type) => {
          const Icon = type.icon;
          const formTemplates = templates.filter((template) => template.formTypeId === type.id);
          const formDocuments = documents.filter((document) => document.formTypeId === type.id);
          const activeTemplate = formTemplates.find((template) => template.status === "Active");

          return (
            <section className="form-type-card" style={{ "--accent": type.accent }} key={type.id}>
              <div className="form-type-head">
                <span><Icon size={24} /></span>
                <div>
                  <strong>{type.label}</strong>
                  <small>{type.owner}</small>
                </div>
              </div>
              <p>{type.description}</p>
              <div className="form-type-stats">
                <span><strong>{formTemplates.length}</strong> templates</span>
                <span><strong>{formDocuments.length}</strong> uploads</span>
                <span><strong>{activeTemplate ? "Ready" : "Draft"}</strong> status</span>
              </div>
              <button className="button secondary" type="button" onClick={() => setActivePage("register")}>
                <LayoutTemplate size={16} /> Manage template
              </button>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TemplateRegistrationPage({
  templates,
  registrations,
  selectedRegistration,
  selectedRegistrationId,
  setSelectedRegistrationId,
  approveRegistration,
  refreshData,
  saveRegistrationFields,
  setApiError,
}) {
  const [formTypeId, setFormTypeId] = useState("health");
  const [uploadError, setUploadError] = useState("");
  const selectedTemplate = selectedRegistration
    ? templates.find((template) => template.id === selectedRegistration.templateId)
    : null;

  async function uploadTemplateFiles(event) {
    const files = Array.from(event.target.files ?? []);
    setUploadError("");

    const accepted = files.filter((file) => isSupportedUpload(file));
    if (files.length && accepted.length !== files.length) {
      setUploadError("Some files were skipped. Accepted formats: PDF, PNG, JPG, TIFF up to 15 MB.");
    }

    if (!accepted.length) {
      event.target.value = "";
      return;
    }

    try {
      const result = await uploadTemplateRegistration(formTypeId, accepted);
      const firstId = result.items?.[0]?.id ?? "";
      setSelectedRegistrationId(firstId);
      await refreshData({ registrationId: firstId });
    } catch (error) {
      setApiError(`Template upload failed. ${error.message}`);
    }

    event.target.value = "";
  }

  function updateRegistrationFields(nextFields) {
    if (!selectedRegistration) return;
    saveRegistrationFields(selectedRegistration.id, nextFields);
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Template registration"
        title="Upload new blank forms and approve reusable templates"
        description="Upload a blank claim form, review the generated field map, and approve it as a reusable template."
      />

      <div className="register-layout">
        <aside className="register-left">
          <section className="panel">
            <PanelTitle eyebrow="New form intake" title="Upload blank form" />
            <div className="upload-box template-upload">
              <FormTypeSelector value={formTypeId} onChange={setFormTypeId} />
              <label>
                <CloudUpload size={30} />
                <strong>Upload blank claim form</strong>
                <span>Used only for template registration</span>
                <input type="file" multiple accept="image/*,.pdf,.tif,.tiff" onChange={uploadTemplateFiles} />
              </label>
              {uploadError && <p className="form-error">{uploadError}</p>}
            </div>
          </section>

          <section className="panel">
            <PanelTitle eyebrow="Registration jobs" title="Template drafts" />
            <div className="job-list">
              {registrations.map((job) => (
                <button
                  type="button"
                  className={`job-item ${job.id === selectedRegistrationId ? "active" : ""}`}
                  key={job.id}
                  onClick={() => setSelectedRegistrationId(job.id)}
                >
                  <span className="type-chip" style={{ "--accent": getFormType(job.formTypeId).accent }}>
                    {getFormType(job.formTypeId).name}
                  </span>
                  <div>
                    <strong>{job.fileName}</strong>
                    <small>{job.id} | {getRegistrationFields(job).length} fields detected</small>
                  </div>
                  <StatusBadge status={job.status} />
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section className="panel registration-review">
          {!selectedRegistration ? (
            <EmptyState icon={<LayoutTemplate />} title="No registration selected" text="Upload a blank form to generate a template draft." />
          ) : (
            <>
              <div className="panel-heading">
                <div>
                  <span className="section-label">Automatic template draft</span>
                  <h2>{selectedRegistration.fileName}</h2>
                  <p>{getFormType(selectedRegistration.formTypeId).label} | {selectedRegistration.id}</p>
                </div>
                <div className="review-meta">
                  <StatusBadge status={selectedRegistration.status} />
                  <ConfidenceBadge value={selectedRegistration.layoutScore} />
                </div>
              </div>

              <div className="registration-body">
                <div className="draft-grid">
                  <div className="draft-preview">
                    <DocumentShell
                      title={getFormType(selectedRegistration.formTypeId).label}
                      subtitle="Blank form template"
                      tags={[
                        `${selectedRegistration.detectedRegions ?? 0} regions`,
                        `${toPercent(selectedRegistration.qualityScore)}% quality`,
                        `${toPercent(selectedRegistration.layoutScore)}% layout`,
                      ]}
                    />
                  </div>

                  <div className="draft-fields">
                    <div className="section-row">
                      <div>
                        <span className="section-label">Detected field map</span>
                        <h3>Review generated key names</h3>
                      </div>
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => updateRegistrationFields(DEFAULT_FIELD_KEYS)}
                      >
                        <RefreshCw size={15} /> Restore default
                      </button>
                    </div>
                    <FieldSelector selected={getRegistrationFields(selectedRegistration)} onChange={updateRegistrationFields} />
                  </div>
                </div>

                <div className="registration-actions">
                  <TemplateSummary template={selectedTemplate} />
                  <button
                    className="button primary"
                    type="button"
                    disabled={selectedRegistration.status === "Registered"}
                    onClick={() => approveRegistration(selectedRegistration.id)}
                  >
                    <CheckCircle2 size={16} /> Approve and register template
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function CompletedFormsPage({
  documents,
  templates,
  selectedDocument,
  selectedDocumentId,
  setSelectedDocumentId,
  activeFieldGroup,
  setActiveFieldGroup,
  updateDocumentField,
  saveSelectedDocumentCorrections,
  setDocumentStatus,
  syncSelectedDocument,
  deleteDocument,
  refreshData,
  setApiError,
}) {
  const activeTemplates = templates.filter((template) => template.status === "Active");
  const [templateId, setTemplateId] = useState(activeTemplates[0]?.id ?? "");
  const [uploadError, setUploadError] = useState("");
  const selectedTemplate = selectedDocument ? templates.find((template) => template.id === selectedDocument.templateId) : null;
  const issues = selectedDocument ? validateDocument(selectedDocument, selectedTemplate) : {};
  const issueCount = Object.keys(issues).length;

  useEffect(() => {
    if (!activeTemplates.length) {
      setTemplateId("");
      return;
    }
    if (!templateId || !activeTemplates.some((template) => template.id === templateId)) {
      setTemplateId(activeTemplates[0].id);
    }
  }, [activeTemplates, templateId]);

  async function uploadCompletedForms(event) {
    const files = Array.from(event.target.files ?? []);
    setUploadError("");
    const accepted = files.filter((file) => isSupportedUpload(file));

    if (files.length && accepted.length !== files.length) {
      setUploadError("Some files were skipped. Accepted formats: PDF, PNG, JPG, TIFF up to 15 MB.");
    }
    if (!accepted.length) {
      event.target.value = "";
      return;
    }

    const template = templates.find((item) => item.id === templateId) ?? activeTemplates[0];
    if (!template) {
      setUploadError("No active template is available. Register and approve a template first.");
      event.target.value = "";
      return;
    }

    try {
      const result = await uploadCompletedDocuments(template.id, accepted);
      const firstId = result.items?.[0]?.id ?? "";
      setSelectedDocumentId(firstId);
      await refreshData({ documentId: firstId });
    } catch (error) {
      setApiError(`Completed form upload failed. ${error.message}`);
    }

    event.target.value = "";
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Completed form processing"
        title="Upload filled forms and review extracted data"
        description="Completed forms reuse approved templates, then move through quality checks, template matching, extraction, validation, and human review."
      />

      <div className="processing-layout">
        <aside className="processing-sidebar">
          <section className="panel">
            <PanelTitle eyebrow="Completed form intake" title="Upload filled data forms" />
            <div className="upload-box">
              <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                {activeTemplates.map((template) => (
                  <option value={template.id} key={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
              <label>
                <UploadCloud size={30} />
                <strong>Upload completed forms</strong>
                <span>Forms already filled by customers or staff</span>
                <input type="file" multiple accept="image/*,.pdf,.tif,.tiff" onChange={uploadCompletedForms} />
              </label>
              {uploadError && <p className="form-error">{uploadError}</p>}
            </div>
          </section>

          <section className="panel queue-panel">
            <PanelTitle eyebrow="Work queue" title="Processing and review" />
            <div className="queue-list">
              {documents.map((document) => (
                <button
                  type="button"
                  className={`queue-item ${document.id === selectedDocumentId ? "active" : ""}`}
                  key={document.id}
                  onClick={() => setSelectedDocumentId(document.id)}
                >
                  <span className="type-chip" style={{ "--accent": getFormType(document.formTypeId).accent }}>
                    {getFormType(document.formTypeId).name}
                  </span>
                  <div>
                    <strong>{document.fileName}</strong>
                    <small>{document.id}</small>
                  </div>
                  <StatusBadge status={document.status} />
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section className="panel review-panel">
          {!selectedDocument ? (
            <EmptyState icon={<FileSearch />} title="No document selected" text="Upload a completed form or select a queued document." />
          ) : (
            <>
              <div className="panel-heading">
                <div>
                  <span className="section-label">Review workspace</span>
                  <h2>{selectedDocument.fileName}</h2>
                  <p>{selectedTemplate?.name ?? "Unknown template"} | {selectedDocument.id}</p>
                </div>
                <div className="review-meta">
                  <StatusBadge status={selectedDocument.status} />
                  <ConfidenceBadge value={selectedDocument.confidence} />
                </div>
              </div>

              <div className="review-body">
                <div className="document-review-left">
                  <DocumentShell
                    title={selectedDocument.extracted.formType}
                    subtitle={`${selectedDocument.pages} page${selectedDocument.pages === 1 ? "" : "s"} | ${selectedDocument.processingTime}`}
                    tags={[
                      selectedDocument.status,
                      `${issueCount} validation groups`,
                      `${Math.round(selectedDocument.confidence * 100)}% confidence`,
                    ]}
                  />
                  <AuditTrail items={selectedDocument.auditTrail ?? []} />
                </div>

                <div className="extraction-card">
                  <div className="tabs">
                    {FIELD_GROUPS.map((group) => {
                      const Icon = group.icon;
                      return (
                        <button
                          type="button"
                          className={activeFieldGroup === group.id ? "active" : ""}
                          key={group.id}
                          onClick={() => setActiveFieldGroup(group.id)}
                        >
                          <Icon size={15} /> {group.id}
                        </button>
                      );
                    })}
                  </div>

                  <div className="field-grid">
                    {FIELD_LIBRARY.filter((field) => field.group === activeFieldGroup).map((field) => {
                      const value = selectedDocument.extracted?.[field.key] ?? "";
                      const score = selectedDocument.confidenceByField?.[field.key] ?? selectedDocument.confidence;
                      const fieldIssues = issues[field.key] ?? [];
                      return (
                        <div className={`field-control ${fieldIssues.length ? "has-error" : ""}`} key={field.key}>
                          <label>
                            <span>{field.label}{field.required && <em>*</em>}</span>
                            <ConfidenceBadge value={score} />
                          </label>
                          <FieldInput field={field} value={value} onChange={(next) => updateDocumentField(field.key, next)} />
                          {fieldIssues.map((issue) => (
                            <small className="field-warning" key={issue}>
                              <AlertCircle size={12} /> {issue}
                            </small>
                          ))}
                        </div>
                      );
                    })}
                  </div>

                  <div className="review-actions">
                    <button className="button secondary" type="button" onClick={saveSelectedDocumentCorrections}>
                      <Save size={16} /> Save correction
                    </button>
                    <button className="button secondary" type="button" onClick={() => setDocumentStatus("Ready to Sync")}>
                      <CheckCircle2 size={16} /> Mark ready
                    </button>
                    <button className="button primary" type="button" onClick={syncSelectedDocument}>
                      <Send size={16} /> Sync to system
                    </button>
                    <button className="button ghost danger-text" type="button" onClick={() => deleteDocument(selectedDocument.id)}>
                      <Trash2 size={16} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function RecordsPage({ documents, templates, recordSearch, setRecordSearch, selectedDocumentId, setSelectedDocumentId, setActivePage }) {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Records"
        title="Extracted claim data"
        description="Search processed records and open any item in the review workspace."
      />

      <section className="panel records-panel">
        <div className="toolbar">
          <label className="search-control">
            <Search size={16} />
            <input value={recordSearch} onChange={(event) => setRecordSearch(event.target.value)} placeholder="Search document, policy, claimant, form type" />
            {recordSearch && (
              <button type="button" aria-label="Clear search" onClick={() => setRecordSearch("")}>
                <X size={15} />
              </button>
            )}
          </label>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Document</th>
                <th>Form Type</th>
                <th>Template</th>
                <th>Policy</th>
                <th>Claimant</th>
                <th>Amount</th>
                <th>Confidence</th>
                <th>Status</th>
                <th>Sync</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => {
                const template = templates.find((item) => item.id === document.templateId);
                return (
                  <tr
                    key={document.id}
                    className={document.id === selectedDocumentId ? "selected" : ""}
                    onClick={() => {
                      setSelectedDocumentId(document.id);
                      setActivePage("process");
                    }}
                  >
                    <td>
                      <strong>{document.id}</strong>
                      <small>{document.fileName}</small>
                    </td>
                    <td>
                      <span className="type-chip" style={{ "--accent": getFormType(document.formTypeId).accent }}>
                        {getFormType(document.formTypeId).name}
                      </span>
                    </td>
                    <td>{template?.name ?? "Unknown"}</td>
                    <td>{document.extracted?.policyNumber || "-"}</td>
                    <td>{document.extracted?.claimantName || "-"}</td>
                    <td>{formatAmount(document.extracted?.amountClaimed, document.extracted?.currency)}</td>
                    <td><ConfidenceBadge value={document.confidence} /></td>
                    <td><StatusBadge status={document.status} /></td>
                    <td>{document.syncStatus}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ExportHub({ documents, downloadExport }) {
  const ready = documents.filter((document) => document.status === "Ready to Sync" || document.status === "Synced");

  return (
    <div className="page">
      <PageHeader
        eyebrow="Output hub"
        title="Export and integration handoff"
        description="Export reviewed records for operations teams, downstream systems, and integration handoff."
      />

      <div className="export-grid">
        <ExportCard
          icon={<FileJson />}
          title="JSON"
          text="Structured OCR output with templates, registrations, confidence, and field values."
          meta={`${documents.length} records`}
          actionLabel="Download JSON"
          onClick={() => downloadExport("/api/export/json", `insurance-ocr-payload-${new Date().toISOString().slice(0, 10)}.json`)}
        />
        <ExportCard
          icon={<FileSpreadsheet />}
          title="CSV"
          text="Flat table for spreadsheet review, reconciliation, and manual import tasks."
          meta={`${documents.length} rows`}
          actionLabel="Download CSV"
          onClick={() => downloadExport("/api/export/csv", `insurance-ocr-records-${new Date().toISOString().slice(0, 10)}.csv`)}
        />
        <ExportCard
          icon={<Table2 />}
          title="Excel"
          text="Excel-compatible export for operations teams that work outside the claims system."
          meta="XLS compatible"
          actionLabel="Download Excel"
          onClick={() => downloadExport("/api/export/excel", `insurance-ocr-records-${new Date().toISOString().slice(0, 10)}.xls`)}
        />
        <ExportCard
          icon={<Database />}
          title="Database"
          text="Ready-record package shaped for later backend persistence into PostgreSQL."
          meta={`${ready.length} ready records`}
          actionLabel="Download handoff"
          onClick={() => downloadExport("/api/export/json", "insurance-ocr-database-handoff.json")}
        />
        <ExportCard
          icon={<FileCode2 />}
          title="API"
          text="API-style JSON payload for FastAPI integration and downstream claims services."
          meta="Frontend payload"
          actionLabel="Download API payload"
          onClick={() => downloadExport("/api/export/json", "insurance-ocr-api-payload.json")}
        />
        <ExportCard
          icon={<Archive />}
          title="Correction data"
          text="Human corrections and review events prepared for future model improvement."
          meta="Audit included"
          actionLabel="Download corrections"
          onClick={() => downloadExport("/api/audit-events", "insurance-ocr-corrections.json")}
        />
      </div>
    </div>
  );
}

function FieldSelector({ selected, onChange }) {
  const selectedSet = new Set(selected);

  function toggle(key) {
    const next = new Set(selectedSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(Array.from(next));
  }

  return (
    <div className="field-selector">
      {FIELD_LIBRARY.map((field) => (
        <label key={field.key}>
          <input type="checkbox" checked={selectedSet.has(field.key)} onChange={() => toggle(field.key)} />
          <span>{field.label}</span>
          <small>{field.type}</small>
          {field.required && <em>Required</em>}
        </label>
      ))}
    </div>
  );
}

function FieldInput({ field, value, onChange }) {
  if (field.type === "textarea") {
    return <textarea value={value} onChange={(event) => onChange(event.target.value)} />;
  }

  if (field.type === "formType") {
    return (
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {FORM_TYPES.map((type) => (
          <option key={type.id}>{type.label}</option>
        ))}
      </select>
    );
  }

  if (field.type === "currency") {
    return (
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option>MMK</option>
        <option>USD</option>
        <option>EUR</option>
      </select>
    );
  }

  if (field.type === "priority") {
    return (
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option>High</option>
        <option>Normal</option>
        <option>Low</option>
      </select>
    );
  }

  return (
    <input
      type={field.type === "date" ? "date" : field.type === "email" ? "email" : "text"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function FormTypeSelector({ value, onChange }) {
  return (
    <div className="form-type-selector" role="radiogroup" aria-label="Form type">
      {FORM_TYPES.map((type) => {
        const Icon = type.icon;
        return (
          <button
            key={type.id}
            type="button"
            className={value === type.id ? "active" : ""}
            style={{ "--accent": type.accent }}
            onClick={() => onChange(type.id)}
          >
            <Icon size={16} />
            <span>{type.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function DocumentShell({ title, subtitle, tags }) {
  return (
    <div className="document-shell">
      <div className="document-shell-header">
        <FileText size={24} />
        <div>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
      </div>
      <div className="mock-lines">
        <span className="wide" />
        <span />
        <span className="short" />
        <span className="wide" />
      </div>
      <div className="mock-fields">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="document-tags">
        {tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
    </div>
  );
}

function TemplateSummary({ template }) {
  if (!template) return null;
  const fieldCount = Array.isArray(template.fields) ? template.fields.length : DEFAULT_FIELD_KEYS.length;
  return (
    <div className="template-summary">
      <span className="section-label">Registry target</span>
      <strong>{template.name}</strong>
      <small>{template.id} | {getFormType(template.formTypeId).label} | {fieldCount} fields</small>
    </div>
  );
}

function AuditTrail({ items }) {
  return (
    <section className="audit-card">
      <span className="section-label">Correction history</span>
      <div>
        {items.slice(-4).map((item) => (
          <p key={`${item.at}-${item.action}`}>
            <strong>{item.at}</strong>
            <span>{item.action}</span>
          </p>
        ))}
      </div>
    </section>
  );
}

function ExportCard({ icon, title, text, meta, actionLabel, onClick }) {
  return (
    <section className="export-card">
      <span>{icon}</span>
      <strong>{title}</strong>
      <p>{text}</p>
      <small>{meta}</small>
      <button className="button primary" type="button" onClick={onClick}>
        <Download size={16} /> {actionLabel}
      </button>
    </section>
  );
}

function PageHeader({ eyebrow, title, description, children }) {
  return (
    <header className="page-header">
      <div>
        <span className="section-label">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}

function PanelTitle({ eyebrow, title }) {
  return (
    <div className="panel-heading">
      <div>
        <span className="section-label">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, tone = "default" }) {
  return (
    <div className={`metric-card ${tone}`}>
      <span>{icon}</span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  return <span className={`status-badge ${statusSlug(status)}`}>{status}</span>;
}

function ConfidenceBadge({ value }) {
  return <span className={`confidence-badge ${confidenceTone(value)}`}>{toPercent(value)}%</span>;
}

function ApiBanner({ loading, error, message }) {
  const text = error || (loading ? "Syncing with backend API..." : message);
  if (!text) return null;
  return (
    <div className={`api-banner ${error ? "error" : ""}`}>
      {loading ? <Loader2 size={15} /> : error ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
      <span>{text}</span>
    </div>
  );
}

function EmptyState({ icon, title, text }) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function isSupportedUpload(file) {
  const validType = file.type.startsWith("image/") || file.type === "application/pdf" || /\.(pdf|png|jpg|jpeg|tif|tiff)$/i.test(file.name);
  const validSize = file.size <= 15 * 1024 * 1024;
  return validType && validSize;
}

export default App;
