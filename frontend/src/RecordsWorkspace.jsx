import { useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  Archive,
  ArrowDownUp,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Database,
  Download,
  ExternalLink,
  FileCheck2,
  FileJson,
  FileSearch,
  FileSpreadsheet,
  FileText,
  Filter,
  History,
  LayoutTemplate,
  Search,
  Send,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";

const STATUS_OPTIONS = ["all", "Needs Review", "Ready to Sync", "Synced", "Processing", "Failed"];

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

function formatDate(value, includeTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", includeTime
    ? { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }
    : { year: "numeric", month: "short", day: "2-digit" }).format(date);
}

function downloadText(content, mimeType, fileName) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function RecordsWorkspace({
  documents,
  templates,
  auditEvents,
  recordSearch,
  setRecordSearch,
  selectedDocumentId,
  setSelectedDocumentId,
  setActivePage,
  getFormType,
  formatAmount,
}) {
  const [activeView, setActiveView] = useState("records");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sort, setSort] = useState({ key: "uploadTime", direction: "desc" });
  const [selectedIds, setSelectedIds] = useState([]);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditTargetFilter, setAuditTargetFilter] = useState("all");

  const filteredDocuments = useMemo(() => {
    const query = recordSearch.trim().toLowerCase();
    const filtered = documents.filter((document) => {
      const template = templates.find((item) => item.id === document.templateId);
      const searchable = [
        document.id,
        document.fileName,
        document.status,
        document.syncStatus,
        template?.name,
        getFormType(document.formTypeId).label,
        ...Object.values(document.extracted ?? {}),
      ].join(" ").toLowerCase();
      return (!query || searchable.includes(query))
        && (statusFilter === "all" || document.status === statusFilter)
        && (typeFilter === "all" || document.formTypeId === typeFilter);
    });

    return filtered.sort((left, right) => {
      let leftValue = left[sort.key] ?? "";
      let rightValue = right[sort.key] ?? "";
      if (sort.key === "claimant") {
        leftValue = left.extracted?.claimantName ?? "";
        rightValue = right.extracted?.claimantName ?? "";
      }
      if (sort.key === "policy") {
        leftValue = left.extracted?.policyNumber ?? "";
        rightValue = right.extracted?.policyNumber ?? "";
      }
      if (sort.key === "confidence") {
        leftValue = Number(left.confidence);
        rightValue = Number(right.confidence);
      }
      const comparison = typeof leftValue === "number"
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue));
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [documents, templates, recordSearch, statusFilter, typeFilter, sort, getFormType]);

  const filteredAuditEvents = useMemo(() => {
    const query = auditSearch.trim().toLowerCase();
    return auditEvents.filter((event) => {
      const matchesQuery = !query || [event.actor, event.action, event.targetType, event.targetId, event.id].join(" ").toLowerCase().includes(query);
      const matchesTarget = auditTargetFilter === "all" || event.targetType === auditTargetFilter;
      return matchesQuery && matchesTarget;
    });
  }, [auditEvents, auditSearch, auditTargetFilter]);

  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) ?? filteredDocuments[0] ?? null;
  const selectedTemplate = selectedDocument ? templates.find((template) => template.id === selectedDocument.templateId) : null;
  const selectedAudit = selectedDocument
    ? auditEvents.filter((event) => event.targetId === selectedDocument.id || event.targetId === selectedDocument.templateId).slice(0, 8)
    : [];
  const selectedRecords = documents.filter((document) => selectedIds.includes(document.id));
  const readyCount = documents.filter((document) => document.status === "Ready to Sync").length;
  const syncedCount = documents.filter((document) => document.syncStatus === "Synced").length;
  const averageConfidence = documents.length
    ? documents.reduce((sum, document) => sum + Number(document.confidence || 0), 0) / documents.length
    : 0;
  const correctionCount = auditEvents.filter((event) => event.action.toLowerCase().includes("correction")).length;

  function changeSort(key) {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: "asc" });
  }

  function toggleRecord(id) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAllVisible() {
    const visibleIds = filteredDocuments.map((document) => document.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((current) => allSelected
      ? current.filter((id) => !visibleIds.includes(id))
      : [...new Set([...current, ...visibleIds])]);
  }

  function exportSelectedJson() {
    downloadText(JSON.stringify({ exportedAt: new Date().toISOString(), documents: selectedRecords }, null, 2), "application/json", `claim-records-${new Date().toISOString().slice(0, 10)}.json`);
  }

  function exportSelectedCsv() {
    const headers = ["document_id", "file_name", "form_type", "status", "policy_number", "claimant_name", "amount_claimed", "currency", "confidence"];
    const rows = selectedRecords.map((document) => [
      document.id,
      document.fileName,
      getFormType(document.formTypeId).label,
      document.status,
      document.extracted?.policyNumber,
      document.extracted?.claimantName,
      document.extracted?.amountClaimed,
      document.extracted?.currency,
      document.confidence,
    ]);
    downloadText([headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n"), "text/csv", `claim-records-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function openReview(documentId) {
    setSelectedDocumentId(documentId);
    setActivePage("process");
  }

  return (
    <div className="page records-workspace-page">
      <header className="records-page-header">
        <div>
          <span className="section-label">Operations history</span>
          <h1>Records and audit trail</h1>
          <p>Find processed claims, inspect their provenance, and export reviewed records for downstream systems.</p>
        </div>
        <div className="records-view-switcher" role="tablist">
          <button className={activeView === "records" ? "active" : ""} type="button" onClick={() => setActiveView("records")}><Database size={16} /> Records</button>
          <button className={activeView === "audit" ? "active" : ""} type="button" onClick={() => setActiveView("audit")}><History size={16} /> Audit history</button>
        </div>
      </header>

      <section className="records-metrics">
        <RecordMetric icon={<FileText />} label="Total processed" value={documents.length} />
        <RecordMetric icon={<ClipboardCheck />} label="Ready to sync" value={readyCount} tone="warning" />
        <RecordMetric icon={<CheckCircle2 />} label="Synced records" value={syncedCount} tone="success" />
        <RecordMetric icon={<ShieldCheck />} label="Average confidence" value={percent(averageConfidence)} tone="brand" />
      </section>

      {activeView === "records" ? (
        <>
          <section className="records-toolbar-card">
            <label className="records-search"><Search size={16} /><input value={recordSearch} onChange={(event) => setRecordSearch(event.target.value)} placeholder="Search policy, claimant, document, or template" />{recordSearch && <button type="button" onClick={() => setRecordSearch("")} aria-label="Clear search"><X size={14} /></button>}</label>
            <label className="records-filter"><Filter size={14} /><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{STATUS_OPTIONS.map((status) => <option value={status} key={status}>{status === "all" ? "All statuses" : status}</option>)}</select></label>
            <label className="records-filter"><FileText size={14} /><span>Form type</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">All form types</option>{[...new Set(documents.map((document) => document.formTypeId))].map((id) => <option value={id} key={id}>{getFormType(id).label}</option>)}</select></label>
            <span className="records-result-count">{filteredDocuments.length} result{filteredDocuments.length === 1 ? "" : "s"}</span>
          </section>

          {selectedIds.length > 0 && (
            <div className="bulk-record-actions">
              <span><Check size={14} /> {selectedIds.length} selected</span>
              <button type="button" onClick={exportSelectedJson}><FileJson size={15} /> Export JSON</button>
              <button type="button" onClick={exportSelectedCsv}><FileSpreadsheet size={15} /> Export CSV</button>
              <button type="button" onClick={() => setSelectedIds([])}><X size={15} /> Clear</button>
            </div>
          )}

          <div className="records-content-layout">
            <section className="records-table-card">
              <div className="records-table-scroll">
                <table className="operations-records-table">
                  <thead>
                    <tr>
                      <th className="checkbox-column"><input type="checkbox" checked={filteredDocuments.length > 0 && filteredDocuments.every((document) => selectedIds.includes(document.id))} onChange={toggleAllVisible} aria-label="Select all visible records" /></th>
                      <SortableHeader label="Document" sortKey="uploadTime" sort={sort} onSort={changeSort} />
                      <SortableHeader label="Policy" sortKey="policy" sort={sort} onSort={changeSort} />
                      <SortableHeader label="Claimant" sortKey="claimant" sort={sort} onSort={changeSort} />
                      <th>Form type</th>
                      <th>Amount</th>
                      <SortableHeader label="Confidence" sortKey="confidence" sort={sort} onSort={changeSort} />
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocuments.map((document) => (
                      <tr className={`${document.id === selectedDocument?.id ? "focused" : ""} ${selectedIds.includes(document.id) ? "selected" : ""}`} key={document.id} onClick={() => setSelectedDocumentId(document.id)}>
                        <td className="checkbox-column"><input type="checkbox" checked={selectedIds.includes(document.id)} onChange={() => toggleRecord(document.id)} onClick={(event) => event.stopPropagation()} aria-label={`Select ${document.id}`} /></td>
                        <td><span className="record-document-cell"><i><FileText size={16} /></i><span><strong>{document.id}</strong><small>{document.fileName}</small></span></span></td>
                        <td><strong>{document.extracted?.policyNumber || "—"}</strong><small>{formatDate(document.uploadTime)}</small></td>
                        <td>{document.extracted?.claimantName || "—"}</td>
                        <td><span className="record-type-pill" style={{ "--record-accent": getFormType(document.formTypeId).accent }}>{getFormType(document.formTypeId).name}</span></td>
                        <td>{formatAmount(document.extracted?.amountClaimed, document.extracted?.currency)}</td>
                        <td><span className={`record-confidence ${confidenceTone(document.confidence)}`}>{percent(document.confidence)}</span></td>
                        <td><span className={`record-status ${statusClass(document.status)}`}><i />{document.status}</span></td>
                        <td><button className="open-record-button" type="button" onClick={(event) => { event.stopPropagation(); openReview(document.id); }} title="Open in review"><ExternalLink size={15} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filteredDocuments.length && <div className="records-empty"><FileSearch size={24} /><strong>No records found</strong><p>Adjust your search or filters to see more results.</p></div>}
              </div>
            </section>

            <RecordDetail
              document={selectedDocument}
              template={selectedTemplate}
              auditEvents={selectedAudit}
              getFormType={getFormType}
              formatAmount={formatAmount}
              onOpenReview={openReview}
            />
          </div>
        </>
      ) : (
        <AuditWorkspace
          events={filteredAuditEvents}
          allEvents={auditEvents}
          search={auditSearch}
          setSearch={setAuditSearch}
          targetFilter={auditTargetFilter}
          setTargetFilter={setAuditTargetFilter}
          correctionCount={correctionCount}
        />
      )}
    </div>
  );
}

function RecordMetric({ icon, label, value, tone = "" }) {
  return <div className={`record-metric ${tone}`}><span>{icon}</span><div><strong>{value}</strong><small>{label}</small></div></div>;
}

function SortableHeader({ label, sortKey, sort, onSort }) {
  return <th><button className={sort.key === sortKey ? "active" : ""} type="button" onClick={() => onSort(sortKey)}>{label}<ArrowDownUp size={12} /></button></th>;
}

function RecordDetail({ document, template, auditEvents, getFormType, formatAmount, onOpenReview }) {
  if (!document) {
    return <aside className="record-detail-panel empty"><span><FileSearch size={22} /></span><strong>Select a record</strong><p>Choose a record to see its extracted data and history.</p></aside>;
  }

  const keyFields = [
    ["Policy number", document.extracted?.policyNumber],
    ["Claim reference", document.extracted?.claimNumber],
    ["Claimant", document.extracted?.claimantName],
    ["Loss date", document.extracted?.lossDate],
    ["Claim amount", formatAmount(document.extracted?.amountClaimed, document.extracted?.currency)],
  ];

  return (
    <aside className="record-detail-panel">
      <div className="record-detail-heading">
        <span className="record-detail-icon"><FileCheck2 size={19} /></span>
        <div><span className="section-label">Record detail</span><h2>{document.id}</h2><small>{document.fileName}</small></div>
      </div>
      <div className="record-detail-meta">
        <span><small>Form type</small><strong>{getFormType(document.formTypeId).label}</strong></span>
        <span><small>Template</small><strong>{template?.name ?? "Unknown"}</strong></span>
        <span><small>Version</small><strong>v{template?.version ?? "—"}</strong></span>
        <span><small>OCR confidence</small><strong>{percent(document.confidence)}</strong></span>
      </div>
      <div className="record-key-fields">
        <span className="detail-section-title">Extracted claim data</span>
        {keyFields.map(([label, value]) => <div key={label}><small>{label}</small><strong>{value || "—"}</strong></div>)}
      </div>
      <div className="record-history-preview">
        <span className="detail-section-title">Recent history</span>
        {auditEvents.length ? auditEvents.map((event) => <div key={event.id}><span><Activity size={13} /></span><p><strong>{event.action}</strong><small>{event.actor} · {formatDate(event.createdAt, true)}</small></p></div>) : <p className="no-history">No audit events are available for this record.</p>}
      </div>
      <button className="button primary" type="button" onClick={() => onOpenReview(document.id)}>Open full review <ChevronRight size={16} /></button>
    </aside>
  );
}

function AuditWorkspace({ events, allEvents, search, setSearch, targetFilter, setTargetFilter, correctionCount }) {
  const actorCount = new Set(allEvents.map((event) => event.actor)).size;
  const templateEvents = allEvents.filter((event) => event.targetType === "template").length;
  return (
    <div className="audit-workspace">
      <section className="audit-summary-row">
        <span><History size={18} /><div><strong>{allEvents.length}</strong><small>Total events</small></div></span>
        <span><UserRound size={18} /><div><strong>{actorCount}</strong><small>Actors</small></div></span>
        <span><LayoutTemplate size={18} /><div><strong>{templateEvents}</strong><small>Template events</small></div></span>
        <span><FileCheck2 size={18} /><div><strong>{correctionCount}</strong><small>Correction events</small></div></span>
      </section>
      <section className="audit-log-card">
        <div className="audit-toolbar">
          <label><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search actor, action, or target" />{search && <button type="button" onClick={() => setSearch("")}><X size={14} /></button>}</label>
          <select value={targetFilter} onChange={(event) => setTargetFilter(event.target.value)}><option value="all">All targets</option><option value="document">Documents</option><option value="template">Templates</option></select>
          <span>{events.length} events</span>
        </div>
        <div className="audit-timeline">
          {events.map((event) => <AuditEvent event={event} key={event.id} />)}
          {!events.length && <div className="records-empty"><History size={24} /><strong>No audit events found</strong><p>Adjust your filters to see more history.</p></div>}
        </div>
      </section>
    </div>
  );
}

function AuditEvent({ event }) {
  const action = event.action.toLowerCase();
  const Icon = action.includes("approved") ? ShieldCheck : action.includes("correction") ? FileCheck2 : action.includes("status") ? Send : action.includes("template") ? LayoutTemplate : Activity;
  return (
    <div className="audit-event-row">
      <span className={`audit-event-icon ${statusClass(event.targetType)}`}><Icon size={16} /></span>
      <div className="audit-event-copy"><strong>{event.action}</strong><small><UserRound size={12} /> {event.actor}</small></div>
      <span className="audit-target"><small>{event.targetType}</small><strong>{event.targetId}</strong></span>
      <time><Clock3 size={13} /> {formatDate(event.createdAt, true)}</time>
      <span className="audit-event-id">{event.id}</span>
    </div>
  );
}

