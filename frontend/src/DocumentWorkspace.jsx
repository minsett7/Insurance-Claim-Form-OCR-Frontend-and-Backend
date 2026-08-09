import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  CloudUpload,
  FileCheck2,
  FileSearch,
  FileText,
  Focus,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  ScanLine,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UploadCloud,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { uploadCompletedDocuments } from "./api";
import { DOCUMENT_PIPELINE } from "./productModel";
import { createDetectedRegions } from "./templateEditorModel";
import {
  REVIEW_FILTERS,
  countDocumentIssues,
  documentMatchConfidence,
  matchTemplateForFile,
  matchesQueueFilter,
  sortFieldsForReview,
} from "./documentReviewModel";

const SUPPORTED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff"];
const MAX_FILE_SIZE = 15 * 1024 * 1024;

function supportedFile(file) {
  const name = file.name.toLowerCase();
  return file.size <= MAX_FILE_SIZE && (file.type.startsWith("image/") || SUPPORTED_EXTENSIONS.some((ext) => name.endsWith(ext)));
}

function statusClass(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function confidenceTone(value) {
  if (Number(value) >= 0.9) return "high";
  if (Number(value) >= 0.75) return "medium";
  return "low";
}

function percent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

export default function DocumentWorkspace({
  documents,
  templates,
  selectedDocument,
  selectedDocumentId,
  setSelectedDocumentId,
  updateDocumentField,
  saveSelectedDocumentCorrections,
  setDocumentStatus,
  syncSelectedDocument,
  deleteDocument,
  refreshData,
  setApiError,
  fieldLibrary,
  fieldGroups,
  validateDocument,
  getFormType,
}) {
  const activeTemplates = templates.filter((template) => template.status === "Active");
  const [showIntake, setShowIntake] = useState(!documents.length);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, fileName: "" });
  const [uploadError, setUploadError] = useState("");
  const [queueFilter, setQueueFilter] = useState("review");
  const [queueSearch, setQueueSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState("Policy");
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [selectedFieldKey, setSelectedFieldKey] = useState("");
  const [previewUrls, setPreviewUrls] = useState({});
  const [templateOverrides, setTemplateOverrides] = useState({});
  const [matchPreviews, setMatchPreviews] = useState({});
  const [confirmedMatches, setConfirmedMatches] = useState({});
  const [zoom, setZoom] = useState(82);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const effectiveTemplateId = selectedDocument
    ? templateOverrides[selectedDocument.id] ?? selectedDocument.templateId
    : "";
  const selectedTemplate = templates.find((template) => template.id === effectiveTemplateId) ?? null;
  const issues = selectedDocument ? validateDocument(selectedDocument, selectedTemplate) : {};
  const issueCount = countDocumentIssues(issues);
  const matchConfidence = selectedDocument
    ? matchPreviews[selectedDocument.id]?.confidence ?? documentMatchConfidence(selectedDocument, selectedTemplate)
    : 0;
  const matchConfirmed = selectedDocument
    ? confirmedMatches[selectedDocument.id] || matchConfidence >= 0.9
    : false;
  const templateFieldKeys = selectedTemplate?.fields?.length ? selectedTemplate.fields : fieldLibrary.map((field) => field.key);
  const documentFields = fieldLibrary.filter((field) => templateFieldKeys.includes(field.key));
  const reviewFields = sortFieldsForReview(documentFields, issues, selectedDocument?.confidenceByField, selectedDocument?.confidence);
  const visibleFields = reviewFields.filter((field) => {
    if (issuesOnly && !issues[field.key]?.length) return false;
    return activeGroup === "all" || field.group === activeGroup;
  });
  const sourceRegions = useMemo(() => createDetectedRegions(templateFieldKeys), [effectiveTemplateId, templateFieldKeys.join("|")]);
  const selectedSourceRegion = sourceRegions.find((region) => region.key === selectedFieldKey);

  const queueDocuments = documents.filter((document) => {
    if (!matchesQueueFilter(document, queueFilter)) return false;
    const query = queueSearch.trim().toLowerCase();
    if (!query) return true;
    return [document.fileName, document.id, document.status, getFormType(document.formTypeId).label]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  useEffect(() => {
    if (!selectedDocument) {
      setSelectedFieldKey("");
      return;
    }
    const firstIssue = Object.keys(issues)[0];
    setSelectedFieldKey(firstIssue ?? templateFieldKeys[0] ?? "");
    setNotice("");
  }, [selectedDocument?.id]);

  useEffect(() => {
    function handleShortcut(event) {
      const target = event.target;
      const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveReview();
      }
      if (!editing && (event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        approveAndNext();
      }
      if (!editing && event.key === "]") goToIssue(1);
      if (!editing && event.key === "[") goToIssue(-1);
      if (!editing && event.key.toLowerCase() === "j") goToQueueDocument(1);
      if (!editing && event.key.toLowerCase() === "k") goToQueueDocument(-1);
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  });

  async function uploadDocuments(event) {
    const files = Array.from(event.target.files ?? []);
    const accepted = files.filter(supportedFile);
    setUploadError("");
    setNotice("");

    if (files.length && accepted.length !== files.length) {
      setUploadError("Some files were skipped. Use PDF, PNG, JPG, or TIFF files up to 15 MB.");
    }
    if (!accepted.length) {
      event.target.value = "";
      return;
    }
    if (!activeTemplates.length) {
      setUploadError("No approved template is available. Approve a template before processing documents.");
      event.target.value = "";
      return;
    }

    setUploading(true);
    setUploadProgress({ current: 0, total: accepted.length, fileName: accepted[0].name });
    let firstDocumentId = "";
    const nextPreviews = {};
    const nextMatches = {};

    try {
      for (let index = 0; index < accepted.length; index += 1) {
        const file = accepted[index];
        setUploadProgress({ current: index + 1, total: accepted.length, fileName: file.name });
        const match = matchTemplateForFile(file.name, activeTemplates);
        if (!match.template) throw new Error("No template match is available");
        const result = await uploadCompletedDocuments(match.template.id, [file]);
        const item = result.items?.[0];
        if (!item) continue;
        if (!firstDocumentId) firstDocumentId = item.id;
        nextMatches[item.id] = { templateId: match.template.id, confidence: match.confidence, reason: match.reason };
        if (file.type.startsWith("image/")) nextPreviews[item.id] = URL.createObjectURL(file);
      }

      setPreviewUrls((current) => ({ ...current, ...nextPreviews }));
      setMatchPreviews((current) => ({ ...current, ...nextMatches }));
      setSelectedDocumentId(firstDocumentId);
      await refreshData({ documentId: firstDocumentId });
      setShowIntake(false);
      setQueueFilter("review");
      setNotice(`${accepted.length} document${accepted.length === 1 ? "" : "s"} processed and added to the review queue.`);
    } catch (error) {
      setApiError(`Document processing failed. ${error.message}`);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function saveReview() {
    if (!selectedDocument || saving) return;
    setSaving(true);
    try {
      await saveSelectedDocumentCorrections();
      setNotice("Corrections saved. The review remains open until you approve it.");
    } finally {
      setSaving(false);
    }
  }

  async function approveAndNext() {
    if (!selectedDocument || issueCount > 0 || !matchConfirmed) return;
    setSaving(true);
    const nextDocument = documents.find((document) => document.id !== selectedDocument.id && document.status === "Needs Review");
    try {
      await saveSelectedDocumentCorrections();
      await setDocumentStatus("Ready to Sync");
      if (nextDocument) setSelectedDocumentId(nextDocument.id);
      setNotice(nextDocument ? "Document approved. Opened the next review item." : "Document approved and ready to sync.");
    } finally {
      setSaving(false);
    }
  }

  function goToIssue(direction) {
    if (!selectedDocument) return;
    const issueKeys = reviewFields.filter((field) => issues[field.key]?.length).map((field) => field.key);
    if (!issueKeys.length) return;
    const currentIndex = issueKeys.indexOf(selectedFieldKey);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + issueKeys.length) % issueKeys.length;
    const nextKey = issueKeys[nextIndex];
    setSelectedFieldKey(nextKey);
    const nextField = fieldLibrary.find((field) => field.key === nextKey);
    if (nextField) setActiveGroup(nextField.group);
  }

  function goToQueueDocument(direction) {
    if (!queueDocuments.length) return;
    const currentIndex = queueDocuments.findIndex((document) => document.id === selectedDocumentId);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + queueDocuments.length) % queueDocuments.length;
    setSelectedDocumentId(queueDocuments[nextIndex].id);
  }

  function overrideTemplate(templateId) {
    if (!selectedDocument) return;
    setTemplateOverrides((current) => ({ ...current, [selectedDocument.id]: templateId }));
    setConfirmedMatches((current) => ({ ...current, [selectedDocument.id]: true }));
    setNotice("Template override applied for this review. Reprocessing will be connected to the matching API later.");
  }

  return (
    <div className="page document-page">
      <header className="document-page-header">
        <div>
          <span className="section-label">Document processing</span>
          <h1>Process insurance claims</h1>
          <p>Upload completed forms, verify the automatic template match, and review extracted data.</p>
        </div>
        <div className="page-actions">
          <button className="button secondary" type="button" onClick={() => refreshData({ documentId: selectedDocumentId })}><RefreshCw size={16} /> Refresh</button>
          <button className="button primary" type="button" onClick={() => setShowIntake((value) => !value)}><UploadCloud size={16} /> Upload documents</button>
        </div>
      </header>

      {showIntake && (
        <section className={`document-intake ${uploading ? "processing" : ""}`}>
          <div className="document-drop-copy">
            <span><ScanLine size={25} /></span>
            <div>
              <strong>{uploading ? "Processing uploaded forms" : "Upload completed claim forms"}</strong>
              <small>{uploading ? `${uploadProgress.current} of ${uploadProgress.total} · ${uploadProgress.fileName}` : "Templates are identified automatically after upload."}</small>
            </div>
          </div>
          {uploading ? (
            <div className="intake-processing-steps">
              {DOCUMENT_PIPELINE.slice(0, 5).map((stage, index) => <span className={index <= 2 ? "active" : ""} key={stage}>{index <= 2 ? <Loader2 size={13} /> : <i />}{stage}</span>)}
            </div>
          ) : (
            <label className="document-drop-action">
              <CloudUpload size={18} /> Choose files or drop here
              <input type="file" multiple accept="image/*,.pdf,.tif,.tiff" onChange={uploadDocuments} />
            </label>
          )}
          {uploadError && <p className="form-error">{uploadError}</p>}
        </section>
      )}

      {notice && <div className="review-notice"><CheckCircle2 size={16} /><span>{notice}</span><button type="button" onClick={() => setNotice("")}>×</button></div>}

      <div className="document-operations-layout">
        <aside className="document-queue-panel">
          <div className="queue-heading">
            <div><span className="section-label">Work queue</span><h2>Documents</h2></div>
            <span>{documents.length}</span>
          </div>
          <label className="queue-search"><Search size={15} /><input value={queueSearch} onChange={(event) => setQueueSearch(event.target.value)} placeholder="Search queue" /></label>
          <div className="queue-filter-row">
            <select value={queueFilter} onChange={(event) => setQueueFilter(event.target.value)} aria-label="Queue filter">
              {REVIEW_FILTERS.map((filter) => <option key={filter.id} value={filter.id}>{filter.label}</option>)}
            </select>
            <SlidersHorizontal size={15} />
          </div>
          <div className="document-queue-list">
            {queueDocuments.map((document) => {
              const template = templates.find((item) => item.id === document.templateId);
              const documentIssues = countDocumentIssues(validateDocument(document, template));
              return (
                <button className={`document-queue-item ${document.id === selectedDocumentId ? "active" : ""}`} type="button" key={document.id} onClick={() => setSelectedDocumentId(document.id)}>
                  <span className="queue-file"><FileText size={17} /></span>
                  <span className="queue-item-copy"><strong>{document.fileName}</strong><small>{document.id} · {documentIssues} issue{documentIssues === 1 ? "" : "s"}</small></span>
                  <span className={`queue-confidence ${confidenceTone(document.confidence)}`}>{percent(document.confidence)}</span>
                  <span className={`queue-status-dot ${statusClass(document.status)}`} />
                </button>
              );
            })}
            {!queueDocuments.length && <div className="queue-empty"><FileSearch size={20} /><strong>No documents here</strong><small>Try another filter or upload completed forms.</small></div>}
          </div>
          <div className="queue-shortcuts"><span><kbd>J</kbd><kbd>K</kbd> Navigate</span><span><kbd>[</kbd><kbd>]</kbd> Issues</span><span><kbd>Ctrl</kbd><kbd>↵</kbd> Approve</span></div>
        </aside>

        <main className="document-review-shell">
          {!selectedDocument ? (
            <div className="document-review-empty"><span><ImageIcon size={28} /></span><h2>Select a document to review</h2><p>Processed forms and exceptions will appear in the work queue.</p><button className="button primary" type="button" onClick={() => setShowIntake(true)}><UploadCloud size={16} /> Upload documents</button></div>
          ) : (
            <>
              <div className="document-review-header">
                <div className="review-file-title">
                  <span className="review-file-icon"><FileCheck2 size={19} /></span>
                  <div><span className="section-label">Review workspace</span><h2>{selectedDocument.fileName}</h2><p>{selectedDocument.id} · {selectedDocument.pages} page{selectedDocument.pages === 1 ? "" : "s"}</p></div>
                </div>
                <div className="review-header-meta">
                  <span className={`document-status ${statusClass(selectedDocument.status)}`}>{selectedDocument.status}</span>
                  <span className={`overall-confidence ${confidenceTone(selectedDocument.confidence)}`}><small>OCR confidence</small><strong>{percent(selectedDocument.confidence)}</strong></span>
                </div>
              </div>

              <div className="document-pipeline">
                {DOCUMENT_PIPELINE.map((stage, index) => <span className={index < 5 ? "complete" : "active"} key={stage}><i>{index < 5 ? <Check size={11} /> : index + 1}</i>{stage}</span>)}
              </div>

              <div className={`template-match-bar ${matchConfirmed ? "confirmed" : "needs-confirmation"}`}>
                <span className="match-icon">{matchConfirmed ? <Sparkles size={17} /> : <AlertTriangle size={17} />}</span>
                <div className="match-copy"><small>Matched template</small><strong>{selectedTemplate?.name ?? "No template selected"}</strong><span>{percent(matchConfidence)} match confidence · {matchPreviews[selectedDocument.id]?.reason ?? "Layout and field anchors agree"}</span></div>
                <label><span>Override</span><select value={effectiveTemplateId} onChange={(event) => overrideTemplate(event.target.value)}>{activeTemplates.map((template) => <option value={template.id} key={template.id}>{template.name} · v{template.version}</option>)}</select></label>
                {!matchConfirmed && <button className="button secondary" type="button" onClick={() => setConfirmedMatches((current) => ({ ...current, [selectedDocument.id]: true }))}><Check size={15} /> Confirm match</button>}
              </div>

              <div className="split-review-workspace">
                <section className="document-viewer-panel">
                  <div className="viewer-toolbar">
                    <div><button type="button" title="Previous page" disabled><ArrowLeft size={15} /></button><span>Page 1 of {selectedDocument.pages}</span><button type="button" title="Next page" disabled={selectedDocument.pages <= 1}><ArrowRight size={15} /></button></div>
                    <div><button type="button" onClick={() => setZoom((value) => Math.max(55, value - 10))}><ZoomOut size={15} /></button><span>{zoom}%</span><button type="button" onClick={() => setZoom((value) => Math.min(140, value + 10))}><ZoomIn size={15} /></button><button type="button" onClick={() => setZoom(82)}><Focus size={15} /></button></div>
                  </div>
                  <div className="review-canvas-scroll">
                    <ReviewDocumentCanvas
                      document={selectedDocument}
                      regions={sourceRegions}
                      selectedFieldKey={selectedFieldKey}
                      onSelectField={(key) => {
                        setSelectedFieldKey(key);
                        const field = fieldLibrary.find((item) => item.key === key);
                        if (field) setActiveGroup(field.group);
                      }}
                      previewUrl={previewUrls[selectedDocument.id]}
                      zoom={zoom}
                    />
                  </div>
                  <div className="viewer-legend"><span><i className="good" /> Verified confidence</span><span><i className="review" /> Needs attention</span><small>Click any region to open its value</small></div>
                </section>

                <section className="extracted-data-panel">
                  <div className="extraction-heading">
                    <div><span className="section-label">Extracted data</span><h2>Review fields</h2><p>{issueCount} issue{issueCount === 1 ? "" : "s"} across {documentFields.length} fields</p></div>
                    <div className="issue-navigation"><button type="button" onClick={() => goToIssue(-1)} disabled={!issueCount}><ArrowLeft size={15} /></button><span>{issueCount ? "Review issues" : "All clear"}</span><button type="button" onClick={() => goToIssue(1)} disabled={!issueCount}><ArrowRight size={15} /></button></div>
                  </div>

                  <div className="review-field-controls">
                    <div className="review-group-tabs">
                      <button className={activeGroup === "all" ? "active" : ""} type="button" onClick={() => setActiveGroup("all")}>All</button>
                      {fieldGroups.slice(0, 4).map((group) => <button className={activeGroup === group.id ? "active" : ""} type="button" key={group.id} onClick={() => setActiveGroup(group.id)}>{group.id}</button>)}
                    </div>
                    <label><input type="checkbox" checked={issuesOnly} onChange={(event) => setIssuesOnly(event.target.checked)} /> Issues only</label>
                  </div>

                  <div className="review-fields-scroll">
                    {visibleFields.map((field) => {
                      const value = selectedDocument.extracted?.[field.key] ?? "";
                      const fieldConfidence = selectedDocument.confidenceByField?.[field.key] ?? selectedDocument.confidence;
                      const fieldIssues = issues[field.key] ?? [];
                      const selected = field.key === selectedFieldKey;
                      return (
                        <div className={`review-field-card ${selected ? "selected" : ""} ${fieldIssues.length ? "has-issue" : ""}`} key={field.key} onClick={() => setSelectedFieldKey(field.key)}>
                          <div className="review-field-label"><label htmlFor={`review-${field.key}`}>{field.label}{field.required && <em>*</em>}</label><span className={confidenceTone(fieldConfidence)}>{percent(fieldConfidence)}</span></div>
                          {field.type === "textarea" ? (
                            <textarea id={`review-${field.key}`} value={value} onChange={(event) => updateDocumentField(field.key, event.target.value)} />
                          ) : (
                            <input id={`review-${field.key}`} value={value} onChange={(event) => updateDocumentField(field.key, event.target.value)} />
                          )}
                          {fieldIssues.map((issue) => <small className="review-field-warning" key={issue}><AlertCircle size={12} /> {issue}</small>)}
                          {selectedSourceRegion?.key === field.key && <small className="source-link"><Focus size={12} /> Source region highlighted on document</small>}
                        </div>
                      );
                    })}
                    {!visibleFields.length && <div className="fields-clear"><CheckCircle2 size={22} /><strong>No issues in this section</strong><small>Choose another group or turn off “Issues only”.</small></div>}
                  </div>

                  <div className="review-action-bar">
                    <button className="button secondary" type="button" onClick={saveReview} disabled={saving}>{saving ? <Loader2 size={16} /> : <Save size={16} />} Save draft</button>
                    <button className="button secondary" type="button" onClick={() => setNotice("Document queued for reprocessing with the selected template.")}><RotateCcw size={16} /> Reprocess</button>
                    <button className="button primary" type="button" onClick={approveAndNext} disabled={saving || issueCount > 0 || !matchConfirmed}><CheckCircle2 size={16} /> Approve & next</button>
                    {selectedDocument.status === "Ready to Sync" && <button className="button primary" type="button" onClick={syncSelectedDocument}><Send size={16} /> Sync</button>}
                    <button className="review-more-button" type="button" title="Delete document" onClick={() => deleteDocument(selectedDocument.id)}><Trash2 size={16} /></button>
                  </div>
                </section>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function ReviewDocumentCanvas({ document, regions, selectedFieldKey, onSelectField, previewUrl, zoom }) {
  return (
    <div className="review-document-frame" style={{ width: `${zoom}%` }}>
      <div className="review-document-paper">
        {previewUrl ? <img src={previewUrl} alt="Uploaded completed claim form" /> : <CompletedFormMock document={document} />}
        <svg viewBox="0 0 1000 1414" preserveAspectRatio="none" aria-label="Extracted field regions">
          {regions.map((region) => {
            const fieldConfidence = document.confidenceByField?.[region.key] ?? document.confidence;
            const selected = region.key === selectedFieldKey;
            return (
              <g className={`${selected ? "selected" : ""} ${fieldConfidence < 0.75 ? "low" : ""}`} key={region.id} onClick={() => onSelectField(region.key)}>
                <rect x={region.x * 1000} y={region.y * 1414} width={region.width * 1000} height={region.height * 1414} rx="3" />
                {selected && <text x={region.x * 1000 + 7} y={Math.max(16, region.y * 1414 - 7)}>{region.label} · {percent(fieldConfidence)}</text>}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function CompletedFormMock({ document }) {
  const values = document.extracted ?? {};
  return (
    <div className="completed-form-mock" aria-hidden="true">
      <div className="completed-brand"><span>IN</span><div><strong>INSURANCE COMPANY</strong><small>Claims Department</small></div></div>
      <div className="completed-title"><strong>{values.formType || "INSURANCE CLAIM"}</strong><small>CLAIM NOTIFICATION FORM</small></div>
      <MockSection title="A. POLICY INFORMATION" />
      <div className="completed-grid two"><MockValue label="Form type" value={values.formType} /><MockValue label="Policy number" value={values.policyNumber} /></div>
      <div className="completed-grid one"><MockValue label="Claim number" value={values.claimNumber} /></div>
      <MockSection title="B. CLAIMANT INFORMATION" />
      <div className="completed-grid one"><MockValue label="Claimant name" value={values.claimantName} /></div>
      <div className="completed-grid one"><MockValue label="Insured name" value={values.insuredName} /></div>
      <div className="completed-grid two"><MockValue label="Phone number" value={values.phone} /><MockValue label="Email address" value={values.email} /></div>
      <div className="completed-grid one tall"><MockValue label="Address" value={values.address} /></div>
      <MockSection title="C. INCIDENT DETAILS" />
      <div className="completed-grid three"><MockValue label="Date of loss" value={values.lossDate} /><MockValue label="Reported date" value={values.reportedDate} /><MockValue label="Category" value={values.claimCategory} /></div>
      <div className="completed-grid one taller"><MockValue label="Incident description" value={values.description} /></div>
      <MockSection title="D. CLAIM AMOUNT" />
      <div className="completed-grid three"><MockValue label="Amount claimed" value={values.amountClaimed} /><MockValue label="Currency" value={values.currency} /><MockValue label="Payment method" value={values.paymentMethod} /></div>
      <div className="completed-signature"><span>Claimant signature</span><span>Date</span></div>
    </div>
  );
}

function MockSection({ title }) {
  return <div className="completed-section"><strong>{title}</strong><span /></div>;
}

function MockValue({ label, value }) {
  return <label>{label}<span>{value || ""}</span></label>;
}
