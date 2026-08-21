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
import {
  fetchTemplateLayout,
  overrideDocumentTemplate,
  reprocessDocument,
  uploadCompletedDocuments,
} from "./api";
import { DOCUMENT_PIPELINE } from "./productModel";
import {
  REVIEW_FILTERS,
  countDocumentIssues,
  matchesQueueFilter,
  sortFieldsForReview,
} from "./documentReviewModel";

const SUPPORTED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff"];
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ACTIVE_PROCESSING_STATUSES = new Set(["Uploaded", "Processing"]);

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
  const [activeGroup, setActiveGroup] = useState("all");
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [selectedFieldKey, setSelectedFieldKey] = useState("");
  const [uploadTemplateId, setUploadTemplateId] = useState("");
  const [templateLayouts, setTemplateLayouts] = useState({});
  const [selectedPage, setSelectedPage] = useState(1);
  const [zoom, setZoom] = useState(82);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const effectiveTemplateId = selectedDocument?.templateId ?? "";
  const sourceIsPdf = /\.pdf$/i.test(selectedDocument?.fileName ?? "");
  const selectedTemplate = templates.find((template) => template.id === effectiveTemplateId) ?? null;
  const issues = selectedDocument ? validateDocument(selectedDocument, selectedTemplate) : {};
  const issueCount = countDocumentIssues(issues);
  const matchConfidence = Number(selectedDocument?.templateMatch?.score ?? 0);
  const matchConfirmed = Boolean(selectedDocument?.templateMatch?.confirmed);
  const templateFieldKeys = selectedTemplate?.fields?.length ? selectedTemplate.fields : fieldLibrary.map((field) => field.key);
  const registeredFields = fieldLibrary.filter((field) => templateFieldKeys.includes(field.key));
  const dynamicDocumentFields = Object.entries(selectedDocument?.fieldMetadata ?? {})
    .filter(([key]) => !registeredFields.some((field) => field.key === key))
    .map(([key, metadata]) => ({
      key,
      label: metadata.label,
      type: metadata.type,
      group: "Other",
      required: false,
    }));
  const documentFields = [...registeredFields, ...dynamicDocumentFields];
  const reviewFields = sortFieldsForReview(documentFields, issues, selectedDocument?.confidenceByField, selectedDocument?.confidence);
  const pageCount = Math.max(
    1,
    Number(selectedDocument?.pages ?? 1),
    Number(templateLayouts[effectiveTemplateId]?.pages?.length ?? 0),
  );
  const visibleFields = reviewFields.filter((field) => {
    if (issuesOnly && !issues[field.key]?.length) return false;
    return (activeGroup === "all" || field.group === activeGroup)
      && Number(selectedDocument?.pageByField?.[field.key] ?? 1) === selectedPage;
  });
  const sourceRegions = useMemo(() => (
    (templateLayouts[effectiveTemplateId]?.regions ?? [])
      .filter((region) => region.enabled !== false && region.key && region.bbox && Number(region.page ?? 1) === selectedPage)
      .map((region) => ({
        key: region.key,
        page: Number(region.page ?? 1),
        label: region.label,
        x: Number(region.bbox.x ?? 0),
        y: Number(region.bbox.y ?? 0),
        width: Number(region.bbox.width ?? 0),
        height: Number(region.bbox.height ?? 0),
      }))
  ), [effectiveTemplateId, selectedPage, templateLayouts]);
  const selectedTemplatePage = (templateLayouts[effectiveTemplateId]?.pages ?? [])
    .find((page) => Number(page.page_number) === selectedPage) ?? null;
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
      setSelectedPage(1);
      return;
    }
    const firstIssue = Object.keys(issues)[0];
    setSelectedFieldKey(firstIssue ?? templateFieldKeys[0] ?? "");
    setSelectedPage(Number(selectedDocument.pageByField?.[firstIssue ?? templateFieldKeys[0]] ?? 1));
    setNotice("");
  }, [selectedDocument?.id]);

  useEffect(() => {
    if (!effectiveTemplateId || templateLayouts[effectiveTemplateId]) return;
    let cancelled = false;
    fetchTemplateLayout(effectiveTemplateId)
      .then((layout) => {
        if (!cancelled) setTemplateLayouts((current) => ({ ...current, [effectiveTemplateId]: layout }));
      })
      .catch((error) => {
        if (!cancelled) setApiError(`Could not load the selected template layout. ${error.message}`);
      });
    return () => { cancelled = true; };
  }, [effectiveTemplateId, templateLayouts, setApiError]);

  useEffect(() => {
    if (!selectedDocument || !ACTIVE_PROCESSING_STATUSES.has(selectedDocument.status)) return undefined;
    let active = true;
    let timer;
    const poll = async () => {
      try {
        await refreshData({ documentId: selectedDocument.id });
      } catch {
        // refreshData reports its own API error; keep polling while processing continues.
      }
      if (active) timer = window.setTimeout(poll, 2000);
    };
    timer = window.setTimeout(poll, 2000);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [selectedDocument?.id, selectedDocument?.status]);

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

    try {
      for (let index = 0; index < accepted.length; index += 1) {
        const file = accepted[index];
        setUploadProgress({ current: index + 1, total: accepted.length, fileName: file.name });
        const result = await uploadCompletedDocuments(uploadTemplateId, [file]);
        const item = result.items?.[0];
        if (!item) continue;
        if (!firstDocumentId) firstDocumentId = item.id;
      }

      setSelectedDocumentId(firstDocumentId);
      await refreshData({ documentId: firstDocumentId });
      setShowIntake(false);
      setQueueFilter("review");
      setNotice(`${accepted.length} document${accepted.length === 1 ? "" : "s"} uploaded. Processing status will update automatically.`);
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
    setSelectedPage(Number(selectedDocument.pageByField?.[nextKey] ?? 1));
  }

  function selectReviewField(key) {
    setSelectedFieldKey(key);
    const field = fieldLibrary.find((item) => item.key === key);
    if (field) setActiveGroup(field.group);
    setSelectedPage(Number(selectedDocument?.pageByField?.[key] ?? 1));
  }

  function goToQueueDocument(direction) {
    if (!queueDocuments.length) return;
    const currentIndex = queueDocuments.findIndex((document) => document.id === selectedDocumentId);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + queueDocuments.length) % queueDocuments.length;
    setSelectedDocumentId(queueDocuments[nextIndex].id);
  }

  async function overrideTemplate(templateId) {
    if (!selectedDocument) return;
    setSaving(true);
    try {
      await overrideDocumentTemplate(selectedDocument.id, templateId);
      await reprocessDocument(selectedDocument.id);
      await refreshData({ documentId: selectedDocument.id });
      setNotice("Template changed. Reprocessing status will update automatically.");
    } catch (error) {
      setApiError(`Could not change the document template. ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function reprocessSelectedDocument() {
    if (!selectedDocument || saving) return;
    setSaving(true);
    try {
      await reprocessDocument(selectedDocument.id);
      await refreshData({ documentId: selectedDocument.id });
      setNotice("Document queued for reprocessing. Status will update automatically.");
    } catch (error) {
      setApiError(`Could not reprocess the document. ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page document-page">
      <header className="document-page-header">
        <div>
          <span className="section-label">Document processing</span>
          <h1>Process insurance claims</h1>
          <p>Select the approved template, upload completed forms, and review extracted data.</p>
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
              <small>{uploading ? `${uploadProgress.current} of ${uploadProgress.total} · ${uploadProgress.fileName}` : "Leave the template on automatic match, or select one explicitly."}</small>
            </div>
          </div>
          {uploading ? (
            <div className="intake-processing-steps">
              {DOCUMENT_PIPELINE.slice(0, 5).map((stage, index) => <span className={index <= 2 ? "active" : ""} key={stage}>{index <= 2 ? <Loader2 size={13} /> : <i />}{stage}</span>)}
            </div>
          ) : (
            <>
              <label className="compact-select">
                <span>Approved template</span>
                <select value={uploadTemplateId} onChange={(event) => setUploadTemplateId(event.target.value)}>
                  <option value="">Automatically match an approved template</option>
                  {activeTemplates.map((template) => <option value={template.id} key={template.id}>{template.name} · v{template.version}</option>)}
                </select>
              </label>
              <label className="document-drop-action">
                <CloudUpload size={18} /> Choose files or drop here
                <input type="file" multiple accept="image/*,.pdf,.tif,.tiff" onChange={uploadDocuments} />
              </label>
            </>
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
                  <div><span className="section-label">Review workspace</span><h2>{selectedDocument.fileName}</h2><p>{selectedDocument.id} · {pageCount} page{pageCount === 1 ? "" : "s"}</p></div>
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
                <div className="match-copy"><small>Selected template</small><strong>{selectedTemplate?.name ?? "No template selected"}</strong><span>{matchConfirmed ? "Confirmed before processing" : `${percent(matchConfidence)} template assignment`}</span></div>
                <label><span>Change template</span><select value={effectiveTemplateId} disabled={saving} onChange={(event) => { if (event.target.value) overrideTemplate(event.target.value); }}><option value="">Choose a template to continue</option>{activeTemplates.map((template) => <option value={template.id} key={template.id}>{template.name} · v{template.version}</option>)}</select></label>
              </div>

              <div className="split-review-workspace">
                <section className="document-viewer-panel">
                  <div className="viewer-toolbar">
                    <div><button type="button" title="Previous page" disabled={selectedPage <= 1} onClick={() => setSelectedPage((page) => page - 1)}><ArrowLeft size={15} /></button><span>Page {selectedPage} of {pageCount}</span><button type="button" title="Next page" disabled={selectedPage >= pageCount} onClick={() => setSelectedPage((page) => page + 1)}><ArrowRight size={15} /></button></div>
                    <div><button type="button" onClick={() => setZoom((value) => Math.max(55, value - 10))}><ZoomOut size={15} /></button><span>{zoom}%</span><button type="button" onClick={() => setZoom((value) => Math.min(140, value + 10))}><ZoomIn size={15} /></button><button type="button" onClick={() => setZoom(82)}><Focus size={15} /></button></div>
                  </div>
                  <div className="review-canvas-scroll">
                    <ReviewDocumentCanvas
                      document={selectedDocument}
                      regions={sourceRegions}
                      selectedFieldKey={selectedFieldKey}
                      onSelectField={selectReviewField}
                      previewUrl={selectedDocument.sourceUrl}
                      alignedPageBaseUrl={selectedDocument.alignedPageBaseUrl}
                      page={selectedPage}
                      pageLayout={selectedTemplatePage}
                      zoom={zoom}
                    />
                  </div>
                  <div className="viewer-legend"><span><i className="good" /> Verified confidence</span><span><i className="review" /> Needs attention</span><small>Showing uploaded source page {selectedPage}; its OCR values appear on the right.</small></div>
                </section>

                <section className="extracted-data-panel">
                  <div className="extraction-heading">
                    <div><span className="section-label">Extracted data · page {selectedPage} of {pageCount}</span><h2>Review fields</h2><p>{issueCount} issue{issueCount === 1 ? "" : "s"} across {documentFields.length} fields</p></div>
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
                        <div className={`review-field-card ${selected ? "selected" : ""} ${fieldIssues.length ? "has-issue" : ""}`} key={field.key} onClick={() => selectReviewField(field.key)}>
                          <div className="review-field-label"><label htmlFor={`review-${field.key}`}>{field.label}{field.required && <em>*</em>}</label><span className={confidenceTone(fieldConfidence)}>{percent(fieldConfidence)}</span></div>
                          {field.type === "textarea" ? (
                            <textarea id={`review-${field.key}`} value={value} onChange={(event) => updateDocumentField(field.key, event.target.value)} />
                          ) : (
                            <input id={`review-${field.key}`} value={value} onChange={(event) => updateDocumentField(field.key, event.target.value)} />
                          )}
                          {fieldIssues.map((issue) => <small className="review-field-warning" key={issue}><AlertCircle size={12} /> {issue}</small>)}
                          {!sourceIsPdf && selectedSourceRegion?.key === field.key && <small className="source-link"><Focus size={12} /> Source region highlighted on document</small>}
                        </div>
                      );
                    })}
                    {!visibleFields.length && <div className="fields-clear"><CheckCircle2 size={22} /><strong>No issues in this section</strong><small>Choose another group or turn off “Issues only”.</small></div>}
                  </div>

                  <div className="review-action-bar">
                    <button className="button secondary" type="button" onClick={saveReview} disabled={saving}>{saving ? <Loader2 size={16} /> : <Save size={16} />} Save draft</button>
                    <button className="button secondary" type="button" onClick={reprocessSelectedDocument} disabled={saving}><RotateCcw size={16} /> Reprocess</button>
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

function ReviewDocumentCanvas({ document, regions, selectedFieldKey, onSelectField, previewUrl, alignedPageBaseUrl, page, pageLayout, zoom }) {
  const isPdf = !alignedPageBaseUrl && /\.pdf$/i.test(document.fileName);
  const pagedPreviewUrl = isPdf && previewUrl ? `${previewUrl}#page=${page}&view=FitH` : previewUrl;
  const alignedPageUrl = alignedPageBaseUrl ? `${alignedPageBaseUrl}/${page}` : null;
  const imagePreviewUrl = alignedPageUrl ?? pagedPreviewUrl;
  const pageWidth = Number(pageLayout?.width ?? 1000);
  const pageHeight = Number(pageLayout?.height ?? 1414);
  return (
    <div className="review-document-frame" style={{ width: `${zoom}%` }}>
      <div className="review-document-paper" style={{ aspectRatio: `${pageWidth} / ${pageHeight}` }}>
        {imagePreviewUrl
          ? isPdf
            ? <iframe src={imagePreviewUrl} title={`Uploaded completed claim form, page ${page}`} />
            : <img src={imagePreviewUrl} alt={`Aligned uploaded form, page ${page}`} />
          : <div className="document-preview-unavailable">The uploaded source file is unavailable.</div>}
        {!isPdf && <svg viewBox="0 0 1000 1414" preserveAspectRatio="none" aria-label="Extracted field regions">
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
        </svg>}
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
