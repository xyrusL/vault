import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const view = await readFile(new URL("../src/dashboard/ChatAiView.jsx", import.meta.url), "utf8");
const tools = await readFile(new URL("../src/dashboard/chatAiTools.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/index.css", import.meta.url), "utf8");

test("AI code renders inline with language and copy feedback", () => {
  assert.match(view, /function ChatCodeBlock/);
  assert.match(view, /language-\(\[\^\\s\]\+\)/);
  assert.match(view, /navigator\.clipboard\.writeText\(code\)/);
  assert.match(view, /components=\{chatMarkdownComponents\}/);
  assert.match(view, /message\.content\.includes\("```"\)/);
  assert.match(view, /Preview generated HTML/);
  assert.match(view, /sandbox="allow-scripts"/);
  assert.match(styles, /\.chat-ai-code-header/);
  assert.match(styles, /\.chat-ai-code-block pre/);
});

test("Markdown formatting renders in user and AI messages", () => {
  assert.match(view, /chat-ai-markdown-user/);
  assert.match(view, /<Markdown components=\{chatMarkdownComponents\} remarkPlugins=\{chatMarkdownPlugins\}>\{message\.content\}<\/Markdown>/);
  assert.doesNotMatch(view, /<p className="whitespace-pre-wrap break-words text-sm leading-relaxed">\{message\.content\}<\/p>/);
  assert.match(styles, /\.chat-ai-markdown-user strong/);
});

test("GitHub Markdown tables render as responsive tables", () => {
  assert.match(view, /import remarkGfm from "remark-gfm"/);
  assert.match(view, /function ChatTable/);
  assert.match(view, /table: ChatTable/);
  assert.match(styles, /\.chat-ai-table-wrap table/);
  assert.match(styles, /overflow-x: auto/);
});

test("AI can generate unrestricted original templates directly in chat", () => {
  assert.match(tools, /work directly in chat without asking the user to open a modal/);
  assert.match(tools, /design an original style and generate complete, runnable code/);
  assert.match(tools, /fenced Markdown blocks with an accurate language tag/);
  assert.match(tools, /do not artificially restrict creative or technical choices/);
  assert.match(tools, /code blocks already provide Copy and HTML Preview controls/);
});

test("Chat accepts uploaded and dropped source files without a modal", () => {
  assert.match(view, /function readChatAttachments/);
  assert.match(view, /handleComposerDrop/);
  assert.match(view, /Drop text or code files here/);
  assert.match(view, /attachmentInputRef\.current\?\.click\(\)/);
  assert.match(view, /providerMessageWithAttachments/);
  assert.match(view, /user attached these files/);
});
