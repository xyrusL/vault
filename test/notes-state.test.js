import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  NOTE_CONTENT_LIMIT,
  clampPage,
  compareNotes,
  mergeNote,
  normalizeNote,
  noteHasChanges,
  reconcileIds,
  toggleIds,
  validateNote,
} from "../src/dashboard/notesState.js";

test("normalizes valid notes and rejects malformed records", () => {
  assert.deepEqual(normalizeNote({ id: 7, title: null, content: 4 }), { id: "7", title: "", content: "", isPinned: false });
  assert.equal(normalizeNote({ id: 8, is_pinned: 1 }).isPinned, true);
  assert.equal(normalizeNote({ title: "missing id" }), null);
});

test("validates note requirements and limits", () => {
  assert.match(validateNote({}), /title or some content/i);
  assert.equal(validateNote({ title: "Title", content: "body" }), "");
  assert.match(validateNote({ title: "x".repeat(201), content: "body" }), /200/);
  assert.match(validateNote({ title: "Title", content: "x".repeat(NOTE_CONTENT_LIMIT + 1) }), /12,000/);
});

test("tracks drafts and merges notes by id", () => {
  const original = { id: "1", title: "A", content: "B" };
  assert.equal(noteHasChanges(original, { ...original }), false);
  assert.equal(noteHasChanges(original, { ...original, content: "C" }), true);
  assert.deepEqual(mergeNote([original, { id: "2", title: "B" }], { ...original, title: "Updated" }), [
    { id: "1", title: "Updated", content: "B", isPinned: false },
    { id: "2", title: "B" },
  ]);
});

test("pins notes before applying the selected sort", () => {
  const pinnedOld = { id: "old", isPinned: true, updatedAt: "2020-01-01", title: "Z" };
  const unpinnedNew = { id: "new", isPinned: false, updatedAt: "2030-01-01", title: "A" };
  assert.ok(compareNotes(pinnedOld, unpinnedNew, "updated") < 0);
  assert.ok(compareNotes(pinnedOld, unpinnedNew, "title") < 0);
});

test("reconciles and toggles visible selections", () => {
  assert.deepEqual(reconcileIds(["a", "missing"], [{ id: "a" }]), ["a"]);
  assert.deepEqual(toggleIds([], ["a", "b"]), ["a", "b"]);
  assert.deepEqual(toggleIds(["a", "b", "c"], ["a", "b"]), ["c"]);
});

test("clamps pages after data changes", () => {
  assert.equal(clampPage(4, 2), 2);
  assert.equal(clampPage(0, 0), 1);
});

test("notes editor uses custom safe link and heading interactions", async () => {
  const source = await readFile(new URL("../src/dashboard/NotesView.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /window\.prompt/);
  assert.match(source, /normalizeLinkUrl/);
  assert.match(source, /\["http:", "https:"\]/);
  assert.match(source, /linkDialogOpen/);
  assert.match(source, /<Modal title="Add a link"/);
  assert.match(source, /role=\{linkError \? "alert"/);
  assert.match(source, /restoreSelection\(\)/);
  assert.match(source, /createLink/);
  for (const level of ["h1", "h2", "h3", "h4"]) assert.match(source, new RegExp(`level: "${level}"`));
  assert.match(source, /if \(!range \|\| range\.collapsed\) return/);
  assert.match(source, /const nextBlock = block\.tagName\.toLowerCase\(\) === level \? "p" : level/);
  assert.match(source, /Previous formatting tools/);
  assert.match(source, /Next formatting tools/);
});

test("notes editor preserves checklist state and responsive affordances", async () => {
  const source = await readFile(new URL("../src/dashboard/NotesView.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/index.css", import.meta.url), "utf8");
  const mobileCss = await readFile(new URL("../src/dashboard/mobile/mobile.css", import.meta.url), "utf8");
  assert.match(source, /checkbox\?\.checked \? "x"/);
  assert.match(source, /checkbox\.checked \? "Mark task incomplete" : "Mark task complete"/);
  assert.match(source, /enableEditorChecklists/);
  assert.match(css, /note-checklist-item/);
  assert.match(css, /note-editor-tool\.is-active/);
  assert.match(mobileCss, /note-link-modal/);
});

