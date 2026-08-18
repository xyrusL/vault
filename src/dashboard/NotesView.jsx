import { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bold,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Italic,
  LayoutGrid,
  Link,
  List,
  ListChecks,
  ListOrdered,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Search,
  StickyNote,
  Trash2,
  Undo2,
  Redo2,
  X,
} from "lucide-react";
import apiFetch from "../api";
import { Modal, SelectField } from "./DashboardUi";
import {
  NOTE_CONTENT_LIMIT,
  NOTE_TITLE_LIMIT,
  mergeNote,
  normalizeNote,
  noteHasChanges,
  compareNotes,
  validateNote,
} from "./notesState";

const emptyDraft = { title: "", content: "" };
const sortOptions = [
  { value: "updated", label: "Recently updated" },
  { value: "created", label: "Recently created" },
  { value: "title", label: "Title A-Z" },
];
const noteFonts = [
  { value: "sans", label: "Arial", family: "Arial, sans-serif" },
  { value: "serif", label: "Georgia", family: "Georgia, serif" },
  { value: "display", label: "Times New Roman", family: '"Times New Roman", Times, serif' },
  { value: "mono", label: "Courier New", family: '"Courier New", Courier, monospace' },
  { value: "rounded", label: "Verdana", family: "Verdana, Geneva, sans-serif" },
];
const noteFontMarker = /^\[\/\/\]: # \(note-font:(sans|serif|mono|display|rounded)\)\n\n?/;

function parseNoteContent(value = "") {
  const match = value.match(noteFontMarker);
  return { content: value.replace(noteFontMarker, ""), font: match?.[1] || "sans" };
}

function serializeNoteContent(content, font) {
  return font === "sans" ? content : `[//]: # (note-font:${font})\n\n${content}`;
}

function noteFontFamily(font) {
  return noteFonts.find((option) => option.value === font)?.family || noteFonts[0].family;
}

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
  return renderToStaticMarkup(<Markdown remarkPlugins={[remarkGfm]}>{value}</Markdown>);
}

function enableEditorChecklists(editor) {
  editor.querySelectorAll('li > input[type="checkbox"]').forEach((checkbox) => {
    checkbox.disabled = false;
    checkbox.setAttribute("aria-label", checkbox.checked ? "Mark task incomplete" : "Mark task complete");
    checkbox.closest("li")?.classList.add("note-checklist-item");
  });
}

function normalizeLinkUrl(value) {
  const trimmed = value.trim();
  const hasControlCharacters = [...trimmed].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  if (!trimmed || hasControlCharacters || trimmed.startsWith("//")) return null;
  try {
    const url = new URL(trimmed);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function elementForNode(node) {
  return node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
}

function editorNodeToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const tag = node.tagName.toLowerCase();
  if (tag === "li") {
    const checkbox = node.querySelector(":scope > input[type=checkbox]");
    if (checkbox) {
      const text = [...node.childNodes]
        .filter((child) => child !== checkbox)
        .map(editorNodeToMarkdown)
        .join("")
        .trim();
      return `- [${checkbox.checked ? "x" : " "}] ${text}\n`;
    }
  }
  const children = () => [...node.childNodes].map(editorNodeToMarkdown).join("");
  if (tag === "br") return "\n";
  if (tag === "strong" || tag === "b") return `**${children()}**`;
  if (tag === "em" || tag === "i") return `_${children()}_`;
  if (tag === "a") {
    const href = normalizeLinkUrl(node.getAttribute("href") || "");
    return href ? `[${children()}](${href})` : children();
  }
  if (/^h[1-4]$/.test(tag)) return `${"#".repeat(Number(tag[1]))} ${children()}\n\n`;
  if (node.dataset.noteChecklist === "true") {
    const checkbox = node.querySelector(':scope > input[type="checkbox"]');
    const text = [...node.childNodes]
      .filter((child) => child !== checkbox)
      .map(editorNodeToMarkdown)
      .join("")
      .replace(/^\s+/, "");
    return `- [${checkbox?.checked ? "x" : " "}] ${text}\n`;
  }
  if (tag === "ul" || tag === "ol") {
    return [...node.children]
      .filter((child) => child.tagName.toLowerCase() === "li")
      .map((child, index) => {
        const item = editorNodeToMarkdown(child).trim();
        if (/^- \[[ xX]\] /.test(item)) return item;
        return `${tag === "ol" ? `${index + 1}.` : "-"} ${item}`;
      })
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
  const savedRangeRef = useRef(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState("");
  const linkInputRef = useRef(null);
  const toolsRef = useRef(null);
  const [activeHeading, setActiveHeading] = useState("");
  const parsedValue = parseNoteContent(value);
  const selectedFont = parsedValue.font;

  useEffect(() => {
    if (!editorRef.current || editorValue.current === value) return;
    editorRef.current.innerHTML = markdownToEditorHtml(parseNoteContent(value).content);
    enableEditorChecklists(editorRef.current);
    editorValue.current = value;
  }, [value]);


  function syncContent() {
    if (!editorRef.current) return;
    const nextValue = serializeNoteContent(editorToMarkdown(editorRef.current), selectedFont);
    if (nextValue.length > NOTE_CONTENT_LIMIT) {
      editorRef.current.innerHTML = markdownToEditorHtml(parseNoteContent(editorValue.current).content);
      return;
    }
    editorValue.current = nextValue;
    onChange(nextValue);
  }

  function captureSelection() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return null;
    return range.cloneRange();
  }

  function restoreSelection(range = savedRangeRef.current) {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || !range || !editor.contains(range.commonAncestorContainer)) return false;
    editor.focus();
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function updateActiveHeading() {
    const editor = editorRef.current;
    const range = captureSelection();
    const block = elementForNode(range?.startContainer)?.closest("h1, h2, h3, h4");
    setActiveHeading(block && editor?.contains(block) ? block.tagName.toLowerCase() : "");
  }

  function runCommand(command, commandValue) {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = window.getSelection();
    const range = captureSelection() || savedRangeRef.current;
    if (!restoreSelection(range)) {
      const fallback = document.createRange();
      fallback.selectNodeContents(editor);
      fallback.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(fallback);
      savedRangeRef.current = fallback.cloneRange();
    }
    editor.focus();
    document.execCommand(command, false, commandValue);
    enableEditorChecklists(editor);
    syncContent();
    requestAnimationFrame(updateActiveHeading);
  }

  function applyHeading(level) {
    const range = captureSelection() || savedRangeRef.current;
    if (!range || range.collapsed) return;
    const block = elementForNode(range.startContainer)?.closest("h1, h2, h3, h4, p, div");
    if (!block || block === editorRef.current || !editorRef.current?.contains(block)) return;
    const nextBlock = block.tagName.toLowerCase() === level ? "p" : level;
    savedRangeRef.current = range;
    runCommand("formatBlock", nextBlock);
  }

  function insertLink() {
    const range = captureSelection();
    savedRangeRef.current = range;
    const anchor = elementForNode(range?.startContainer)?.closest("a");
    setLinkUrl(anchor?.getAttribute("href") || "https://");
    setLinkError("");
    setLinkDialogOpen(true);
    requestAnimationFrame(() => linkInputRef.current?.focus());
  }

  function submitLink(event) {
    event.preventDefault();
    const normalizedUrl = normalizeLinkUrl(linkUrl);
    if (!normalizedUrl) {
      setLinkError("Enter a valid http:// or https:// URL.");
      return;
    }
    if (!restoreSelection()) {
      setLinkError("Select text in the note before inserting a link.");
      return;
    }
    document.execCommand("createLink", false, normalizedUrl);
    syncContent();
    setLinkDialogOpen(false);
    setLinkError("");
  }

  function createChecklistBlock() {
    const checklist = document.createElement("div");
    checklist.dataset.noteChecklist = "true";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checklist.append(checkbox, document.createTextNode(" "));
    return checklist;
  }

  function insertChecklist() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!editor || !range || !editor.contains(range.commonAncestorContainer)) {
      const checklist = createChecklistBlock();
      editor?.append(checklist);
      const range = document.createRange();
      range.selectNodeContents(checklist);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
      syncContent();
      return;
    }

    const elementForNode = (node) => (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement);
    const closestChecklist = (node) => elementForNode(node)?.closest('[data-note-checklist="true"]');
    const existingChecklist = closestChecklist(selection.anchorNode)
      || closestChecklist(selection.focusNode)
      || closestChecklist(range.commonAncestorContainer);
    if (existingChecklist && editor.contains(existingChecklist)) {
      const plainBlock = document.createElement("div");
      while (existingChecklist.firstChild) plainBlock.append(existingChecklist.firstChild);
      const checkbox = plainBlock.querySelector(':scope > input[type="checkbox"]');
      checkbox?.remove();
      if (plainBlock.firstChild?.nodeType === Node.TEXT_NODE) {
        plainBlock.firstChild.nodeValue = plainBlock.firstChild.nodeValue.replace(/^\s+/, "");
      }
      existingChecklist.replaceWith(plainBlock);
      editor.focus();
      syncContent();
      return;
    }

    const anchorElement = elementForNode(selection.anchorNode);
    const block = anchorElement?.closest("p, h1, h2, h3, h4, li, div");
    if (block && block !== editor && editor.contains(block)) {
      const checklist = createChecklistBlock();
      while (block.firstChild) checklist.append(block.firstChild);
      block.replaceWith(checklist);
      const nextRange = document.createRange();
      nextRange.selectNodeContents(checklist);
      nextRange.collapse(false);
      selection.removeAllRanges();
      selection.addRange(nextRange);
      editor.focus();
      syncContent();
      return;
    }

    if (selection.anchorNode?.parentElement === editor) {
      const checklist = createChecklistBlock();
      const textNode = selection.anchorNode;
      editor.insertBefore(checklist, textNode);
      checklist.append(textNode);
      const nextRange = document.createRange();
      nextRange.selectNodeContents(checklist);
      nextRange.collapse(false);
      selection.removeAllRanges();
      selection.addRange(nextRange);
      editor.focus();
      syncContent();
      return;
    }

    const checklist = createChecklistBlock();
    const selectedContent = range.extractContents();
    checklist.append(selectedContent);
    range.insertNode(checklist);

    const nextRange = document.createRange();
    nextRange.selectNodeContents(checklist);
    nextRange.collapse(false);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    editor.focus();
    syncContent();
  }

  function pastePlainText(event) {
    event.preventDefault();
    runCommand("insertText", event.clipboardData.getData("text/plain"));
  }

  function handleKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey || !editorRef.current) return;

    const editor = editorRef.current;
    const selection = window.getSelection();
    const anchorElement = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode
      : selection?.anchorNode?.parentElement;
    const checklist = anchorElement?.closest('[data-note-checklist="true"]');
    const listItem = anchorElement?.closest("li");
    const taskCheckbox = listItem?.querySelector(':scope > input[type="checkbox"]');

    if (checklist && editor.contains(checklist)) {
      event.preventDefault();
      const checkbox = checklist.querySelector(':scope > input[type="checkbox"]');
      const itemText = [...checklist.childNodes]
        .filter((child) => child !== checkbox)
        .map((child) => child.textContent || "")
        .join("")
        .trim();
      const nextBlock = itemText ? createChecklistBlock() : document.createElement("div");
      if (!itemText) nextBlock.append(document.createElement("br"));
      checklist.after(nextBlock);
      if (!itemText) checklist.remove();

      const range = document.createRange();
      range.selectNodeContents(nextBlock);
      range.collapse(!itemText);
      selection.removeAllRanges();
      selection.addRange(range);
      syncContent();
      return;
    }

    if (taskCheckbox && editor.contains(listItem)) {
      event.preventDefault();
      const itemText = [...listItem.childNodes]
        .filter((child) => child !== taskCheckbox)
        .map((child) => child.textContent || "")
        .join("")
        .trim();
      if (!itemText) {
        const list = listItem.parentElement;
        const paragraph = document.createElement("p");
        paragraph.append(document.createElement("br"));
        list.after(paragraph);
        listItem.remove();
        if (!list.children.length) list.remove();
        const range = document.createRange();
        range.selectNodeContents(paragraph);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        syncContent();
        return;
      }

      const nextItem = document.createElement("li");
      nextItem.className = listItem.className;
      const nextCheckbox = document.createElement("input");
      nextCheckbox.type = "checkbox";
      nextItem.append(nextCheckbox, document.createTextNode(" "));
      listItem.after(nextItem);

      const range = document.createRange();
      range.selectNodeContents(nextItem);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      syncContent();
      return;
    }

    if (listItem?.closest("ol")) {
      // Native contenteditable behavior continues the active ordered list.
      window.requestAnimationFrame(syncContent);
    }
  }

  function changeFont(event) {
    const nextValue = serializeNoteContent(parseNoteContent(value).content, event.target.value);
    editorValue.current = nextValue;
    onChange(nextValue);
    requestAnimationFrame(() => editorRef.current?.focus());
  }

  function scrollTools(direction) {
    toolsRef.current?.scrollBy({ left: direction * Math.min(280, toolsRef.current.clientWidth * 0.7), behavior: "smooth" });
  }

  const toolClass = "grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white/5 hover:text-cyan-200";

  return (
    <>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={() => { syncContent(); updateActiveHeading(); }}
        onKeyUp={updateActiveHeading}
        onSelect={updateActiveHeading}
        onClick={(event) => {
          if (event.target.matches('input[type="checkbox"]')) {
            event.target.disabled = false;
            event.target.setAttribute("aria-label", event.target.checked ? "Mark task incomplete" : "Mark task complete");
            syncContent();
          }
          updateActiveHeading();
        }}
        onKeyDown={handleKeyDown}
        onPaste={pastePlainText}
        role="textbox"
        aria-multiline="true"
        aria-label="Note content"
        data-placeholder={placeholder}
        data-rows={rows}
        className={`note-content-editor ${className}`}
        style={{ fontFamily: noteFontFamily(selectedFont) }}
      />
      <div onMouseDown={(event) => event.preventDefault()} className="note-editor-toolbar flex items-center border-t border-white/[0.06] px-3 py-2">
        {onDelete && <button type="button" onClick={() => scrollTools(-1)} className="note-toolbar-scroll note-toolbar-scroll-left" aria-label="Previous formatting tools" title="Previous tools"><ChevronLeft className="size-4" /></button>}
        <div ref={toolsRef} className={`note-editor-tools flex min-w-0 items-center gap-0.5 overflow-x-auto ${onDelete ? "" : "w-full"}`}>
          <div className="note-heading-tools flex shrink-0 items-center gap-0.5" role="group" aria-label="Text headings">
            {[
              { level: "h1", label: "H1" },
              { level: "h2", label: "H2" },
              { level: "h3", label: "H3" },
              { level: "h4", label: "H4" },
            ].map(({ level, label }) => (
              <button key={level} type="button" onClick={() => applyHeading(level)} className={`${toolClass} note-editor-tool note-heading-tool ${activeHeading === level ? "is-active" : ""}`} aria-label={`Heading ${label.slice(1)}`} title={`${label} — highlight text first; select again for normal text`} aria-pressed={activeHeading === level}><span>{label}</span></button>
            ))}
          </div>
          <span className="mx-1 h-5 w-px shrink-0 bg-white/[0.08]" />
          {onDelete && <button type="button" onClick={onDelete} className={`${toolClass} note-editor-tool text-red-300 hover:bg-red-500/10 hover:text-red-200`} aria-label="Delete note" title="Delete note"><Trash2 className="size-4" /></button>}
          {onDelete && <span className="mx-1 h-5 w-px shrink-0 bg-white/[0.08]" />}
          <button type="button" onClick={() => runCommand("bold")} className={`${toolClass} note-editor-tool`} aria-label="Bold" title="Bold"><Bold className="size-4" /></button>
           <button type="button" onClick={() => runCommand("italic")} className={`${toolClass} note-editor-tool`} aria-label="Italic" title="Italic"><Italic className="size-4" /></button>
          <SelectField
            options={noteFonts}
            value={selectedFont}
            onChange={changeFont}
            ariaLabel="Content font"
            getOptionStyle={(font) => ({ fontFamily: noteFontFamily(font) })}
            className="h-9 !min-h-0 !w-auto min-w-[8rem] !px-2 !py-0 text-xs"
            textClassName="text-xs"
          />
          <button type="button" onClick={insertChecklist} className={`${toolClass} note-editor-tool`} aria-label="Checklist" title="Checklist"><ListChecks className="size-4" /></button>
          <button type="button" onClick={() => runCommand("insertUnorderedList")} className={`${toolClass} note-editor-tool`} aria-label="Bulleted list" title="Bulleted list"><List className="size-4" /></button>
          <button type="button" onClick={() => runCommand("insertOrderedList")} className={`${toolClass} note-editor-tool`} aria-label="Numbered list" title="Numbered list"><ListOrdered className="size-4" /></button>
          <button type="button" onClick={insertLink} className={`${toolClass} note-editor-tool`} aria-label="Insert link" title="Insert link"><Link className="size-4" /></button>
          <button type="button" onClick={() => runCommand("insertText", new Date().toLocaleString())} className={`${toolClass} note-editor-tool`} aria-label="Insert date and time" title="Insert date and time"><Clock3 className="size-4" /></button>
          <span className="mx-1 h-5 w-px shrink-0 bg-white/[0.08]" />
          <button type="button" onClick={() => runCommand("undo")} className={`${toolClass} note-editor-tool`} aria-label="Undo" title="Undo"><Undo2 className="size-4" /></button>
          <button type="button" onClick={() => runCommand("redo")} className={`${toolClass} note-editor-tool`} aria-label="Redo" title="Redo"><Redo2 className="size-4" /></button>
        </div>
        {onDelete && <button type="button" onClick={() => scrollTools(1)} className="note-toolbar-scroll note-toolbar-scroll-right" aria-label="Next formatting tools" title="Next tools"><ChevronRight className="size-4" /></button>}
        {toolbarEnd ? <div className="note-editor-actions ml-3 flex shrink-0 items-center gap-2">{toolbarEnd}</div> : onClose && <div className="note-editor-actions ml-auto shrink-0"><button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white">Close</button></div>}
      </div>
      {linkDialogOpen && (
        <Modal title="Add a link" description="Connect the selected text to a secure web address." onClose={() => { setLinkDialogOpen(false); setLinkError(""); requestAnimationFrame(() => restoreSelection()); }} className="note-link-modal">
          <form onSubmit={submitLink} className="mt-5">
            <label className="block text-xs font-medium uppercase tracking-[0.16em] text-cyan-200/70" htmlFor="note-link-url">Web address</label>
            <div className="note-link-field mt-2 flex items-center rounded-xl border border-white/10 bg-black/20 px-3 focus-within:border-cyan-300/45 focus-within:ring-2 focus-within:ring-cyan-300/10">
              <Link className="size-4 shrink-0 text-cyan-300" aria-hidden="true" />
              <input id="note-link-url" ref={linkInputRef} type="url" inputMode="url" value={linkUrl} onChange={(event) => { setLinkUrl(event.target.value); setLinkError(""); }} aria-invalid={Boolean(linkError)} aria-describedby="note-link-help" autoComplete="url" className="h-12 min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-slate-600" placeholder="https://example.com" />
            </div>
            <p id="note-link-help" role={linkError ? "alert" : undefined} className={`mt-2 text-xs ${linkError ? "text-red-300" : "text-slate-500"}`}>{linkError || "Only http:// and https:// links are allowed."}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => { setLinkDialogOpen(false); setLinkError(""); requestAnimationFrame(() => restoreSelection()); }} className="h-10 rounded-lg border border-white/10 px-4 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white">Cancel</button>
              <button type="submit" className="h-10 rounded-lg bg-cyan-500 px-4 text-sm font-semibold text-[#031014] transition hover:bg-cyan-400">Insert link</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function NoteEditorModal({ note, onChange, onClose, onSubmit, onDelete, busy, creating = false }) {
  return (
    <Modal
      title={creating ? "Create note" : "Edit note"}
      size="note"
      className="note-editor-modal"
      onClose={onClose}
      header={(
        <div className="relative border-b border-white/10 px-5 pb-2 pt-12 sm:px-6 sm:pt-12">
          <input
            value={note.title}
            onChange={(event) => onChange({ ...note, title: event.target.value })}
            maxLength={NOTE_TITLE_LIMIT}
            autoFocus
            placeholder="Title"
            aria-label="Note title"
            className="w-full bg-transparent text-xl font-semibold text-white outline-none placeholder:text-slate-500 sm:text-2xl"
          />
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close note editor" title="Close editor" className="absolute right-1 top-1 grid size-9 cursor-pointer place-items-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 sm:right-2 sm:top-1">
            <X className="size-5" />
          </button>
        </div>
      )}
    >
      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        <NoteContentEditor
          value={note.content}
          onChange={(content) => onChange({ ...note, content })}
          rows={16}
          placeholder="Take a note..."
          className="min-h-[52dvh] max-h-[68dvh] w-full resize-none bg-transparent px-5 py-3 text-base leading-7 text-slate-200 outline-none placeholder:text-slate-500 sm:px-6"
          onDelete={onDelete}
          toolbarEnd={creating ? (
            <button disabled={busy || (!note.title.trim() && !note.content.trim())} className="flex h-9 items-center gap-2 rounded-lg bg-cyan-500 px-4 text-sm font-semibold text-[#031014] transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40">
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} Add note
            </button>
          ) : null}
        />
      </form>
    </Modal>
  );
}

export default function NotesView() {
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [editing, setEditing] = useState(null);
  const [editingOriginal, setEditingOriginal] = useState(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [deleteAfterDiscard, setDeleteAfterDiscard] = useState(null);
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
  const [openNoteMenu, setOpenNoteMenu] = useState(null);
  const sortMenuRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setLoadError("");
    apiFetch("/notes", { signal: controller.signal })
      .then((response) => readResult(response, "Unable to load notes."))
      .then((result) => active && setNotes((Array.isArray(result.data) ? result.data : []).map(normalizeNote).filter(Boolean)))
      .catch((requestError) => {
        if (active && requestError.name !== "AbortError") setLoadError(requestError.message);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadKey]);

  function closeEditor(nextAction = null) {
    if (!editing) return;
    if (busy) return;
    if (noteHasChanges(editingOriginal, editing)) {
      setDeleteAfterDiscard(nextAction);
      setDiscardOpen(true);
      return;
    }
    setEditing(null);
    setEditingOriginal(null);
    if (nextAction) setDeleteNote(nextAction);
  }

  function openEditor(note) {
    const normalized = normalizeNote(note);
    if (!normalized) return;
    setEditing({ ...normalized });
    setEditingOriginal({ ...normalized });
    setError("");
  }

  function discardEditorChanges() {
    const nextAction = deleteAfterDiscard;
    setDiscardOpen(false);
    setDeleteAfterDiscard(null);
    setEditing(null);
    setEditingOriginal(null);
    if (nextAction) setDeleteNote(nextAction);
  }

  function validateNoteDraft(note) {
    return validateNote(note);
  }

  const editingDirty = Boolean(editing && noteHasChanges(editingOriginal, editing));

  useEffect(() => {
    if (!editingDirty || busy || !editing?.id) return undefined;
    const timer = window.setTimeout(() => saveNote(), 700);
    return () => window.clearTimeout(timer);
  }, [editing, editingDirty, busy]);

  useEffect(() => {
    if (!editingDirty) return undefined;
    function preventUnload(event) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [editingDirty]);


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
      ? notes.filter((note) => `${note.title} ${parseNoteContent(note.content).content}`.toLowerCase().includes(normalized))
      : [...notes];

    return matches.sort((a, b) => compareNotes(a, b, sort));
  }, [notes, query, sort]);
  const pinnedNotes = filteredNotes.filter((note) => note.isPinned);
  const unpinnedNotes = filteredNotes.filter((note) => !note.isPinned);

  async function createNote(event) {
    event.preventDefault();
    const validationError = validateNoteDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch("/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = await readResult(response, "Unable to create note.");
      const created = normalizeNote(result.data);
      if (!created) throw new Error("The notes service returned an invalid note.");
      setNotes((current) => mergeNote(current, created));
      setDraft(emptyDraft);
      setComposeOpen(false);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleNotePin(note) {
    if (!note?.id || busy) return;
    const nextPinned = !note.isPinned;
    setNotes((current) => mergeNote(current, { ...note, isPinned: nextPinned }));
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch(`/notes/${encodeURIComponent(note.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: note.title, content: note.content, isPinned: nextPinned }),
      });
      const result = await readResult(response, "Unable to update note pin.");
      const saved = normalizeNote(result.data);
      if (!saved) throw new Error("The notes service returned an invalid note.");
      setNotes((current) => mergeNote(current, { ...saved, isPinned: nextPinned }));
    } catch (pinError) {
      setNotes((current) => mergeNote(current, note));
      setError(pinError.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveNote(event) {
    event?.preventDefault();
    if (!editing?.id) {
      setError("This note is no longer available.");
      return;
    }
    const validationError = validateNoteDraft(editing);
    if (validationError) {
      setError(validationError);
      return;
    }
    const submitted = { id: editing.id, title: editing.title, content: editing.content, isPinned: editing.isPinned };
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch(`/notes/${encodeURIComponent(submitted.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: submitted.title, content: submitted.content, isPinned: submitted.isPinned }),
      });
      const result = await readResult(response, "Unable to save note.");
      const saved = normalizeNote(result.data);
      if (!saved || saved.id !== submitted.id) throw new Error("The notes service returned an invalid note.");
      setNotes((current) => mergeNote(current, saved));
      setEditing((current) => current?.id === submitted.id ? saved : current);
      setEditingOriginal((current) => current?.id === submitted.id ? saved : current);
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

  function renderNoteCard(note) {
    const parsedContent = parseNoteContent(note.content);
    return (
      <article key={note.id} className={`note-card group relative break-inside-avoid overflow-hidden rounded-xl border bg-gradient-to-br from-[#0b171e] to-[#071117] shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:shadow-black/25 ${note.isPinned ? "border-cyan-300/35 ring-1 ring-cyan-300/10" : "border-white/[0.1] hover:border-cyan-300/25"} ${layout === "list" ? "note-card-list mb-0" : "note-card-grid mb-4"}`}>
        <button type="button" onClick={() => openEditor(note)} className={`w-full px-4 pb-2 pt-4 text-left ${layout === "list" ? "pr-28" : ""}`} aria-label={`Edit ${note.title || "note"}`}>
          <h2 className="line-clamp-2 pr-20 text-base font-semibold leading-6 text-slate-100">{note.title || "Untitled note"}</h2>
          <div className={`notes-markdown mt-3 text-sm leading-6 text-slate-400 ${layout === "list" ? "line-clamp-2" : "line-clamp-6"}`} style={{ fontFamily: noteFontFamily(parsedContent.font) }}><Markdown remarkPlugins={[remarkGfm]} components={{ a: ({ children }) => <span className="text-cyan-300">{children}</span> }}>{parsedContent.content || "No additional content"}</Markdown></div>
        </button>
        <div className="note-card-actions absolute right-3 top-3 z-10 flex items-center gap-1">
          <button type="button" onClick={() => toggleNotePin(note)} disabled={busy} className={`note-card-action grid size-8 place-items-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-50 ${note.isPinned ? "bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/15" : "text-slate-500 hover:bg-cyan-400/10 hover:text-cyan-300"}`} aria-label={note.isPinned ? `Unpin ${note.title || "note"}` : `Pin ${note.title || "note"}`} aria-pressed={note.isPinned} title={note.isPinned ? "Unpin note" : "Pin note"}><Pin className={`size-4 ${note.isPinned ? "fill-current" : "-rotate-45"}`} /></button>
          <button type="button" onClick={() => setOpenNoteMenu((current) => current === note.id ? null : note.id)} className="note-card-action grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-slate-200" aria-label={`More actions for ${note.title || "note"}`} aria-expanded={openNoteMenu === note.id}><MoreHorizontal className="size-4" /></button>
          {openNoteMenu === note.id && (
            <div className="absolute right-0 top-full z-20 mt-2 min-w-32 rounded-lg border border-white/10 bg-[#081219] p-1 shadow-xl shadow-black/30">
              <button type="button" onClick={() => { setDeleteNote(note); setOpenNoteMenu(null); }} className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-xs text-red-300 hover:bg-red-500/10"><Trash2 className="size-3.5" /> Delete</button>
            </div>
          )}
        </div>
        <div className="flex min-h-11 items-center justify-end px-4 pb-3 pt-1">
          <span className="text-xs text-slate-500">{formatRelativeDate(note.updatedAt || note.updated_at)}</span>
        </div>
      </article>
    );
  }

  function renderNoteCollection(sectionNotes) {
    return (
      <div className={`notes-collection mt-3 w-full ${layout === "grid" ? "notes-layout-grid columns-1 gap-4 sm:columns-2 xl:columns-4" : "notes-layout-list space-y-3"}`}>
        {sectionNotes.map(renderNoteCard)}
      </div>
    );
  }

  return (
    <section className="notes-view">
      <div className="notes-composer mx-auto max-w-[1180px] overflow-hidden rounded-xl border border-white/10 bg-[#0a141b]/90 shadow-xl shadow-black/20 transition focus-within:border-cyan-300/30">
        <button type="button" onClick={() => setComposeOpen(true)} className="flex h-14 w-full items-center justify-between px-5 text-left text-sm text-slate-400 hover:bg-white/[0.025]">
          <span>Take a note...</span>
          <span className="grid size-9 place-items-center rounded-lg text-cyan-300"><Pencil className="size-[18px]" /></span>
        </button>
      </div>

      {error && <p role="alert" className="mx-auto mt-4 max-w-[1180px] rounded-lg border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}

      {!loadError && <div className="notes-controls mx-auto mt-9 flex w-full max-w-[1180px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes" className="h-11 w-full rounded-xl border border-white/10 bg-[#081219] pl-10 pr-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/35" />
          </div>
        </div>
        <div className="notes-view-options flex items-center gap-3">
          <div className="notes-layout-toggle flex rounded-xl border border-white/10 bg-[#081219] p-1" role="group" aria-label="Note layout">
              <button type="button" onClick={() => setLayout("grid")} aria-label="Grid view" aria-pressed={layout === "grid"} className={`grid size-9 place-items-center rounded-lg ${layout === "grid" ? "bg-cyan-400/10 text-cyan-300" : "text-slate-500 hover:text-slate-200"}`}><LayoutGrid className="size-[18px]" /></button>
              <button type="button" onClick={() => setLayout("list")} aria-label="List view" aria-pressed={layout === "list"} className={`grid size-9 place-items-center rounded-lg ${layout === "list" ? "bg-cyan-400/10 text-cyan-300" : "text-slate-500 hover:text-slate-200"}`}><List className="size-[18px]" /></button>
          </div>
          <div ref={sortMenuRef} className="relative min-w-44 flex-1 sm:flex-none">
            <button
              type="button"
              onClick={() => setSortOpen((open) => !open)}
              aria-haspopup="listbox"
              aria-expanded={sortOpen}
              className={`notes-sort-trigger flex h-11 w-full min-w-0 items-center justify-between gap-5 rounded-xl border bg-[#081219] px-4 text-sm text-slate-300 outline-none transition ${sortOpen ? "border-cyan-300/35" : "border-white/10 hover:border-white/20"}`}
            >
              <span className="min-w-0 truncate">{sortOptions.find((option) => option.value === sort)?.label}</span>
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
        <div className="mx-auto mt-7 w-full max-w-[1180px]">
          {pinnedNotes.length > 0 && (
            <section aria-labelledby="pinned-notes-heading">
              <h2 id="pinned-notes-heading" className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200/70">Pinned</h2>
              {renderNoteCollection(pinnedNotes)}
            </section>
          )}
          {unpinnedNotes.length > 0 && (
            <section className={pinnedNotes.length > 0 ? "mt-9" : ""} aria-labelledby={pinnedNotes.length > 0 ? "other-notes-heading" : undefined}>
              {pinnedNotes.length > 0 && <h2 id="other-notes-heading" className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Others</h2>}
              {renderNoteCollection(unpinnedNotes)}
            </section>
          )}
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

      {composeOpen && <NoteEditorModal note={draft} onChange={setDraft} onClose={() => { if (busy) return; setComposeOpen(false); setDraft(emptyDraft); }} onSubmit={createNote} busy={busy} creating />}

      {editing && <NoteEditorModal note={editing} onChange={setEditing} onClose={() => closeEditor()} onSubmit={saveNote} onDelete={() => closeEditor(editing)} busy={busy} />}

      {discardOpen && (
        <Modal title="Discard changes?" onClose={() => !busy && setDiscardOpen(false)}>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">You have unsaved changes. Discard them?</p>
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={() => setDiscardOpen(false)} disabled={busy} className="h-10 rounded-lg border border-white/10 px-4 text-sm text-slate-300">Keep editing</button>
            <button type="button" onClick={discardEditorChanges} disabled={busy} className="h-10 rounded-lg bg-red-500 px-4 text-sm font-semibold text-white">Discard changes</button>
          </div>
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
