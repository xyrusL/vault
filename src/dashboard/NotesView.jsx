import { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import {
  Bold,
  ChevronDown,
  Clock3,
  FileText,
  Heading2,
  Italic,
  LayoutGrid,
  Link,
  List,
  ListChecks,
  ListOrdered,
  LoaderCircle,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Search,
  StickyNote,
  Trash2,
  Undo2,
  Redo2,
} from "lucide-react";
import apiFetch from "../api";
import { Modal } from "./DashboardUi";

const emptyDraft = { title: "", content: "" };
const sortOptions = [
  { value: "updated", label: "Recently updated" },
  { value: "created", label: "Recently created" },
  { value: "title", label: "Title A-Z" },
];

function parseNoteDate(value) {
  if (!value) return null;
  const date = new Date(`${value}${value.endsWith("Z") ? "" : "Z"}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatNoteDate(value) {
  const date = parseNoteDate(value);
  return date
    ? date.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
      })
    : "";
}

function formatRelativeDate(value) {
  const date = parseNoteDate(value);
  if (!date) return "";
  const minutes = Math.max(1, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : formatNoteDate(value);
}

async function readResult(response, fallback) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || fallback);
  return result;
}

function markdownToEditorHtml(value) {
  return renderToStaticMarkup(<Markdown>{value}</Markdown>);
}

function editorNodeToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const tag = node.tagName.toLowerCase();
  const children = () => [...node.childNodes].map(editorNodeToMarkdown).join("");
  if (tag === "br") return "\n";
  if (tag === "strong" || tag === "b") return `**${children()}**`;
  if (tag === "em" || tag === "i") return `_${children()}_`;
  if (tag === "a") return `[${children()}](${node.getAttribute("href") || "https://"})`;
  if (/^h[1-4]$/.test(tag)) return `${"#".repeat(Number(tag[1]))} ${children()}\n\n`;
  if (node.dataset.noteChecklist === "true") {
    return `- [ ] ${children().replace(/^\s*☐\s*/, "")}\n`;
  }
  if (tag === "ul" || tag === "ol") {
    return [...node.children]
      .filter((child) => child.tagName.toLowerCase() === "li")
      .map((child, index) => `${tag === "ol" ? `${index + 1}.` : "-"} ${[...child.childNodes].map(editorNodeToMarkdown).join("").trim()}`)
      .join("\n") + "\n\n";
  }
  if (tag === "p" || tag === "div") return `${children()}\n\n`;
  return children();
}

function editorToMarkdown(editor) {
  return [...editor.childNodes]
    .map(editorNodeToMarkdown)
    .join("")
    .replaceAll("\u00a0", " ")
    .replace(/^\n+/, "");
}

function NoteContentEditor({ value, onChange, rows, placeholder, className, onClose, onDelete, toolbarEnd }) {
  const editorRef = useRef(null);
  const editorValue = useRef(null);

  useEffect(() => {
    if (!editorRef.current || editorValue.current === value) return;
    editorRef.current.innerHTML = markdownToEditorHtml(value);
    editorValue.current = value;
  }, [value]);

  function syncContent() {
    if (!editorRef.current) return;
    const nextValue = editorToMarkdown(editorRef.current);
    if (nextValue.length > 12000) {
      editorRef.current.innerHTML = markdownToEditorHtml(editorValue.current || "");
      return;
    }
    editorValue.current = nextValue;
    onChange(nextValue);
  }

  function runCommand(command, commandValue) {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    syncContent();
  }

  function insertLink() {
    const url = window.prompt("Link URL", "https://");
    if (url) runCommand("createLink", url);
  }

  function insertChecklist() {
    runCommand("insertHTML", '<div data-note-checklist="true">☐&nbsp;</div>');
  }

  function pastePlainText(event) {
    event.preventDefault();
    runCommand("insertText", event.clipboardData.getData("text/plain"));
  }

  const toolClass = "grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white/5 hover:text-cyan-200";

  return (
    <>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={syncContent}
        onPaste={pastePlainText}
        role="textbox"
        aria-multiline="true"
        aria-label="Note content"
        data-placeholder={placeholder}
        data-rows={rows}
        className={`note-content-editor ${className}`}
      />
      <div onMouseDown={(event) => event.preventDefault()} className="flex items-center gap-0.5 overflow-x-auto border-t border-white/[0.06] px-3 py-2">
        {onDelete && <button type="button" onClick={onDelete} className={`${toolClass} text-red-300 hover:bg-red-500/10 hover:text-red-200`} aria-label="Delete note" title="Delete note"><Trash2 className="size-4" /></button>}
        {onDelete && <span className="mx-1 h-5 w-px shrink-0 bg-white/[0.08]" />}
        <button type="button" onClick={() => runCommand("bold")} className={toolClass} aria-label="Bold" title="Bold"><Bold className="size-4" /></button>
        <button type="button" onClick={() => runCommand("italic")} className={toolClass} aria-label="Italic" title="Italic"><Italic className="size-4" /></button>
        <button type="button" onClick={() => runCommand("formatBlock", "h2")} className={toolClass} aria-label="Heading" title="Heading"><Heading2 className="size-4" /></button>
        <span className="mx-1 h-5 w-px shrink-0 bg-white/[0.08]" />
        <button type="button" onClick={insertChecklist} className={toolClass} aria-label="Checklist" title="Checklist"><ListChecks className="size-4" /></button>
        <button type="button" onClick={() => runCommand("insertUnorderedList")} className={toolClass} aria-label="Bulleted list" title="Bulleted list"><List className="size-4" /></button>
        <button type="button" onClick={() => runCommand("insertOrderedList")} className={toolClass} aria-label="Numbered list" title="Numbered list"><ListOrdered className="size-4" /></button>
        <button type="button" onClick={insertLink} className={toolClass} aria-label="Insert link" title="Insert link"><Link className="size-4" /></button>
        <button type="button" onClick={() => runCommand("insertText", new Date().toLocaleString())} className={toolClass} aria-label="Insert date and time" title="Insert date and time"><Clock3 className="size-4" /></button>
        <span className="mx-1 h-5 w-px shrink-0 bg-white/[0.08]" />
        <button type="button" onClick={() => runCommand("undo")} className={toolClass} aria-label="Undo" title="Undo"><Undo2 className="size-4" /></button>
        <button type="button" onClick={() => runCommand("redo")} className={toolClass} aria-label="Redo" title="Redo"><Redo2 className="size-4" /></button>
        {toolbarEnd ? <div className="ml-auto flex shrink-0 items-center gap-2">{toolbarEnd}</div> : onClose && <button type="button" onClick={onClose} className="ml-auto h-9 shrink-0 rounded-lg px-3 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white">Close</button>}
      </div>
    </>
  );
}

export default function NotesView() {
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [editing, setEditing] = useState(null);
  const [deleteNote, setDeleteNote] = useState(null);
  const [query, setQuery] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [layout, setLayout] = useState("grid");
  const [sort, setSort] = useState("updated");
  const [sortOpen, setSortOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sortMenuRef = useRef(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    apiFetch("/notes")
      .then((response) => readResult(response, "Unable to load notes."))
      .then((result) => active && setNotes(result.data || []))
      .catch((requestError) => active && setLoadError(requestError.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [reloadKey]);

  useEffect(() => {
    if (!sortOpen) return undefined;

    function closeSortMenu(event) {
      if (event.type === "keydown" && event.key !== "Escape") return;
      if (event.type === "pointerdown" && sortMenuRef.current?.contains(event.target)) return;
      setSortOpen(false);
    }

    document.addEventListener("pointerdown", closeSortMenu);
    document.addEventListener("keydown", closeSortMenu);
    return () => {
      document.removeEventListener("pointerdown", closeSortMenu);
      document.removeEventListener("keydown", closeSortMenu);
    };
  }, [sortOpen]);

  const filteredNotes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matches = normalized
      ? notes.filter((note) => `${note.title} ${note.content}`.toLowerCase().includes(normalized))
      : [...notes];

    return matches.sort((a, b) => {
      if (sort === "created") return (parseNoteDate(b.createdAt || b.created_at) || 0) - (parseNoteDate(a.createdAt || a.created_at) || 0);
      if (sort === "title") return (a.title || "Untitled").localeCompare(b.title || "Untitled");
      return (parseNoteDate(b.updatedAt || b.updated_at) || 0) - (parseNoteDate(a.updatedAt || a.updated_at) || 0);
    });
  }, [notes, query, sort]);

  function updateDraft(event) {
    const { name, value } = event.target;
    setDraft((current) => ({ ...current, [name]: value }));
  }

  async function createNote(event) {
    event.preventDefault();
    if (!draft.title.trim() && !draft.content.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch("/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = await readResult(response, "Unable to create note.");
      setNotes((current) => [result.data, ...current]);
      setDraft(emptyDraft);
      setComposeOpen(false);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveNote(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch(`/notes/${encodeURIComponent(editing.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: editing.title, content: editing.content }),
      });
      const result = await readResult(response, "Unable to save note.");
      setNotes((current) => [result.data, ...current.filter((note) => note.id !== result.data.id)]);
      setEditing(null);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeNote() {
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch(`/notes/${encodeURIComponent(deleteNote.id)}`, { method: "DELETE" });
      if (!response.ok) await readResult(response, "Unable to delete note.");
      setNotes((current) => current.filter((note) => note.id !== deleteNote.id));
      setDeleteNote(null);
      if (editing?.id === deleteNote.id) setEditing(null);
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="notes-view">
      <form onSubmit={createNote} className={`mx-auto max-w-[1180px] overflow-hidden rounded-xl border border-white/10 bg-[#0a141b]/90 shadow-xl shadow-black/20 transition focus-within:border-cyan-300/30 ${composeOpen ? "is-open" : ""}`}>
        {composeOpen ? (
          <>
            <input name="title" value={draft.title} onChange={updateDraft} maxLength={200} placeholder="Note title" aria-label="Note title" autoFocus className="w-full bg-transparent px-5 pt-4 text-base font-semibold text-white outline-none placeholder:text-slate-500" />
            <NoteContentEditor value={draft.content} onChange={(content) => setDraft((current) => ({ ...current, content }))} rows={3} placeholder="Take a note..." className="min-h-24 w-full resize-y bg-transparent px-5 py-3 text-sm leading-6 text-slate-200 outline-none placeholder:text-slate-500" onClose={() => { setComposeOpen(false); setDraft(emptyDraft); }} />
            <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3">
              <span className="text-xs text-slate-600">{draft.content.length.toLocaleString()} / 12,000</span>
              <div className="flex gap-2">
                <button disabled={busy || (!draft.title.trim() && !draft.content.trim())} className="flex h-9 items-center gap-2 rounded-lg bg-cyan-500 px-4 text-sm font-semibold text-[#031014] transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40">
                  {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} Add note
                </button>
              </div>
            </div>
          </>
        ) : (
          <button type="button" onClick={() => setComposeOpen(true)} className="flex h-14 w-full items-center justify-between px-5 text-left text-sm text-slate-400 hover:bg-white/[0.025]">
            <span>Take a note...</span>
            <span className="grid size-9 place-items-center rounded-lg text-cyan-300"><Pencil className="size-[18px]" /></span>
          </button>
        )}
      </form>

      {error && <p className="mx-auto mt-4 max-w-[1180px] rounded-lg border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}

      {!loadError && <div className="mx-auto mt-9 flex w-full max-w-[1180px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes" className="h-11 w-full rounded-xl border border-white/10 bg-[#081219] pl-10 pr-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/35" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-xl border border-white/10 bg-[#081219] p-1">
            <button type="button" onClick={() => setLayout("grid")} aria-label="Grid view" className={`grid size-9 place-items-center rounded-lg ${layout === "grid" ? "bg-cyan-400/10 text-cyan-300" : "text-slate-500 hover:text-slate-200"}`}><LayoutGrid className="size-[18px]" /></button>
            <button type="button" onClick={() => setLayout("list")} aria-label="List view" className={`grid size-9 place-items-center rounded-lg ${layout === "list" ? "bg-cyan-400/10 text-cyan-300" : "text-slate-500 hover:text-slate-200"}`}><List className="size-[18px]" /></button>
          </div>
          <div ref={sortMenuRef} className="relative min-w-44 flex-1 sm:flex-none">
            <button
              type="button"
              onClick={() => setSortOpen((open) => !open)}
              aria-haspopup="listbox"
              aria-expanded={sortOpen}
              className={`flex h-11 w-full items-center justify-between gap-5 rounded-xl border bg-[#081219] px-4 text-sm text-slate-300 outline-none transition ${sortOpen ? "border-cyan-300/35" : "border-white/10 hover:border-white/20"}`}
            >
              {sortOptions.find((option) => option.value === sort)?.label}
              <ChevronDown className={`size-4 shrink-0 text-slate-500 transition-transform ${sortOpen ? "rotate-180" : ""}`} />
            </button>
            {sortOpen && (
              <div role="listbox" aria-label="Sort notes" className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-full min-w-52 overflow-hidden rounded-xl border border-white/10 bg-[#081219] p-1.5 shadow-2xl shadow-black/50">
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={sort === option.value}
                    onClick={() => { setSort(option.value); setSortOpen(false); }}
                    className={`flex h-10 w-full items-center rounded-lg px-3 text-left text-sm transition ${sort === option.value ? "bg-cyan-400/10 text-cyan-200" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>}

      {loading ? (
        <div className="grid min-h-64 place-items-center"><LoaderCircle className="size-7 animate-spin text-cyan-300" /></div>
      ) : loadError ? (
        <div className="mx-auto mt-8 grid min-h-52 max-w-[1180px] place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] px-6 text-center">
          <div>
            <span className="mx-auto grid size-12 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-400/10 text-cyan-300"><StickyNote className="size-5" /></span>
            <h2 className="mt-4 font-semibold text-slate-200">Notes are unavailable</h2>
            <p className="mt-2 text-sm text-slate-500">The notes service could not be reached.</p>
            <button type="button" onClick={() => setReloadKey((key) => key + 1)} className="mx-auto mt-5 flex h-10 items-center gap-2 rounded-lg border border-cyan-300/20 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-200 hover:bg-cyan-400/15"><RefreshCw className="size-4" /> Try again</button>
          </div>
        </div>
      ) : filteredNotes.length ? (
        <div className={`mx-auto mt-5 w-full max-w-[1180px] ${layout === "grid" ? "columns-1 gap-4 sm:columns-2 xl:columns-4" : "space-y-3"}`}>
          {filteredNotes.map((note) => (
            <article key={note.id} className={`group relative mb-4 break-inside-avoid overflow-hidden rounded-xl border border-white/[0.1] bg-gradient-to-br from-[#0b171e] to-[#071117] shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:border-cyan-300/25 hover:shadow-black/25 ${layout === "list" ? "mb-0" : ""}`}>
              <button type="button" onClick={() => setEditing({ ...note })} className={`w-full px-4 pb-2 pt-4 text-left ${layout === "list" ? "pr-28" : ""}`}>
                <span className="absolute right-4 top-4 text-cyan-300 opacity-0 transition group-hover:opacity-100"><Pin className="size-4" /></span>
                <h2 className="line-clamp-2 pr-5 text-base font-semibold leading-6 text-slate-100">{note.title || "Untitled note"}</h2>
                 <div className={`notes-markdown mt-3 text-sm leading-6 text-slate-400 ${layout === "list" ? "line-clamp-2" : "line-clamp-6"}`}><Markdown components={{ a: ({ children }) => <span className="text-cyan-300">{children}</span> }}>{note.content || "No additional content"}</Markdown></div>
              </button>
              <div className="flex min-h-11 items-center justify-between gap-3 px-4 pb-3 pt-1">
                <div className="flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                  <button type="button" onClick={() => setEditing({ ...note })} className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-cyan-400/10 hover:text-cyan-300" aria-label={`Edit ${note.title || "note"}`}><Pencil className="size-4" /></button>
                  <button type="button" onClick={() => setDeleteNote(note)} className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-red-500/10 hover:text-red-300" aria-label={`Delete ${note.title || "note"}`}><Trash2 className="size-4" /></button>
                </div>
                <span className="ml-auto text-xs text-slate-500">{formatRelativeDate(note.updatedAt || note.updated_at)}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mx-auto mt-8 grid min-h-52 max-w-[1180px] place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] px-6 text-center">
          <div>
            <span className="mx-auto grid size-12 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-400/10 text-cyan-300">{query ? <Search className="size-5" /> : <StickyNote className="size-5" />}</span>
            <h2 className="mt-4 font-semibold text-slate-200">{query ? "No matching notes" : "No notes yet"}</h2>
            <p className="mt-2 text-sm text-slate-500">{query ? "Try a different search term." : "Add a new note to get started."}</p>
            {!query && <button type="button" onClick={() => setComposeOpen(true)} className="mx-auto mt-5 flex h-10 items-center gap-2 rounded-lg border border-cyan-300/20 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-200 hover:bg-cyan-400/15"><Plus className="size-4" /> Create note</button>}
          </div>
        </div>
      )}

      {editing && (
        <Modal
          title="Edit note"
          size="note"
          onClose={() => !busy && setEditing(null)}
          header={(
            <div className="relative px-5 pb-2 pt-5 sm:px-6 sm:pt-6">
              <input value={editing.title} onChange={(event) => setEditing((current) => ({ ...current, title: event.target.value }))} maxLength={200} autoFocus placeholder="Title" aria-label="Note title" className="w-full bg-transparent pr-12 text-xl font-semibold text-white outline-none placeholder:text-slate-500 sm:text-2xl" />
              <Pin className="absolute right-4 top-4 size-5 text-slate-500 sm:right-5 sm:top-5" aria-hidden="true" />
            </div>
          )}
        >
          <form onSubmit={saveNote}>
            <NoteContentEditor
              value={editing.content}
              onChange={(content) => setEditing((current) => ({ ...current, content }))}
              rows={16}
              placeholder="Take a note..."
              className="min-h-[52dvh] max-h-[68dvh] w-full resize-none bg-transparent px-5 py-3 text-base leading-7 text-slate-200 outline-none placeholder:text-slate-500 sm:px-6"
              onDelete={() => { setEditing(null); setDeleteNote(editing); }}
              toolbarEnd={(
                <>
                  <button type="button" onClick={() => setEditing(null)} disabled={busy} className="h-9 rounded-lg px-3 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white">Close</button>
                  <button disabled={busy || (!editing.title.trim() && !editing.content.trim())} className="flex h-9 items-center gap-2 rounded-lg bg-cyan-500 px-4 text-sm font-semibold text-[#031014] hover:bg-cyan-400 disabled:opacity-50">{busy && <LoaderCircle className="size-4 animate-spin" />} Save</button>
                </>
              )}
            />
          </form>
        </Modal>
      )}

      {deleteNote && (
        <Modal title="Delete note?" onClose={() => !busy && setDeleteNote(null)}>
          <div className="mt-5 flex gap-4 rounded-xl border border-red-400/15 bg-red-500/[0.06] p-4"><FileText className="mt-0.5 size-5 shrink-0 text-red-300" /><div><p className="font-medium text-slate-200">{deleteNote.title || "Untitled note"}</p><p className="mt-1 text-sm text-slate-400">This permanently removes the encrypted note from your vault.</p></div></div>
          <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setDeleteNote(null)} disabled={busy} className="h-10 rounded-lg border border-white/10 px-4 text-sm text-slate-300">Cancel</button><button type="button" onClick={removeNote} disabled={busy} className="flex h-10 items-center gap-2 rounded-lg bg-red-500 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy && <LoaderCircle className="size-4 animate-spin" />} Delete</button></div>
        </Modal>
      )}
    </section>
  );
}
