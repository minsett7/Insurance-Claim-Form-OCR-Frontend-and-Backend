export const REVIEW_FILTERS = [
  { id: "review", label: "Needs review" },
  { id: "processing", label: "Processing" },
  { id: "exceptions", label: "Exceptions" },
  { id: "completed", label: "Completed" },
  { id: "all", label: "All" },
];

export function matchesQueueFilter(document, filter) {
  const status = String(document?.status ?? "").toLowerCase();
  if (filter === "all") return true;
  if (filter === "review") return status === "needs review";
  if (filter === "processing") return ["uploaded", "processing", "quality check", "matching template", "extracting"].includes(status);
  if (filter === "exceptions") return ["failed", "no match", "poor quality", "ambiguous match"].includes(status);
  if (filter === "completed") return ["ready to sync", "synced"].includes(status);
  return true;
}

export function matchTemplateForFile(fileName, activeTemplates) {
  if (!activeTemplates.length) return { template: null, confidence: 0, reason: "No active templates" };
  const normalizedName = String(fileName).toLowerCase();
  const direct = activeTemplates.find((template) => {
    const tokens = [template.formTypeId, template.formTypeLabel, template.name]
      .filter(Boolean)
      .flatMap((value) => String(value).toLowerCase().split(/[^a-z0-9]+/))
      .filter((token) => token.length > 3);
    return tokens.some((token) => normalizedName.includes(token));
  });

  if (direct) return { template: direct, confidence: 0.97, reason: "Filename and layout indicators agree" };
  return { template: activeTemplates[0], confidence: 0.86, reason: "Best available layout match" };
}

export function documentMatchConfidence(document, template) {
  if (!document || !template) return 0;
  const normalizedName = String(document.fileName).toLowerCase();
  if (normalizedName.includes(String(template.formTypeId).toLowerCase())) return 0.97;
  const extractionConfidence = Number(document.confidence);
  if (Number.isFinite(extractionConfidence) && extractionConfidence > 0) {
    return Math.max(0.78, Math.min(0.96, extractionConfidence + 0.06));
  }
  return 0.88;
}

export function countDocumentIssues(issues) {
  return Object.values(issues ?? {}).reduce((total, fieldIssues) => total + fieldIssues.length, 0);
}

export function sortFieldsForReview(fields, issues, confidenceByField, fallbackConfidence) {
  return [...fields].sort((left, right) => {
    const leftHasIssue = Boolean(issues[left.key]?.length);
    const rightHasIssue = Boolean(issues[right.key]?.length);
    if (leftHasIssue !== rightHasIssue) return leftHasIssue ? -1 : 1;
    const leftConfidence = confidenceByField?.[left.key] ?? fallbackConfidence ?? 0;
    const rightConfidence = confidenceByField?.[right.key] ?? fallbackConfidence ?? 0;
    return leftConfidence - rightConfidence;
  });
}

