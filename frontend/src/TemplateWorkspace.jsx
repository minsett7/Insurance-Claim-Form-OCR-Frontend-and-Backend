import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  CloudUpload,
  Copy,
  FileText,
  Focus,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  MousePointer2,
  Move,
  Plus,
  RefreshCw,
  Save,
  Search,
  SquareDashedMousePointer,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { uploadTemplateRegistration } from "./api";
import { TEMPLATE_PIPELINE } from "./productModel";
import {
  EXTRACTION_MODES,
  FIELD_TYPES,
  createBlankRegion,
  createDetectedRegions,
  loadRegions,
  saveRegions,
  validateRegions,
} from "./templateEditorModel";

const SUPPORTED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff"];
const MAX_FILE_SIZE = 15 * 1024 * 1024;

function supportedFile(file) {
  const name = file.name.toLowerCase();
  return file.size <= MAX_FILE_SIZE && (file.type.startsWith("image/") || SUPPORTED_EXTENSIONS.some((ext) => name.endsWith(ext)));
}

function percent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function statusClass(status) {
  return String(status ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function humanTime(date) {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(date);
}

export default function TemplateWorkspace({
  templates,
  registrations,
  selectedRegistration,
  selectedRegistrationId,
  setSelectedRegistrationId,
  approveRegistration,
  refreshData,
  saveRegistrationFields,
  setApiError,
  formTypes,
  getFormType,
  getRegistrationFields,
}) {
  const [formTypeId, setFormTypeId] = useState("health");
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [registrySearch, setRegistrySearch] = useState("");
  const [previewUrls, setPreviewUrls] = useState({});
  const [regions, setRegions] = useState([]);
  const [selectedRegionId, setSelectedRegionId] = useState("");
  const [tool, setTool] = useState("select");
  const [zoom, setZoom] = useState(82);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showUpload, setShowUpload] = useState(!registrations.length);

  const selectedTemplate = selectedRegistration
    ? templates.find((template) => template.id === selectedRegistration.templateId)
    : null;
  const readOnly = selectedRegistration?.status === "Registered";
  const selectedRegion = regions.find((region) => region.id === selectedRegionId) ?? null;
  const validationIssues = useMemo(() => validateRegions(regions), [regions]);
  const lowConfidenceCount = regions.filter((region) => Number(region.confidence) < 0.75).length;
  const filteredRegistrations = registrations.filter((registration) => {
    const query = registrySearch.trim().toLowerCase();
    if (!query) return true;
    return [registration.fileName, registration.id, getFormType(registration.formTypeId).label, registration.status]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  useEffect(() => {
    if (!selectedRegistration) {
      setRegions([]);
      setSelectedRegionId("");
      return;
    }
    const nextRegions = loadRegions(selectedRegistration.id, getRegistrationFields(selectedRegistration));
    setRegions(nextRegions);
    setSelectedRegionId(nextRegions[0]?.id ?? "");
    setDirty(false);
    setSavedAt(null);
    setTool("select");
  }, [selectedRegistration?.id]);

  function commitRegions(nextRegions) {
    setRegions(nextRegions);
    setDirty(true);
  }

  function updateRegion(id, changes) {
    if (readOnly) return;
    commitRegions(regions.map((region) => (region.id === id ? { ...region, ...changes } : region)));
  }

  function deleteRegion(id = selectedRegionId) {
    if (!id || readOnly) return;
    const index = regions.findIndex((region) => region.id === id);
    const next = regions.filter((region) => region.id !== id);
    commitRegions(next);
    setSelectedRegionId(next[Math.max(0, index - 1)]?.id ?? "");
  }

  function duplicateRegion() {
    if (!selectedRegion || readOnly) return;
    const clone = {
      ...selectedRegion,
      id: `region-${Date.now()}-copy`,
      key: `${selectedRegion.key}Copy`,
      label: `${selectedRegion.label} copy`,
      x: Math.min(selectedRegion.x + 0.02, 1 - selectedRegion.width),
      y: Math.min(selectedRegion.y + 0.02, 1 - selectedRegion.height),
    };
    commitRegions([...regions, clone]);
    setSelectedRegionId(clone.id);
  }

  function resetDetections() {
    if (!selectedRegistration || readOnly) return;
    const next = createDetectedRegions(getRegistrationFields(selectedRegistration));
    commitRegions(next);
    setSelectedRegionId(next[0]?.id ?? "");
  }

  async function uploadTemplateFiles(event) {
    const files = Array.from(event.target.files ?? []);
    const accepted = files.filter(supportedFile);
    setUploadError("");

    if (files.length && accepted.length !== files.length) {
      setUploadError("Some files were skipped. Use PDF, PNG, JPG, or TIFF files up to 15 MB.");
    }
    if (!accepted.length) {
      event.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const result = await uploadTemplateRegistration(formTypeId, accepted);
      const items = result.items ?? [];
      const nextPreviews = {};
      items.forEach((item, index) => {
        const file = accepted[index];
        if (file?.type.startsWith("image/")) nextPreviews[item.id] = URL.createObjectURL(file);
      });
      setPreviewUrls((current) => ({ ...current, ...nextPreviews }));
      const firstId = items[0]?.id ?? "";
      setSelectedRegistrationId(firstId);
      await refreshData({ registrationId: firstId });
      setShowUpload(false);
    } catch (error) {
      setApiError(`Template upload failed. ${error.message}`);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function saveDraft() {
    if (!selectedRegistration || readOnly) return;
    setSaving(true);
    saveRegions(selectedRegistration.id, regions);
    const fieldKeys = [...new Set(regions.map((region) => region.key).filter(Boolean))];
    try {
      await saveRegistrationFields(selectedRegistration.id, fieldKeys);
      setDirty(false);
      setSavedAt(new Date());
    } finally {
      setSaving(false);
    }
  }

  async function approveDraft() {
    if (!selectedRegistration || validationIssues.length || readOnly) return;
    await saveDraft();
    await approveRegistration(selectedRegistration.id);
  }

  function addDrawnRegion(geometry) {
    const nextRegion = createBlankRegion(geometry, regions.length);
    commitRegions([...regions, nextRegion]);
    setSelectedRegionId(nextRegion.id);
    setTool("select");
  }

  return (
    <div className="page template-page">
      <header className="template-page-header">
        <div>
          <span className="section-label">Template management</span>
          <h1>Form templates</h1>
          <p>Register blank forms, review detected regions, and approve reusable extraction templates.</p>
        </div>
        <div className="page-actions">
          <button className="button secondary" type="button" onClick={() => setShowUpload((value) => !value)}>
            <CloudUpload size={16} /> Upload blank form
          </button>
          <button className="button primary" type="button" onClick={() => setShowUpload(true)}>
            <Plus size={16} /> New template
          </button>
        </div>
      </header>

      {showUpload && (
        <section className="template-intake-card">
          <div className="intake-copy">
            <span className="intake-icon"><CloudUpload size={22} /></span>
            <div>
              <strong>Upload a blank insurance form</strong>
              <small>The system will detect printed labels and propose editable extraction regions.</small>
            </div>
          </div>
          <div className="intake-controls">
            <label className="compact-select">
              <span>Form category</span>
              <select value={formTypeId} onChange={(event) => setFormTypeId(event.target.value)}>
                {formTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
              </select>
            </label>
            <label className={`intake-drop ${uploading ? "busy" : ""}`}>
              {uploading ? <Loader2 size={18} /> : <CloudUpload size={18} />}
              <span>{uploading ? "Analyzing form…" : "Choose file or drop here"}</span>
              <input type="file" multiple accept="image/*,.pdf,.tif,.tiff" onChange={uploadTemplateFiles} disabled={uploading} />
            </label>
            <button className="icon-button" type="button" aria-label="Close upload panel" onClick={() => setShowUpload(false)}>×</button>
          </div>
          {uploadError && <p className="form-error">{uploadError}</p>}
        </section>
      )}

      <div className="template-management-layout">
        <aside className="template-registry-panel">
          <div className="registry-heading">
            <div>
              <span className="section-label">Registry</span>
              <h2>Template drafts</h2>
            </div>
            <span className="registry-count">{registrations.length}</span>
          </div>
          <label className="registry-search">
            <Search size={15} />
            <input value={registrySearch} onChange={(event) => setRegistrySearch(event.target.value)} placeholder="Search templates" />
          </label>

          <div className="registry-list">
            {filteredRegistrations.map((registration) => {
              const type = getFormType(registration.formTypeId);
              return (
                <button
                  className={`registry-item ${registration.id === selectedRegistrationId ? "active" : ""}`}
                  type="button"
                  key={registration.id}
                  onClick={() => setSelectedRegistrationId(registration.id)}
                >
                  <span className="registry-file-icon"><FileText size={17} /></span>
                  <span className="registry-item-copy">
                    <strong>{registration.fileName}</strong>
                    <small>{type.label} · v{templates.find((item) => item.id === registration.templateId)?.version ?? "0.1"}</small>
                  </span>
                  <span className={`mini-status ${statusClass(registration.status)}`}>{registration.status}</span>
                </button>
              );
            })}
            {!filteredRegistrations.length && (
              <div className="registry-empty"><Search size={18} /><span>No matching template drafts</span></div>
            )}
          </div>

          <div className="active-template-summary">
            <span>{templates.filter((template) => template.status === "Active").length}</span>
            <div><strong>Active templates</strong><small>Available for matching</small></div>
            <ChevronRight size={16} />
          </div>
        </aside>

        <main className="template-editor-shell">
          {!selectedRegistration ? (
            <div className="template-empty-state">
              <span><ImageIcon size={28} /></span>
              <h2>No template selected</h2>
              <p>Upload a blank form to create an editable template draft.</p>
              <button className="button primary" type="button" onClick={() => setShowUpload(true)}><CloudUpload size={16} /> Upload blank form</button>
            </div>
          ) : (
            <>
              <div className="editor-header">
                <div className="editor-title">
                  <div>
                    <span className="section-label">{readOnly ? "Approved template" : "Human review"}</span>
                    <h2>{selectedRegistration.fileName}</h2>
                    <p>{getFormType(selectedRegistration.formTypeId).label} · {selectedRegistration.id} · {regions.length} regions</p>
                  </div>
                  <span className={`mini-status ${statusClass(selectedRegistration.status)}`}>{selectedRegistration.status}</span>
                </div>
                <div className="editor-save-state">
                  {!readOnly && <span>{dirty ? "Unsaved changes" : savedAt ? `Saved ${humanTime(savedAt)}` : "Draft loaded"}</span>}
                  <button className="button secondary" type="button" disabled={!dirty || saving || readOnly} onClick={saveDraft}>
                    {saving ? <Loader2 size={16} /> : <Save size={16} />} Save draft
                  </button>
                  <button className="button primary" type="button" disabled={readOnly || validationIssues.length > 0 || saving} onClick={approveDraft}>
                    <CheckCircle2 size={16} /> Approve template
                  </button>
                </div>
              </div>

              <TemplateProgress approved={readOnly} />

              <div className="editor-toolbar">
                <div className="tool-group">
                  <button className={tool === "select" ? "active" : ""} type="button" onClick={() => setTool("select")} title="Select and move">
                    <MousePointer2 size={16} /> Select
                  </button>
                  <button className={tool === "draw" ? "active" : ""} type="button" onClick={() => setTool("draw")} disabled={readOnly} title="Draw a new field">
                    <SquareDashedMousePointer size={16} /> Add field
                  </button>
                </div>
                <div className="tool-group">
                  <button type="button" onClick={duplicateRegion} disabled={!selectedRegion || readOnly} title="Duplicate selected region"><Copy size={16} /></button>
                  <button type="button" onClick={() => deleteRegion()} disabled={!selectedRegion || readOnly} title="Delete selected region"><Trash2 size={16} /></button>
                  <button type="button" onClick={resetDetections} disabled={readOnly} title="Restore automatic detections"><RefreshCw size={16} /></button>
                </div>
                <div className="tool-group zoom-tools">
                  <button type="button" onClick={() => setZoom((value) => Math.max(55, value - 10))} title="Zoom out"><ZoomOut size={16} /></button>
                  <span>{zoom}%</span>
                  <button type="button" onClick={() => setZoom((value) => Math.min(140, value + 10))} title="Zoom in"><ZoomIn size={16} /></button>
                  <button type="button" onClick={() => setZoom(82)} title="Fit page"><Focus size={16} /></button>
                </div>
              </div>

              <div className="editor-workspace">
                <aside className="field-region-list">
                  <div className="region-list-heading">
                    <div><strong>Detected fields</strong><small>{lowConfidenceCount} need attention</small></div>
                    <button type="button" onClick={() => setTool("draw")} disabled={readOnly}><Plus size={16} /></button>
                  </div>
                  <div className="region-scroll">
                    {regions.map((region, index) => {
                      const issues = validationIssues.filter((issue) => issue.regionId === region.id);
                      return (
                        <button
                          className={`region-list-item ${region.id === selectedRegionId ? "active" : ""} ${issues.length ? "has-issue" : ""}`}
                          type="button"
                          key={region.id}
                          onClick={() => { setSelectedRegionId(region.id); setTool("select"); }}
                        >
                          <GripVertical size={14} />
                          <span className="region-index">{index + 1}</span>
                          <span><strong>{region.label}</strong><small>{region.key}</small></span>
                          {issues.length ? <AlertCircle size={15} /> : <span className={`confidence-dot ${region.confidence < 0.75 ? "low" : ""}`}>{percent(region.confidence)}</span>}
                        </button>
                      );
                    })}
                  </div>
                  <button className="add-region-row" type="button" disabled={readOnly} onClick={() => setTool("draw")}>
                    <Plus size={15} /> Draw new field
                  </button>
                </aside>

                <section className="template-canvas-area">
                  <div className="canvas-instruction">
                    {tool === "draw" ? <><SquareDashedMousePointer size={15} /> Drag on the document to create a field</> : <><Move size={15} /> Select a box to move or resize it</>}
                  </div>
                  <div className="canvas-scroll">
                    <TemplateCanvas
                      regions={regions}
                      selectedRegionId={selectedRegionId}
                      setSelectedRegionId={setSelectedRegionId}
                      commitRegions={commitRegions}
                      tool={tool}
                      zoom={zoom}
                      readOnly={readOnly}
                      previewUrl={previewUrls[selectedRegistration.id]}
                      title={getFormType(selectedRegistration.formTypeId).label}
                      onDraw={addDrawnRegion}
                    />
                  </div>
                </section>

                <FieldInspector
                  region={selectedRegion}
                  issues={validationIssues.filter((issue) => issue.regionId === selectedRegionId)}
                  readOnly={readOnly}
                  onChange={(changes) => updateRegion(selectedRegionId, changes)}
                  onDelete={() => deleteRegion()}
                />
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function TemplateProgress({ approved }) {
  return (
    <div className="template-progress" aria-label="Template processing progress">
      {TEMPLATE_PIPELINE.map((stage, index) => {
        const complete = approved || index < TEMPLATE_PIPELINE.length - 2;
        const active = !approved && index === TEMPLATE_PIPELINE.length - 2;
        return (
          <div className={`${complete ? "complete" : ""} ${active ? "active" : ""}`} key={stage}>
            <span>{complete ? <Check size={12} /> : index + 1}</span>
            <small>{stage}</small>
          </div>
        );
      })}
    </div>
  );
}

function TemplateCanvas({
  regions,
  selectedRegionId,
  setSelectedRegionId,
  commitRegions,
  tool,
  zoom,
  readOnly,
  previewUrl,
  title,
  onDraw,
}) {
  const svgRef = useRef(null);
  const interaction = useRef(null);
  const [draftBox, setDraftBox] = useState(null);

  function eventPoint(event) {
    const bounds = svgRef.current.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    };
  }

  function beginDraw(event) {
    if (tool !== "draw" || readOnly || event.target !== svgRef.current) return;
    const point = eventPoint(event);
    interaction.current = { kind: "draw", start: point };
    setDraftBox({ x: point.x, y: point.y, width: 0, height: 0 });
    svgRef.current.setPointerCapture(event.pointerId);
  }

  function beginMove(event, region) {
    event.stopPropagation();
    setSelectedRegionId(region.id);
    if (tool !== "select" || readOnly) return;
    interaction.current = { kind: "move", start: eventPoint(event), region: { ...region } };
    svgRef.current.setPointerCapture(event.pointerId);
  }

  function beginResize(event, region, corner) {
    event.stopPropagation();
    if (readOnly) return;
    interaction.current = { kind: "resize", corner, start: eventPoint(event), region: { ...region } };
    svgRef.current.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event) {
    const action = interaction.current;
    if (!action) return;
    const point = eventPoint(event);

    if (action.kind === "draw") {
      setDraftBox({
        x: Math.min(action.start.x, point.x),
        y: Math.min(action.start.y, point.y),
        width: Math.abs(point.x - action.start.x),
        height: Math.abs(point.y - action.start.y),
      });
      return;
    }

    if (action.kind === "move") {
      const dx = point.x - action.start.x;
      const dy = point.y - action.start.y;
      const moved = {
        ...action.region,
        x: Math.min(1 - action.region.width, Math.max(0, action.region.x + dx)),
        y: Math.min(1 - action.region.height, Math.max(0, action.region.y + dy)),
      };
      commitRegions(regions.map((region) => region.id === moved.id ? moved : region));
      return;
    }

    const original = action.region;
    const dx = point.x - action.start.x;
    const dy = point.y - action.start.y;
    let { x, y, width, height } = original;
    if (action.corner.includes("e")) width = Math.max(0.025, Math.min(1 - x, original.width + dx));
    if (action.corner.includes("s")) height = Math.max(0.012, Math.min(1 - y, original.height + dy));
    if (action.corner.includes("w")) {
      const nextX = Math.max(0, Math.min(original.x + original.width - 0.025, original.x + dx));
      width = original.width + (original.x - nextX);
      x = nextX;
    }
    if (action.corner.includes("n")) {
      const nextY = Math.max(0, Math.min(original.y + original.height - 0.012, original.y + dy));
      height = original.height + (original.y - nextY);
      y = nextY;
    }
    const resized = { ...original, x, y, width, height };
    commitRegions(regions.map((region) => region.id === resized.id ? resized : region));
  }

  function endInteraction(event) {
    const action = interaction.current;
    if (!action) return;
    if (action.kind === "draw" && draftBox?.width >= 0.025 && draftBox?.height >= 0.012) onDraw(draftBox);
    interaction.current = null;
    setDraftBox(null);
    if (svgRef.current.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId);
  }

  return (
    <div className="template-page-frame" style={{ width: `${zoom}%` }}>
      <div className="template-paper">
        {previewUrl ? <img className="template-source-image" src={previewUrl} alt="Uploaded blank form" /> : <TemplatePaperMock title={title} />}
        <svg
          className={`region-overlay tool-${tool}`}
          ref={svgRef}
          viewBox="0 0 1000 1414"
          preserveAspectRatio="none"
          onPointerDown={beginDraw}
          onPointerMove={handlePointerMove}
          onPointerUp={endInteraction}
          onPointerCancel={endInteraction}
          onClick={(event) => { if (event.target === svgRef.current && tool === "select") setSelectedRegionId(""); }}
          aria-label="Template region editor"
        >
          {regions.map((region, index) => {
            const selected = region.id === selectedRegionId;
            const x = region.x * 1000;
            const y = region.y * 1414;
            const width = region.width * 1000;
            const height = region.height * 1414;
            return (
              <g className={`region-box ${selected ? "selected" : ""} ${region.confidence < 0.75 ? "low" : ""}`} key={region.id}>
                <rect x={x} y={y} width={width} height={height} rx="3" onPointerDown={(event) => beginMove(event, region)} />
                <text x={x + 6} y={Math.max(14, y - 7)}>{index + 1}. {region.label}</text>
                {selected && !readOnly && [
                  ["nw", x, y], ["ne", x + width, y], ["sw", x, y + height], ["se", x + width, y + height],
                ].map(([corner, cx, cy]) => (
                  <circle key={corner} cx={cx} cy={cy} r="7" onPointerDown={(event) => beginResize(event, region, corner)} />
                ))}
              </g>
            );
          })}
          {draftBox && (
            <rect
              className="draft-region"
              x={draftBox.x * 1000}
              y={draftBox.y * 1414}
              width={draftBox.width * 1000}
              height={draftBox.height * 1414}
            />
          )}
        </svg>
      </div>
      <span className="page-number">Page 1 of 1</span>
    </div>
  );
}

function TemplatePaperMock({ title }) {
  return (
    <div className="template-paper-mock" aria-hidden="true">
      <div className="mock-brand-row"><span className="mock-logo">IN</span><div><strong>INSURANCE COMPANY</strong><small>Claims Department</small></div></div>
      <div className="mock-form-title"><strong>{title}</strong><small>CLAIM NOTIFICATION FORM</small></div>
      <div className="mock-section"><strong>A. POLICY INFORMATION</strong><span /></div>
      <div className="mock-row two"><label>Form type<span /></label><label>Policy number<span /></label></div>
      <div className="mock-row one"><label>Claim number<span /></label></div>
      <div className="mock-section"><strong>B. CLAIMANT INFORMATION</strong><span /></div>
      <div className="mock-row one"><label>Claimant name<span /></label></div>
      <div className="mock-row one"><label>Insured name<span /></label></div>
      <div className="mock-row two"><label>Phone number<span /></label><label>Email address<span /></label></div>
      <div className="mock-row one tall"><label>Address<span /></label></div>
      <div className="mock-section"><strong>C. INCIDENT DETAILS</strong><span /></div>
      <div className="mock-row three"><label>Date of loss<span /></label><label>Reported date<span /></label><label>Category<span /></label></div>
      <div className="mock-row one taller"><label>Incident description<span /></label></div>
      <div className="mock-section"><strong>D. CLAIM AMOUNT</strong><span /></div>
      <div className="mock-row three"><label>Amount claimed<span /></label><label>Currency<span /></label><label>Payment method<span /></label></div>
      <div className="mock-footer"><span>Claimant signature</span><span>Date</span></div>
    </div>
  );
}

function FieldInspector({ region, issues, readOnly, onChange, onDelete }) {
  if (!region) {
    return (
      <aside className="field-inspector empty">
        <span><MousePointer2 size={22} /></span>
        <strong>Select a field</strong>
        <p>Choose a region on the document or from the detected-fields list.</p>
      </aside>
    );
  }

  return (
    <aside className="field-inspector">
      <div className="inspector-heading">
        <div><span className="section-label">Field properties</span><h3>{region.label}</h3></div>
        <span className={`confidence-score ${region.confidence < 0.75 ? "low" : ""}`}>{percent(region.confidence)}</span>
      </div>

      {issues.length > 0 && (
        <div className="inspector-issues">
          {issues.map((issue) => <span key={issue.message}><AlertCircle size={13} /> {issue.message}</span>)}
        </div>
      )}

      <div className="inspector-form">
        <label><span>Display label</span><input value={region.label} disabled={readOnly} onChange={(event) => onChange({ label: event.target.value })} /></label>
        <label><span>Field key</span><input value={region.key} disabled={readOnly} onChange={(event) => onChange({ key: event.target.value.replace(/[^\p{L}\p{N}_]/gu, "") })} /></label>
        <label><span>Data type</span><select value={region.type} disabled={readOnly} onChange={(event) => onChange({ type: event.target.value })}>{FIELD_TYPES.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}</select></label>
        <label><span>Language</span><select value={region.language} disabled={readOnly} onChange={(event) => onChange({ language: event.target.value })}><option value="my-en">Burmese + English</option><option value="my">Burmese</option><option value="en">English</option></select></label>
        <label><span>Extraction method</span><select value={region.extractionMode} disabled={readOnly} onChange={(event) => onChange({ extractionMode: event.target.value })}>{EXTRACTION_MODES.map((mode) => <option value={mode.value} key={mode.value}>{mode.label}</option>)}</select></label>
        <label className="required-toggle"><input type="checkbox" checked={region.required} disabled={readOnly} onChange={(event) => onChange({ required: event.target.checked })} /><span>Required field</span></label>
      </div>

      <div className="coordinates-card">
        <span>Normalized coordinates</span>
        <div><small>X</small><strong>{region.x.toFixed(3)}</strong><small>Y</small><strong>{region.y.toFixed(3)}</strong></div>
        <div><small>W</small><strong>{region.width.toFixed(3)}</strong><small>H</small><strong>{region.height.toFixed(3)}</strong></div>
      </div>

      {!readOnly && <button className="delete-field-button" type="button" onClick={onDelete}><Trash2 size={15} /> Delete field</button>}
    </aside>
  );
}
