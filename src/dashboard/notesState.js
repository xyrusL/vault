export const NOTE_TITLE_LIMIT = 200;
export const NOTE_CONTENT_LIMIT = 12000;

export function normalizeNote(note) {
  if (!note || typeof note !== "object" || !note.id) return null;
  return {
    ...note,
    id: String(note.id),
    title: typeof note.title === "string" ? note.title : "",
    content: typeof note.content === "string" ? note.content : "",
    isPinned: Boolean(note.isPinned ?? note.pinned ?? note.is_pinned),
  };
}

export function validateNote(note) {
  const title = String(note?.title || "").trim();
  const content = String(note?.content || "");
  if (!title && !content.trim()) return "Add a title or some content first.";
  if (title.length > NOTE_TITLE_LIMIT) return `Note titles can be at most ${NOTE_TITLE_LIMIT} characters.`;
  if (content.length > NOTE_CONTENT_LIMIT) return `Note content can be at most ${NOTE_CONTENT_LIMIT.toLocaleString()} characters.`;
  return "";
}

export function noteHasChanges(original, draft) {
  return String(original?.title || "") !== String(draft?.title || "")
    || String(original?.content || "") !== String(draft?.content || "")
    || Boolean(original?.isPinned) !== Boolean(draft?.isPinned);
}

export function compareNotes(a, b, sort = "updated") {
  const pinOrder = Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned));
  if (pinOrder) return pinOrder;
  if (sort === "created") {
    return (Date.parse(b.createdAt || b.created_at) || 0) - (Date.parse(a.createdAt || a.created_at) || 0)
      || String(b.id).localeCompare(String(a.id));
  }
  if (sort === "title") {
    return (a.title || "Untitled").localeCompare(b.title || "Untitled")
      || String(a.id).localeCompare(String(b.id));
  }
  return (Date.parse(b.updatedAt || b.updated_at) || 0) - (Date.parse(a.updatedAt || a.updated_at) || 0)
    || String(b.id).localeCompare(String(a.id));
}

export function mergeNote(notes, note) {
  const normalized = normalizeNote(note);
  if (!normalized) return notes;
  return [normalized, ...notes.filter((item) => item.id !== normalized.id)];
}

export function reconcileIds(selectedIds, records) {
  const valid = new Set(records.map((record) => record.id));
  return selectedIds.filter((id) => valid.has(id));
}

export function toggleIds(selectedIds, ids) {
  const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id));
  return allSelected
    ? selectedIds.filter((id) => !ids.includes(id))
    : [...new Set([...selectedIds, ...ids])];
}

export function clampPage(page, pageCount) {
  return Math.min(Math.max(1, page), Math.max(1, pageCount));
}
