import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Eye,
  Inbox,
  Mail,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { apiFetch } from "../api";
import { Modal, SelectField } from "./DashboardUi";
import { clampPage, reconcileIds, toggleIds } from "./notesState";

let emailGeneratorCache = null;

function SelectionCheckbox({ checked, onChange, label }) {
  return (
    <label className="group relative grid size-5 cursor-pointer place-items-center rounded-md outline-none focus-within:ring-2 focus-within:ring-cyan-300/35 focus-within:ring-offset-2 focus-within:ring-offset-[#071219]" aria-label={label}>
      <input type="checkbox" checked={checked} onChange={onChange} className="peer sr-only" />
      <span className="absolute inset-0 rounded-md border border-slate-600/70 bg-[#071219] transition group-hover:border-cyan-300/50 group-hover:bg-cyan-300/[0.04] peer-checked:border-cyan-300 peer-checked:bg-cyan-300 peer-checked:shadow-[0_0_0_3px_rgba(34,211,238,0.08)]" />
      <Check className="relative size-3.5 scale-75 text-[#001217] opacity-0 transition peer-checked:scale-100 peer-checked:opacity-100" strokeWidth={3} />
    </label>
  );
}

function errorMessage(result, fallback) {
  if (typeof result?.error === "string") return result.error;
  return result?.error?.message || fallback;
}

function formatDate(value) {
  if (!value) return "Never";
  const date = new Date(`${value}${value.endsWith("Z") ? "" : "Z"}`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(`${value}${value.endsWith("Z") ? "" : "Z"}`);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function EmailGeneratorView({ onAddressesChange }) {
  const [domains, setDomains] = useState(() => emailGeneratorCache?.domains || []);
  const [addresses, setAddresses] = useState(() => emailGeneratorCache?.addresses || []);
  const [selectedAddressId, setSelectedAddressId] = useState(() => emailGeneratorCache?.selectedAddressId || "");
  const [messages, setMessages] = useState(() => emailGeneratorCache?.messages || []);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [inboxAddressId, setInboxAddressId] = useState("");
  const [inboxSearch, setInboxSearch] = useState("");
  const [inboxFilter, setInboxFilter] = useState("all");
  const [inboxPage, setInboxPage] = useState(1);
  const [selectedInboxMessageIds, setSelectedInboxMessageIds] = useState([]);
  const [domainId, setDomainId] = useState(() => emailGeneratorCache?.domainId || "");
  const [prefix, setPrefix] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("addresses");
  const [loading, setLoading] = useState(!emailGeneratorCache);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [addressesToDelete, setAddressesToDelete] = useState([]);
  const [selectedAddressIds, setSelectedAddressIds] = useState([]);
  const [deletingAddress, setDeletingAddress] = useState(false);
  const [messagesToDelete, setMessagesToDelete] = useState([]);
  const [deletingMessage, setDeletingMessage] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState("vault");
  const [forwardingDestinations, setForwardingDestinations] = useState([]);
  const [forwardDestinationId, setForwardDestinationId] = useState("");
  const [forwardingAvailable, setForwardingAvailable] = useState(false);
  const [forwardingEmail, setForwardingEmail] = useState("");
  const [forwardingVerificationNotice, setForwardingVerificationNotice] = useState("");
  const [forwardingVerificationSubmitting, setForwardingVerificationSubmitting] = useState(false);
  const [addressDetails, setAddressDetails] = useState(null);
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [detailsFeedback, setDetailsFeedback] = useState(null);
  const [addressPage, setAddressPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const rowsPerPage = 10;
  const inboxRowsPerPage = 6;

  const messageTotal = addresses.reduce((sum, item) => sum + item.messageCount, 0);
  const unreadTotal = addresses.reduce((sum, item) => sum + item.unreadCount, 0);
  const domainOptions = domains.map((domain) => ({
    value: domain.id,
    label: domain.hostname,
  }));
  const forwardingOptions = forwardingDestinations.map((destination) => ({
    value: destination.id,
    label: destination.address,
  }));
  const inboxAddress = addresses.find((address) => address.id === inboxAddressId) || null;
  const inboxAddressMessages = useMemo(() => {
    if (!inboxAddressId) return [];
    return messages.filter((message) => message.addressId === inboxAddressId);
  }, [messages, inboxAddressId]);
  const inboxMessages = useMemo(() => {
    const query = inboxSearch.trim().toLowerCase();
    return inboxAddressMessages.filter((message) => {
      if (inboxFilter === "unread" && message.readAt) return false;
      if (inboxFilter === "read" && !message.readAt) return false;
      return !query || [message.sender, message.subject, message.recipient]
        .some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [inboxAddressMessages, inboxFilter, inboxSearch]);
  const inboxPageCount = Math.max(1, Math.ceil(inboxMessages.length / inboxRowsPerPage));
  const pagedInboxMessages = inboxMessages.slice(
    (inboxPage - 1) * inboxRowsPerPage,
    inboxPage * inboxRowsPerPage,
  );
  const filteredAddresses = useMemo(() => {
    const query = search.trim().toLowerCase();
    return addresses.filter((address) =>
      !query || address.fullAddress.toLowerCase().includes(query),
    );
  }, [addresses, search]);
  const addressPageCount = Math.max(1, Math.ceil(filteredAddresses.length / rowsPerPage));
  const historyPageCount = Math.max(1, Math.ceil(messages.length / rowsPerPage));
  const pagedAddresses = filteredAddresses.slice((addressPage - 1) * rowsPerPage, addressPage * rowsPerPage);
  const pagedMessages = messages.slice((historyPage - 1) * rowsPerPage, historyPage * rowsPerPage);

  useEffect(() => {
    setAddressPage(1);
  }, [search]);

  useEffect(() => {
    if (addressPage !== clampPage(addressPage, addressPageCount)) setAddressPage(clampPage(addressPage, addressPageCount));
  }, [addressPage, addressPageCount]);

  useEffect(() => {
    if (historyPage > historyPageCount) setHistoryPage(historyPageCount);
  }, [historyPage, historyPageCount]);

  useEffect(() => {
    setInboxPage(1);
  }, [inboxAddressId, inboxFilter, inboxSearch]);

  useEffect(() => {
    if (inboxPage !== clampPage(inboxPage, inboxPageCount)) setInboxPage(clampPage(inboxPage, inboxPageCount));
  }, [inboxPage, inboxPageCount]);

  useEffect(() => {
    setSelectedAddressIds((current) => reconcileIds(current, addresses));
    setSelectedInboxMessageIds((current) => reconcileIds(current, messages));
  }, [addresses, messages]);

  async function loadAddresses(preferredId = selectedAddressId) {
    const response = await apiFetch("/email/addresses");
    const result = await response.json();
    if (!response.ok) throw new Error(errorMessage(result, "Unable to load email addresses."));
    const next = result.data || [];
    setAddresses(next);
    const retained = next.some((item) => item.id === preferredId) ? preferredId : next[0]?.id || "";
    setSelectedAddressId(retained);
    return retained;
  }

  async function loadMessages() {
    setMessagesLoading(true);
    try {
      const response = await apiFetch("/email/messages");
      const result = await response.json();
      if (!response.ok) throw new Error(errorMessage(result, "Unable to load message history."));
      setMessages(result.data || []);
      setSelectedMessage((current) =>
        current && result.data?.some((item) => item.id === current.id) ? current : null,
      );
    } finally {
      setMessagesLoading(false);
    }
  }

  async function loadForwardingDestinations() {
    try {
      const response = await apiFetch("/email/forwarding-destinations");
      const result = await response.json();
      if (!response.ok) throw new Error(errorMessage(result, "Unable to load forwarding destinations."));
      const next = result.data || [];
      setForwardingDestinations(next);
      setForwardingAvailable(Boolean(result.available));
      setForwardDestinationId((current) => next.some((item) => item.id === current) ? current : next[0]?.id || "");
      return next;
    } catch {
      setForwardingDestinations([]);
      setForwardingAvailable(false);
      return [];
    }
  }

  async function addForwardingDestination() {
    setForwardingVerificationSubmitting(true);
    setForwardingVerificationNotice("");
    setError("");
    try {
      const response = await apiFetch("/email/forwarding-destinations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: forwardingEmail }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(errorMessage(result, "Unable to add forwarding destination."));
      setForwardingEmail("");
      if (result.verificationRequired) {
        setForwardingVerificationNotice(`Cloudflare sent a verification email to ${result.data.address}. Open it, approve the address, then refresh destinations.`);
      } else {
        setForwardingVerificationNotice(`${result.data.address} is verified and ready for forwarding.`);
      }
      await loadForwardingDestinations();
    } catch (destinationError) {
      setError(destinationError.message);
    } finally {
      setForwardingVerificationSubmitting(false);
    }
  }

  async function openAddressDetails(address) {
    setError("");
    setDetailsFeedback(null);
    try {
      const [response] = await Promise.all([
        apiFetch(`/email/addresses/${address.id}`),
        loadForwardingDestinations(),
      ]);
      const result = await response.json();
      if (!response.ok) throw new Error(errorMessage(result, "Unable to load address details."));
      setAddressDetails(result.data);
      setForwardDestinationId(result.data.forwardDestinationId || "");
    } catch (detailsError) {
      setError(detailsError.message);
    }
  }

  async function saveAddressDetails() {
    if (!addressDetails) return;
    const destination = forwardingDestinations.find((item) => item.id === forwardDestinationId);
    setDetailsSaving(true);
    setDetailsFeedback(null);
    setError("");
    try {
      const response = await apiFetch(`/email/addresses/${addressDetails.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deliveryMode: addressDetails.deliveryMode,
          forwardDestinationId: addressDetails.deliveryMode === "forward" ? destination?.id : null,
          forwardTo: addressDetails.deliveryMode === "forward" ? destination?.address : null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(errorMessage(result, "Unable to save address settings."));
      setAddresses((current) => current.map((item) => item.id === result.data.id ? result.data : item));
      setAddressDetails(result.data);
      setDetailsFeedback({
        type: "success",
        message: result.data.deliveryMode === "forward"
          ? `Saved. Future email will be forwarded to ${result.data.forwardTo}.`
          : "Saved. Future email will be stored in Vault.",
      });
    } catch (saveError) {
      setDetailsFeedback({ type: "error", message: saveError.message });
    } finally {
      setDetailsSaving(false);
    }
  }

  function formatBytes(value) {
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }

  async function refreshAll() {
    setError("");
    setLoading(true);
    try {
      const domainResponse = await apiFetch("/email/domains");
      const domainResult = await domainResponse.json();
      if (!domainResponse.ok) throw new Error(errorMessage(domainResult, "Unable to load available domains."));
      const available = domainResult.data || [];
      setDomains(available);
      setDomainId((current) => available.some((item) => item.id === current) ? current : available[0]?.id || "");
      await loadAddresses();
      await loadMessages();
    } catch (refreshError) {
      setError(refreshError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    emailGeneratorCache = {
      domains,
      addresses,
      messages,
      domainId,
      selectedAddressId,
    };
  }, [domains, addresses, messages, domainId, selectedAddressId]);

  useEffect(() => {
    onAddressesChange?.(addresses);
  }, [addresses, onAddressesChange]);

  useEffect(() => {
    if (!notice && !error) return undefined;
    const timeout = window.setTimeout(() => {
      setNotice("");
      setError("");
    }, 2000);
    return () => window.clearTimeout(timeout);
  }, [notice, error]);

  useEffect(() => {
    if (!generatorOpen) return undefined;

    function closeModal(event) {
      if (event.key === "Escape") setGeneratorOpen(false);
    }

    document.addEventListener("keydown", closeModal);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeModal);
      document.body.style.overflow = "";
    };
  }, [generatorOpen]);

  function generateRandomPrefix() {
    const adjectives = ["bright", "calm", "clear", "silver", "swift", "quiet"];
    const nouns = ["cloud", "harbor", "meadow", "orbit", "river", "signal"];
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const number = Math.floor(10 + Math.random() * 90);
    setPrefix(`${adjective}-${noun}-${number}`);
  }

  async function generateAddresses(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSubmitting(true);
    try {
      const response = await apiFetch("/email/addresses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "custom",
          domainId,
          count: 1,
          prefix,
          deliveryMode,
          forwardDestinationId: deliveryMode === "forward" ? forwardDestinationId : null,
          forwardTo: deliveryMode === "forward"
            ? forwardingDestinations.find((item) => item.id === forwardDestinationId)?.address
            : null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(errorMessage(result, "Unable to generate email address."));
      const created = result.data || [];
      const selected = created[0]?.id || selectedAddressId;
      setPrefix("");
      setNotice(`${created.length} email address${created.length === 1 ? "" : "es"} created and ready to receive mail.`);
      await loadAddresses(selected);
      await loadMessages();
      setActiveTab("addresses");
      setGeneratorOpen(false);
    } catch (generateError) {
      setError(generateError.message);
    } finally {
      setSubmitting(false);
    }
  }

  function selectAddress(addressId) {
    setSelectedAddressId(addressId);
    setInboxAddressId(addressId);
    setInboxSearch("");
    setInboxFilter("all");
    setInboxPage(1);
    setSelectedInboxMessageIds([]);
    setSelectedMessage(null);
    loadMessages().catch((loadError) => setError(loadError.message));
  }

  function closeInbox() {
    setInboxAddressId("");
    setInboxSearch("");
    setSelectedInboxMessageIds([]);
    setSelectedMessage(null);
  }

  async function refreshInbox() {
    setError("");
    try {
      await Promise.all([loadAddresses(inboxAddressId), loadMessages()]);
      setNotice("Inbox refreshed.");
    } catch (refreshError) {
      setError(refreshError.message);
    }
  }

  async function openMessage(messageId) {
    setError("");
    try {
      const detailResponse = await apiFetch(`/email/messages/${messageId}`);
      const detailResult = await detailResponse.json();
      if (!detailResponse.ok) throw new Error(errorMessage(detailResult, "Unable to open message."));
      setSelectedMessage(detailResult.data);
      if (!detailResult.data.readAt) {
        await apiFetch(`/email/messages/${messageId}/read`, { method: "POST" });
        setMessages((current) => current.map((item) =>
          item.id === messageId ? { ...item, readAt: new Date().toISOString() } : item,
        ));
        setAddresses((current) => current.map((item) =>
          item.id === detailResult.data.addressId
            ? { ...item, unreadCount: Math.max(0, item.unreadCount - 1) }
            : item,
        ));
      }
    } catch (openError) {
      setError(openError.message);
    }
  }

  async function deleteAddresses() {
    if (!addressesToDelete.length) return;

    setError("");
    setNotice("");
    setDeletingAddress(true);
    try {
      const singleAddress = addressesToDelete.length === 1 ? addressesToDelete[0] : null;
      const response = await apiFetch(
        singleAddress ? `/email/addresses/${singleAddress.id}` : "/email/addresses",
        singleAddress
          ? { method: "DELETE" }
          : {
              method: "DELETE",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ ids: addressesToDelete.map((address) => address.id) }),
            },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(errorMessage(result, "Unable to delete selected email addresses."));
      const results = singleAddress ? [result.data?.id] : result.data?.ids || [];
      const deletedIds = new Set(results.filter(Boolean));
      const remaining = addresses.filter((item) => !deletedIds.has(item.id));
      const nextSelectedId = deletedIds.has(selectedAddressId) ? remaining[0]?.id || "" : selectedAddressId;
      setAddresses(remaining);
      setSelectedAddressId(nextSelectedId);
      setSelectedAddressIds((current) => current.filter((id) => !deletedIds.has(id)));
      if (deletedIds.has(selectedAddressId)) setSelectedMessage(null);
      await loadMessages();
      setNotice(`${results.length} email address${results.length === 1 ? "" : "es"} deleted.`);
      setAddressesToDelete([]);
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setDeletingAddress(false);
    }
  }

  async function deleteMessages() {
    if (!messagesToDelete.length) return;

    setError("");
    setNotice("");
    setDeletingMessage(true);
    try {
      const singleMessage = messagesToDelete.length === 1 ? messagesToDelete[0] : null;
      const response = await apiFetch(
        singleMessage ? `/email/messages/${singleMessage.id}` : "/email/messages",
        singleMessage
          ? { method: "DELETE" }
          : {
              method: "DELETE",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ ids: messagesToDelete.map((message) => message.id) }),
            },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(errorMessage(result, "Unable to delete selected messages."));
      const deletedIds = new Set(result.data?.ids || []);
      setMessages((current) => current.filter((message) => !deletedIds.has(message.id)));
      setSelectedInboxMessageIds((current) => current.filter((id) => !deletedIds.has(id)));
      if (selectedMessage && deletedIds.has(selectedMessage.id)) setSelectedMessage(null);
      await Promise.all([loadAddresses(inboxAddressId || selectedAddressId), loadMessages()]);
      setMessagesToDelete([]);
      setNotice(`${deletedIds.size} message${deletedIds.size === 1 ? "" : "s"} deleted; ${formatBytes(result.data?.bytesReclaimed || 0)} reclaimed.`);
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setDeletingMessage(false);
    }
  }

  function toggleAddressSelection(addressId) {
    setSelectedAddressIds((current) => toggleIds(current, [addressId]));
  }

  function toggleInboxMessageSelection(messageId) {
    setSelectedInboxMessageIds((current) => toggleIds(current, [messageId]));
  }

  function toggleInboxPageSelection() {
    const pageIds = pagedInboxMessages.map((message) => message.id);
    setSelectedInboxMessageIds((current) => toggleIds(current, pageIds));
  }

  function togglePageSelection() {
    const pageIds = pagedAddresses.map((address) => address.id);
    setSelectedAddressIds((current) => toggleIds(current, pageIds));
  }

  async function copyAddress(address) {
    try {
      await navigator.clipboard.writeText(address.fullAddress);
      setCopiedId(address.id);
      window.setTimeout(() => setCopiedId(""), 1500);
    } catch {
      setError("Clipboard access is unavailable. Copy the address manually.");
    }
  }

  if (inboxAddress) {
    return (
      <div className="email-inbox-page flex min-h-0 flex-col pb-4">
        <div className="email-inbox-header shrink-0 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-cyan-300">Email generator</p>
            <button type="button" onClick={closeInbox} className="mt-2 flex items-center gap-2 text-2xl font-semibold text-white transition hover:text-cyan-200">
              <ArrowLeft className="size-5" /> Inbox
            </button>
            <div className="email-inbox-address mt-2 flex min-w-0 flex-wrap items-center gap-2 text-sm text-slate-400">
              <span className="truncate">{inboxAddress.fullAddress}</span>
              <button type="button" onClick={() => copyAddress(inboxAddress)} className="grid size-7 place-items-center rounded-md text-slate-500 transition hover:bg-white/5 hover:text-cyan-300" aria-label={`Copy ${inboxAddress.fullAddress}`}>
                {copiedId === inboxAddress.id ? <Check className="size-4" /> : <Copy className="size-4" />}
              </button>
              <span className={`rounded-full px-2 py-1 text-[0.65rem] ${inboxAddress.deliveryMode === "forward" ? "bg-sky-300/10 text-sky-200" : "bg-cyan-300/10 text-cyan-200"}`}>
                {inboxAddress.deliveryMode === "forward" ? `Forwarding to ${inboxAddress.forwardTo}` : "Saved in Vault"}
              </span>
            </div>
          </div>
          <button type="button" onClick={() => openAddressDetails(inboxAddress)} className="email-inbox-settings flex min-h-10 items-center justify-center gap-2 rounded-lg border border-cyan-100/10 px-3 text-xs text-slate-300 transition hover:border-cyan-300/25 hover:bg-cyan-300/[0.04]">
            <Settings2 className="size-4" /> Address settings
          </button>
        </div>

        {(error || notice) && (
          <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${error ? "border-red-400/20 bg-red-400/[0.06] text-red-300" : "border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-200"}`} role={error ? "alert" : "status"}>{error || notice}</div>
        )}

        <section className="email-inbox-workspace mt-4 flex min-h-0 flex-1 overflow-hidden rounded-xl border border-cyan-100/10 bg-gradient-to-br from-[#07151c]/85 to-[#040c12]/95 lg:grid lg:grid-cols-[400px_minmax(0,1fr)]">
          <aside className={`${selectedMessage ? "hidden lg:flex" : "flex"} min-h-0 flex-col border-cyan-100/10 lg:border-r`}>
            <div className="email-inbox-toolbar flex shrink-0 items-center gap-2 border-b border-cyan-100/10 p-3">
              <SelectionCheckbox checked={pagedInboxMessages.length > 0 && pagedInboxMessages.every((message) => selectedInboxMessageIds.includes(message.id))} onChange={toggleInboxPageSelection} label="Select all messages on this page" />
              <button type="button" onClick={refreshInbox} disabled={messagesLoading} className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 text-slate-400 transition hover:border-cyan-300/25 hover:text-cyan-300 disabled:opacity-50" aria-label="Refresh inbox"><RefreshCw className={`size-4 ${messagesLoading ? "animate-spin" : ""}`} /></button>
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-cyan-100/10 bg-[#030c11] px-3 text-slate-500 transition focus-within:border-cyan-300/45"><Search className="size-4" /><input value={inboxSearch} onChange={(event) => setInboxSearch(event.target.value)} className="min-h-9 min-w-0 flex-1 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600" placeholder="Search..." aria-label="Search inbox messages" /></label>
              <SelectField name="inboxFilter" value={inboxFilter} onChange={(event) => setInboxFilter(event.target.value)} options={[{ value: "all", label: "All" }, { value: "unread", label: "Unread" }, { value: "read", label: "Read" }]} ariaLabel="Filter inbox" className="min-h-9 w-24 text-xs" />
            </div>
            {selectedInboxMessageIds.length > 0 && (
              <div className="flex items-center justify-between border-b border-cyan-100/10 px-3 py-2">
                <span className="text-[0.7rem] text-slate-500">{selectedInboxMessageIds.length} selected</span>
                <button type="button" onClick={() => setMessagesToDelete(messages.filter((message) => selectedInboxMessageIds.includes(message.id)))} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[0.7rem] text-rose-300 transition hover:bg-rose-400/[0.07]"><Trash2 className="size-3.5" /> Delete</button>
              </div>
            )}
            <div className="email-inbox-list min-h-0 flex-1 overflow-y-auto">
              {messagesLoading ? <p className="p-5 text-xs text-slate-500">Loading inbox...</p> : !inboxMessages.length ? (
                <div className="grid min-h-52 place-items-center p-6 text-center"><div><Inbox className="mx-auto size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-300">{inboxSearch ? "No messages match your search" : "No messages received yet"}</p><p className="mt-1 text-xs text-slate-600">{inboxSearch ? "Try a different sender or subject." : "New messages will appear here."}</p></div></div>
              ) : pagedInboxMessages.map((message) => {
                const active = selectedMessage?.id === message.id;
                return (
                  <div key={message.id} className={`email-inbox-message relative flex items-start gap-3 border-b border-cyan-100/[0.07] px-4 py-3 transition before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-cyan-300 ${active ? "bg-cyan-300/[0.08] before:opacity-100" : "hover:bg-cyan-300/[0.025] before:opacity-0"}`}>
                    <SelectionCheckbox checked={selectedInboxMessageIds.includes(message.id)} onChange={() => toggleInboxMessageSelection(message.id)} label={`Select ${message.subject || "message"}`} />
                    <button type="button" onClick={() => openMessage(message.id)} className="min-w-0 flex-1 text-left">
                      <span className="flex items-center justify-between gap-3"><span className={`truncate text-xs ${message.readAt ? "text-slate-300" : "font-semibold text-white"}`}>{message.sender}</span><span className="shrink-0 text-[0.65rem] text-slate-500">{formatTime(message.receivedAt)}</span></span>
                      <span className={`mt-1 block truncate text-sm ${message.readAt ? "text-slate-300" : "font-semibold text-white"}`}>{message.subject || "(No subject)"}</span>
                      <span className="mt-1 flex min-h-5 items-center justify-end gap-2 text-[0.68rem] text-slate-600">{!message.readAt && <><i className="size-1.5 rounded-full bg-cyan-300" /><span className="rounded-full bg-cyan-300/10 px-2 py-0.5 text-cyan-200">Unread</span></>}</span>
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex shrink-0 items-center justify-between border-t border-cyan-100/10 px-4 py-3 text-xs text-slate-400">
              <span>{inboxMessages.length ? `${(inboxPage - 1) * inboxRowsPerPage + 1}-${Math.min(inboxPage * inboxRowsPerPage, inboxMessages.length)} of ${inboxMessages.length}` : "0 messages"}</span>
              <div className="flex items-center gap-2"><button type="button" onClick={() => setInboxPage((page) => Math.max(1, page - 1))} disabled={inboxPage === 1} className="pagination-button" aria-label="Previous inbox page"><ChevronRight className="rotate-180" /></button><span className="grid size-9 place-items-center rounded-lg border border-cyan-300/40 bg-cyan-300/10 text-cyan-200">{inboxPage}</span><button type="button" onClick={() => setInboxPage((page) => Math.min(inboxPageCount, page + 1))} disabled={inboxPage === inboxPageCount} className="pagination-button" aria-label="Next inbox page"><ChevronRight /></button></div>
            </div>
          </aside>

          <div className={`${selectedMessage ? "block" : "hidden lg:block"} min-h-0 min-w-0 overflow-y-auto`}>
            {selectedMessage ? (
              <article className="email-inbox-reader min-h-full p-5 sm:p-6">
                <button type="button" onClick={() => setSelectedMessage(null)} className="mb-4 flex items-center gap-2 text-xs text-slate-400 transition hover:text-cyan-300 lg:hidden"><ArrowLeft className="size-4" /> Messages</button>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 flex-wrap items-center gap-3"><h2 className="break-words text-xl font-semibold text-white">{selectedMessage.subject || "(No subject)"}</h2>{!selectedMessage.readAt && <span className="rounded-full bg-cyan-300/10 px-2.5 py-1 text-xs text-cyan-200">Unread</span>}</div>
                </div>
                <div className="email-inbox-reader-sender mt-6 flex items-center gap-4 border-b border-cyan-100/10 pb-6">
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-cyan-300/10 text-lg font-semibold text-cyan-300">{selectedMessage.sender?.[0]?.toUpperCase() || "M"}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-100">{selectedMessage.sender}</p><p className="mt-1 truncate text-xs text-slate-400">To: {selectedMessage.recipient}</p><p className="mt-2 text-xs text-slate-400">{formatDate(selectedMessage.receivedAt)}</p></div>
                  <button type="button" onClick={() => setMessagesToDelete([selectedMessage])} className="grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-rose-400/[0.07] hover:text-rose-300" aria-label="Delete message"><Trash2 className="size-4" /></button>
                </div>
                <div className="mt-7 whitespace-pre-wrap break-words text-sm leading-7 text-slate-300">{selectedMessage.textBody || "This message has no plain-text content."}</div>
              </article>
            ) : (
              <div className="grid min-h-full place-items-center p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-full border border-cyan-300/15 bg-cyan-300/[0.05] text-cyan-300"><Inbox className="size-5" /></span><p className="mt-4 text-sm font-medium text-slate-300">Select a message to read it</p><p className="mt-1 text-xs text-slate-600">Message content opens here.</p></div></div>
            )}
          </div>
        </section>

        {messagesToDelete.length > 0 && (
          <Modal title={`Delete ${messagesToDelete.length} message${messagesToDelete.length === 1 ? "" : "s"}?`} onClose={() => !deletingMessage && setMessagesToDelete([])}>
            <div className="mt-4 max-h-32 overflow-y-auto rounded-lg border border-rose-400/15 bg-rose-400/[0.05] p-3">
              {messagesToDelete.map((message) => <p key={message.id} className="truncate py-1 text-xs text-slate-300">{message.subject || "(No subject)"}</p>)}
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">The selected messages will be permanently deleted from Vault and their recorded storage will be reclaimed.</p>
            <div className="mt-6 flex justify-end gap-3"><button type="button" disabled={deletingMessage} onClick={() => setMessagesToDelete([])} className="h-10 rounded-lg border border-white/10 px-4 text-sm text-slate-300 disabled:opacity-50">Cancel</button><button type="button" disabled={deletingMessage} onClick={deleteMessages} className="flex h-10 items-center gap-2 rounded-lg bg-rose-500 px-4 text-sm font-semibold text-white disabled:opacity-50"><Trash2 className="size-4" />{deletingMessage ? "Deleting..." : "Delete"}</button></div>
          </Modal>
        )}

        {addressDetails && (
          <Modal title="Email address details" onClose={() => !detailsSaving && setAddressDetails(null)} className="email-address-details-modal">
            <div className="mt-4 rounded-xl border border-cyan-100/10 bg-[#071219] p-4"><p className="break-all text-sm font-semibold text-white">{addressDetails.fullAddress}</p><div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><p className="text-slate-500">Created</p><p className="mt-1 text-slate-300">{formatDate(addressDetails.createdAt)}</p></div><div><p className="text-slate-500">Storage used</p><p className="mt-1 text-slate-300">{formatBytes(addressDetails.storageBytes || 0)}</p></div></div></div>
            <div className="mt-4"><p className="text-xs font-medium text-slate-300">Delivery</p><div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-[#071219] p-1 text-xs"><button type="button" onClick={() => { setAddressDetails((current) => ({ ...current, deliveryMode: "vault" })); setDetailsFeedback(null); }} className={`rounded-md px-3 py-2 ${addressDetails.deliveryMode === "vault" ? "bg-cyan-300/15 text-cyan-200" : "text-slate-400"}`}>Save in Vault</button><button type="button" onClick={() => { setAddressDetails((current) => ({ ...current, deliveryMode: "forward" })); setDetailsFeedback(null); }} disabled={!forwardingAvailable || !forwardingDestinations.length} className={`rounded-md px-3 py-2 disabled:opacity-40 ${addressDetails.deliveryMode === "forward" ? "bg-cyan-300/15 text-cyan-200" : "text-slate-400"}`}>Forward real email</button></div>{addressDetails.deliveryMode === "forward" ? <><SelectField name="forwardDestinationId" value={forwardDestinationId} onChange={(event) => { setForwardDestinationId(event.target.value); setDetailsFeedback(null); }} options={forwardingOptions} ariaLabel="Forward to" className="mt-3 min-h-10 text-xs" /><p className="mt-2 text-[0.68rem] leading-5 text-slate-500">New mail is forwarded by the Vault Worker and is not stored. Earlier Vault messages remain available.</p></> : <p className="mt-3 text-xs text-slate-500">New mail will be stored in this Vault inbox.</p>}</div>
            {detailsFeedback && <div className={`mt-4 rounded-lg border px-3 py-2.5 text-xs ${detailsFeedback.type === "success" ? "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-200" : "border-red-400/20 bg-red-400/[0.06] text-red-300"}`} role={detailsFeedback.type === "error" ? "alert" : "status"}>{detailsFeedback.message}</div>}
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setAddressDetails(null)} className="h-10 rounded-lg border border-white/10 px-4 text-xs text-slate-300">Close</button><button type="button" onClick={saveAddressDetails} disabled={detailsSaving || (addressDetails.deliveryMode === "forward" && !forwardDestinationId)} className="flex h-10 items-center gap-2 rounded-lg bg-cyan-400 px-4 text-xs font-semibold text-[#001217] disabled:opacity-50">{detailsSaving ? "Saving..." : detailsFeedback?.type === "success" ? <><Check className="size-4" />Saved</> : "Save changes"}</button></div>
          </Modal>
        )}
      </div>
    );
  }

  return (
    <div className="email-generator-page">
      <div className="email-generator-summary flex flex-wrap justify-end gap-2.5">
        <div className="email-summary-metric flex min-w-[150px] items-center justify-between gap-3 rounded-lg border border-cyan-100/10 bg-gradient-to-br from-[#0e222b]/40 to-[#040d12]/70 px-3 py-1.5 shadow-[inset_0_1px_rgba(255,255,255,0.015)]">
          <div>
            <p className="text-[0.68rem] text-slate-400">Total generated</p>
            <p className="text-base font-semibold leading-5">{addresses.length}</p>
          </div>
          <span className="grid size-8 place-items-center rounded-lg bg-cyan-400/10 text-cyan-300"><Mail className="size-4" /></span>
        </div>
        <div className="email-summary-metric email-summary-mobile hidden min-w-[150px] items-center justify-between gap-3 rounded-lg border border-cyan-100/10 bg-gradient-to-br from-[#0e222b]/40 to-[#040d12]/70 px-3 py-1.5 md:flex">
          <div><p className="text-[0.68rem] text-slate-400">Messages</p><p className="text-base font-semibold leading-5">{messageTotal}</p></div>
          <span className="grid size-8 place-items-center rounded-lg bg-sky-400/10 text-sky-300"><Inbox className="size-4" /></span>
        </div>
        <div className="email-summary-metric email-summary-mobile hidden min-w-[150px] items-center justify-between gap-3 rounded-lg border border-cyan-100/10 bg-gradient-to-br from-[#0e222b]/40 to-[#040d12]/70 px-3 py-1.5 md:flex">
          <div><p className="text-[0.68rem] text-slate-400">Unread</p><p className="text-base font-semibold leading-5">{unreadTotal}</p></div>
          <span className="grid size-8 place-items-center rounded-lg bg-emerald-400/10 text-emerald-300"><Mail className="size-4" /></span>
        </div>
        <button type="button" onClick={() => { setGeneratorOpen(true); setForwardingVerificationNotice(""); loadForwardingDestinations(); }} className="email-generate-button flex h-10 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 via-cyan-400 to-sky-500 px-3.5 text-xs font-bold text-[#001217] shadow-[0_10px_28px_rgba(13,192,220,0.12)] transition hover:-translate-y-px hover:brightness-110">
          <span className="text-base leading-none">+</span> Generate new email
        </button>
      </div>

      {(error || notice) && (
        <div className={`mt-5 rounded-lg border px-4 py-3 text-sm ${error ? "border-red-400/20 bg-red-400/[0.06] text-red-300" : "border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-200"}`} role={error ? "alert" : "status"}>
          {error || notice}
        </div>
      )}

      {generatorOpen && (
        <div className="email-generator-modal-layer fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/45 p-4" onMouseDown={() => setGeneratorOpen(false)}>
          <form className="email-generator-modal w-full max-w-[520px] overflow-visible rounded-xl border border-cyan-100/15 bg-[#0b1820] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.35)]" onSubmit={generateAddresses} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="email-generator-modal-title">
            <div className="flex items-center justify-between gap-3">
              <h2 id="email-generator-modal-title" className="text-sm font-semibold text-white">Generate new email</h2>
              <button type="button" onClick={() => setGeneratorOpen(false)} className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-white" aria-label="Close generator">
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="email-generator-fields grid grid-cols-[minmax(260px,1fr)_190px] gap-2">
                <label className="block min-w-0 text-xs font-medium text-slate-300">
                  <span className="mb-1.5 block">Prefix</span>
                  <span className="flex min-h-[42px] items-center rounded-lg border border-cyan-100/15 bg-[#071219] transition focus-within:border-cyan-300/55">
                    <input className="min-h-10 min-w-0 flex-1 bg-transparent px-3 text-xs text-slate-100 outline-none placeholder:text-slate-600" value={prefix} onChange={(event) => setPrefix(event.target.value)} placeholder="Enter a prefix" maxLength={64} required autoFocus />
                    <button type="button" onClick={generateRandomPrefix} className="grid min-w-10 self-stretch place-items-center border-l border-cyan-100/10 text-cyan-300 transition hover:bg-cyan-300/[0.06]" aria-label="Generate random prefix" title="Generate random prefix">
                      <Sparkles className="size-4" />
                    </button>
                  </span>
                </label>

                <SelectField label="Domain" name="domainId" value={domainId} onChange={(event) => setDomainId(event.target.value)} options={domainOptions} disabled={loading || !domains.length} className="min-h-[42px] text-xs" />
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#071219] p-1 text-xs">
                <button type="button" onClick={() => setDeliveryMode("vault")} className={`rounded-md px-3 py-2 transition ${deliveryMode === "vault" ? "bg-cyan-300/15 text-cyan-200" : "text-slate-400 hover:text-white"}`}>Save in Vault</button>
                <button type="button" onClick={() => setDeliveryMode("forward")} disabled={!forwardingAvailable || !forwardingDestinations.length} className={`rounded-md px-3 py-2 transition disabled:cursor-not-allowed disabled:opacity-40 ${deliveryMode === "forward" ? "bg-cyan-300/15 text-cyan-200" : "text-slate-400 hover:text-white"}`}>Forward real email</button>
              </div>

              {deliveryMode === "forward" && (
                <SelectField label="Forward to" name="forwardDestinationId" value={forwardDestinationId} onChange={(event) => setForwardDestinationId(event.target.value)} options={forwardingOptions} className="min-h-10 text-xs" />
              )}

              {!forwardingAvailable && <p className="text-[0.7rem] text-slate-500">Forwarding requires a destination verified by Cloudflare.</p>}

              <div className="rounded-lg border border-cyan-100/10 bg-[#071219] p-3">
                <p className="text-[0.7rem] font-medium text-slate-300">Add forwarding destination</p>
                <div className="email-forwarding-controls mt-2 flex gap-2">
                  <input type="email" value={forwardingEmail} onChange={(event) => setForwardingEmail(event.target.value)} placeholder="you@example.com" className="min-h-9 min-w-0 flex-1 rounded-lg border border-cyan-100/15 bg-[#040d12] px-3 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-300/55" />
                  <button type="button" onClick={addForwardingDestination} disabled={forwardingVerificationSubmitting || !forwardingEmail.trim()} className="min-h-9 shrink-0 rounded-lg border border-cyan-300/25 px-3 text-xs text-cyan-200 transition hover:bg-cyan-300/[0.06] disabled:opacity-40">{forwardingVerificationSubmitting ? "Sending..." : "Verify"}</button>
                  <button type="button" onClick={loadForwardingDestinations} className="grid size-9 shrink-0 place-items-center rounded-lg border border-cyan-100/15 text-slate-400 transition hover:text-cyan-300" aria-label="Refresh verified forwarding destinations"><RefreshCw className="size-4" /></button>
                </div>
                {forwardingVerificationNotice && <p className="mt-2 text-[0.7rem] leading-relaxed text-cyan-200" role="status">{forwardingVerificationNotice}</p>}
              </div>

              {submitting && <p className="text-center text-[0.7rem] text-cyan-200" role="status">Creating and synchronizing the routing rule with Cloudflare...</p>}

              <button type="submit" disabled={submitting || loading || !domainId || !prefix.trim() || (deliveryMode === "forward" && !forwardDestinationId)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-400 text-sm font-semibold text-[#001217] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50">
                <Sparkles className="size-4" />{submitting ? "Syncing with Cloudflare..." : "Generate email"}
              </button>
            </div>
          </form>
        </div>
      )}

      {addressDetails && (
        <Modal title="Email address details" onClose={() => !detailsSaving && setAddressDetails(null)} className="email-address-details-modal">
          <div className="mt-4 rounded-xl border border-cyan-100/10 bg-[#071219] p-4">
            <p className="break-all text-sm font-semibold text-white">{addressDetails.fullAddress}</p>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <div><p className="text-slate-500">Created</p><p className="mt-1 text-slate-300">{formatDate(addressDetails.createdAt)}</p></div>
              <div><p className="text-slate-500">Last message</p><p className="mt-1 text-slate-300">{formatDate(addressDetails.lastMessageAt)}</p></div>
              <div><p className="text-slate-500">Stored messages</p><p className="mt-1 text-slate-300">{addressDetails.messageCount}</p></div>
              <div><p className="text-slate-500">Storage used</p><p className="mt-1 text-slate-300">{formatBytes(addressDetails.storageBytes || 0)}</p></div>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium text-slate-300">Delivery</p>
            <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-[#071219] p-1 text-xs">
              <button type="button" onClick={() => { setAddressDetails((current) => ({ ...current, deliveryMode: "vault" })); setDetailsFeedback(null); }} className={`rounded-md px-3 py-2 transition ${addressDetails.deliveryMode === "vault" ? "bg-cyan-300/15 text-cyan-200" : "text-slate-400"}`}>Save in Vault</button>
              <button type="button" onClick={() => { setAddressDetails((current) => ({ ...current, deliveryMode: "forward" })); setDetailsFeedback(null); }} disabled={!forwardingAvailable || !forwardingDestinations.length} className={`rounded-md px-3 py-2 transition disabled:opacity-40 ${addressDetails.deliveryMode === "forward" ? "bg-cyan-300/15 text-cyan-200" : "text-slate-400"}`}>Forward real email</button>
            </div>
            {addressDetails.deliveryMode === "forward" ? (
              <><SelectField name="forwardDestinationId" value={forwardDestinationId} onChange={(event) => { setForwardDestinationId(event.target.value); setDetailsFeedback(null); }} options={forwardingOptions} ariaLabel="Forward to" className="mt-3 min-h-10 text-xs" /><p className="mt-2 text-[0.68rem] leading-5 text-slate-500">New mail is forwarded by the Vault Worker and is not stored. Earlier Vault messages remain available.</p></>
            ) : <p className="mt-3 text-xs text-slate-500">New mail will be stored in this Vault inbox.</p>}
          </div>

          {detailsFeedback && <div className={`mt-4 rounded-lg border px-3 py-2.5 text-xs ${detailsFeedback.type === "success" ? "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-200" : "border-red-400/20 bg-red-400/[0.06] text-red-300"}`} role={detailsFeedback.type === "error" ? "alert" : "status"}>{detailsFeedback.message}</div>}

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setAddressDetails(null)} disabled={detailsSaving} className="h-10 rounded-lg border border-white/10 px-4 text-xs text-slate-300">Close</button>
            <button type="button" onClick={saveAddressDetails} disabled={detailsSaving || (addressDetails.deliveryMode === "forward" && !forwardDestinationId)} className="flex h-10 items-center gap-2 rounded-lg bg-cyan-400 px-4 text-xs font-semibold text-[#001217] disabled:opacity-50">{detailsSaving ? "Saving..." : detailsFeedback?.type === "success" ? <><Check className="size-4" />Saved</> : "Save changes"}</button>
          </div>
        </Modal>
      )}

      {messagesToDelete.length > 0 && (
        <Modal title={`Delete ${messagesToDelete.length} message${messagesToDelete.length === 1 ? "" : "s"}?`} onClose={() => !deletingMessage && setMessagesToDelete([])}>
          <div className="mt-4 max-h-32 overflow-y-auto rounded-lg border border-rose-400/15 bg-rose-400/[0.05] p-3">{messagesToDelete.map((message) => <p key={message.id} className="truncate py-1 text-xs text-slate-300">{message.subject || "(No subject)"}</p>)}</div>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">The selected messages will be permanently deleted from Vault and their recorded storage will be reclaimed.</p>
          <div className="mt-6 flex justify-end gap-3"><button type="button" disabled={deletingMessage} onClick={() => setMessagesToDelete([])} className="h-10 rounded-lg border border-white/10 px-4 text-sm text-slate-300 disabled:opacity-50">Cancel</button><button type="button" disabled={deletingMessage} onClick={deleteMessages} className="flex h-10 items-center gap-2 rounded-lg bg-rose-500 px-4 text-sm font-semibold text-white disabled:opacity-50"><Trash2 className="size-4" />{deletingMessage ? "Deleting..." : "Delete"}</button></div>
        </Modal>
      )}

      {addressesToDelete.length > 0 && (
        <Modal
          title={`Delete ${addressesToDelete.length} email address${addressesToDelete.length === 1 ? "" : "es"}?`}
          onClose={() => !deletingAddress && setAddressesToDelete([])}
        >
          <div className="mt-4 max-h-32 overflow-y-auto rounded-lg border border-rose-400/15 bg-rose-400/[0.05] p-3">
            {addressesToDelete.map((address) => <p key={address.id} className="truncate py-1 text-xs text-slate-300">{address.fullAddress}</p>)}
          </div>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            The selected addresses and all messages they received will be permanently deleted. This cannot be undone.
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" disabled={deletingAddress} onClick={() => setAddressesToDelete([])} className="h-10 rounded-lg border border-white/10 px-4 text-sm text-slate-300 disabled:opacity-50" autoFocus>Cancel</button>
            <button type="button" disabled={deletingAddress} onClick={deleteAddresses} className="flex h-10 items-center gap-2 rounded-lg bg-rose-500 px-4 text-sm font-semibold text-white disabled:opacity-50"><Trash2 className="size-4" />{deletingAddress ? "Deleting..." : "Delete selected"}</button>
          </div>
        </Modal>
      )}

      <section className="email-generator-results mt-7 overflow-hidden rounded-xl border border-cyan-100/10 bg-gradient-to-br from-[#0e222b]/40 to-[#040d12]/70 shadow-[inset_0_1px_rgba(255,255,255,0.015)]">
        <div className="email-results-toolbar flex flex-col items-stretch justify-between gap-4 border-b border-cyan-100/10 px-4 pb-4 sm:flex-row sm:items-center sm:px-5 sm:pb-0">
          <div className="email-results-tabs flex min-w-0 flex-wrap gap-6">
            <button type="button" onClick={() => setActiveTab("addresses")} className={`relative flex min-h-12 shrink-0 items-center gap-2 text-sm font-medium transition after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:rounded-full after:bg-cyan-300 after:transition ${activeTab === "addresses" ? "text-cyan-300 after:opacity-100" : "text-slate-400 after:opacity-0"}`}>Generated emails <span className={`rounded-full px-2 py-0.5 text-[0.68rem] ${activeTab === "addresses" ? "bg-cyan-300/20 text-cyan-100" : "bg-slate-400/10 text-slate-400"}`}>{addresses.length}</span></button>
            <button type="button" onClick={() => setActiveTab("history")} className={`relative flex min-h-12 shrink-0 items-center gap-2 text-sm font-medium transition after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:rounded-full after:bg-cyan-300 after:transition ${activeTab === "history" ? "text-cyan-300 after:opacity-100" : "text-slate-400 after:opacity-0"}`}>History <span className={`rounded-full px-2 py-0.5 text-[0.68rem] ${activeTab === "history" ? "bg-cyan-300/20 text-cyan-100" : "bg-slate-400/10 text-slate-400"}`}>{messageTotal}</span></button>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            {selectedAddressIds.length > 0 && <button type="button" onClick={() => setAddressesToDelete(addresses.filter((address) => selectedAddressIds.includes(address.id)))} className="flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-rose-400/25 px-3 text-xs font-medium text-rose-300 transition hover:bg-rose-400/[0.07]"><Trash2 className="size-4" />Delete {selectedAddressIds.length}</button>}
            {activeTab === "addresses" && <label className="email-address-search flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-cyan-100/10 bg-[#071219] px-3 text-slate-500 transition focus-within:border-cyan-300/55 focus-within:shadow-[0_0_0_3px_rgba(22,217,227,0.07)] sm:min-w-[280px]"><Search className="size-4" /><input className="min-h-10 min-w-0 flex-1 bg-transparent text-[0.8rem] text-slate-200 outline-none placeholder:text-slate-600" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search email address..." aria-label="Search generated emails" /></label>}
          </div>
        </div>

        {activeTab === "addresses" ? (
          <>
          <div className="email-address-desktop-list hidden overflow-x-auto md:block">
            <div className="min-w-[760px]">
              <div className="grid min-h-11 grid-cols-[28px_minmax(300px,1.8fr)_minmax(130px,0.65fr)_minmax(175px,0.8fr)_minmax(130px,0.65fr)] items-center gap-4 border-b border-cyan-100/10 px-5 text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-slate-500"><SelectionCheckbox checked={pagedAddresses.length > 0 && pagedAddresses.every((address) => selectedAddressIds.includes(address.id))} onChange={togglePageSelection} label="Select all email addresses on this page" /><span>Email address</span><span>Messages</span><span>Created</span><span className="text-right">Actions</span></div>
              {loading ? <p className="p-6 text-sm text-slate-400">Loading addresses...</p> : !filteredAddresses.length ? <p className="p-6 text-sm text-slate-400">No matching addresses. Generate your first address above.</p> : pagedAddresses.map((address) => (
                <div key={address.id} className={`grid min-h-[4.8rem] grid-cols-[28px_minmax(300px,1.8fr)_minmax(130px,0.65fr)_minmax(175px,0.8fr)_minmax(130px,0.65fr)] items-center gap-4 border-b border-cyan-100/[0.07] px-5 transition last:border-b-0 hover:bg-cyan-300/[0.025] ${selectedAddressIds.includes(address.id) ? "bg-cyan-300/[0.04]" : ""}`}>
                  <SelectionCheckbox checked={selectedAddressIds.includes(address.id)} onChange={() => toggleAddressSelection(address.id)} label={`Select ${address.fullAddress}`} />
                  <button type="button" onClick={() => selectAddress(address.id)} className="flex min-w-0 items-center gap-3 text-left">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full border border-cyan-300/15 text-cyan-300"><Mail className="size-4" /></span>
                    <span className="truncate text-sm font-medium text-slate-200">{address.fullAddress}</span>
                  </button>
                  <span className="text-sm text-slate-300">{address.messageCount}<small className="ml-1 text-slate-500">({address.unreadCount} unread)</small></span>
                  <span className="text-xs leading-relaxed text-slate-400">{formatDate(address.createdAt)}</span>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => openAddressDetails(address)} className="action-button" aria-label={`View details for ${address.fullAddress}`}><Eye /></button>
                    <button type="button" onClick={() => copyAddress(address)} className="action-button" aria-label={`Copy ${address.fullAddress}`}>{copiedId === address.id ? <Check /> : <Copy />}</button>
                    <button type="button" onClick={() => setAddressesToDelete([address])} className="action-button text-rose-300 hover:border-rose-300/30 hover:bg-rose-300/[0.06] hover:text-rose-200" aria-label={`Delete ${address.fullAddress}`}><Trash2 /></button>
                  </div>
                </div>
              ))}
            </div>
            {filteredAddresses.length > rowsPerPage && (
              <div className="flex min-w-[760px] items-center justify-between border-t border-cyan-100/10 px-5 py-3 text-xs text-slate-400">
                <span>Page {addressPage} of {addressPageCount}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAddressPage((page) => Math.max(1, page - 1))} disabled={addressPage === 1} className="rounded-lg border border-white/10 px-3 py-2 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
                  <button type="button" onClick={() => setAddressPage((page) => Math.min(addressPageCount, page + 1))} disabled={addressPage === addressPageCount} className="rounded-lg border border-white/10 px-3 py-2 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </div>
          <div className="email-address-mobile-list md:hidden">
            {loading ? <p className="p-5 text-sm text-slate-400">Loading addresses...</p> : !filteredAddresses.length ? <p className="p-5 text-sm text-slate-400">No matching addresses. Generate your first address above.</p> : pagedAddresses.map((address) => (
              <article key={address.id} className={`email-address-mobile-card ${selectedAddressIds.includes(address.id) ? "is-selected" : ""}`}>
                <div className="flex min-w-0 items-start gap-3">
                  <SelectionCheckbox checked={selectedAddressIds.includes(address.id)} onChange={() => toggleAddressSelection(address.id)} label={`Select ${address.fullAddress}`} />
                  <button type="button" onClick={() => selectAddress(address.id)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full border border-cyan-300/15 text-cyan-300"><Mail className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-all text-sm font-medium leading-5 text-slate-200">{address.fullAddress}</span>
                      <span className="mt-1.5 block text-[0.68rem] text-slate-500">{address.messageCount} messages · {address.unreadCount} unread · {formatDate(address.createdAt)}</span>
                    </span>
                  </button>
                </div>
                <div className="email-address-mobile-actions mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => openAddressDetails(address)} className="action-button" aria-label={`View details for ${address.fullAddress}`}><Eye /></button>
                  <button type="button" onClick={() => copyAddress(address)} className="action-button" aria-label={`Copy ${address.fullAddress}`}>{copiedId === address.id ? <Check /> : <Copy />}</button>
                  <button type="button" onClick={() => setAddressesToDelete([address])} className="action-button text-rose-300" aria-label={`Delete ${address.fullAddress}`}><Trash2 /></button>
                </div>
              </article>
            ))}
            {filteredAddresses.length > rowsPerPage && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-slate-400">
                <span>{addressPage} / {addressPageCount}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAddressPage((page) => Math.max(1, page - 1))} disabled={addressPage === 1} className="rounded-lg border border-white/10 px-3 py-2 disabled:opacity-40">Previous</button>
                  <button type="button" onClick={() => setAddressPage((page) => Math.min(addressPageCount, page + 1))} disabled={addressPage === addressPageCount} className="rounded-lg border border-white/10 px-3 py-2 disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </div>
          </>
        ) : selectedMessage ? (
          <article className="email-history-reader max-h-[520px] overflow-y-auto p-6">
            <button type="button" onClick={() => setSelectedMessage(null)} className="mb-5 text-sm text-cyan-300 transition hover:text-cyan-200">← Back to history</button>
            <h3 className="text-lg font-semibold">{selectedMessage.subject || "(No subject)"}</h3>
            <dl className="mt-4 space-y-1 text-xs text-slate-400"><div><dt className="inline text-slate-500">From: </dt><dd className="inline break-all">{selectedMessage.sender}</dd></div><div><dt className="inline text-slate-500">To: </dt><dd className="inline break-all">{selectedMessage.recipient}</dd></div><div><dt className="inline text-slate-500">Received: </dt><dd className="inline">{formatDate(selectedMessage.receivedAt)}</dd></div><div><dt className="inline text-slate-500">Storage: </dt><dd className="inline">{formatBytes(selectedMessage.rawSizeBytes || 0)}</dd></div></dl>
            <button type="button" onClick={() => setMessagesToDelete([selectedMessage])} className="mt-4 flex items-center gap-2 rounded-lg border border-rose-400/25 px-3 py-2 text-xs text-rose-300 transition hover:bg-rose-400/[0.07]"><Trash2 className="size-4" />Delete message</button>
            <pre className="mt-5 whitespace-pre-wrap break-words border-t border-white/8 pt-5 font-sans text-sm leading-relaxed text-slate-300">{selectedMessage.textBody || "This message has no plain-text content."}</pre>
          </article>
        ) : messagesLoading ? (
          <p className="p-6 text-sm text-slate-400">Loading message history...</p>
        ) : !messages.length ? (
          <div className="grid min-h-[280px] place-items-center p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-full border border-cyan-300/15 bg-cyan-300/[0.05] text-cyan-300"><Inbox className="size-5" /></span><p className="mt-4 text-sm font-medium text-slate-300">No messages received yet</p><p className="mt-1 text-xs text-slate-500">New messages sent to your generated addresses will appear here.</p></div></div>
        ) : (
          <div className="email-history-list">
            <div className="email-history-header grid min-h-11 grid-cols-[minmax(250px,1.3fr)_minmax(240px,1.5fr)_minmax(170px,0.8fr)] items-center gap-4 border-b border-cyan-100/10 px-5 text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-slate-500"><span>Recipient</span><span>Message</span><span>Date & time</span></div>
            {pagedMessages.map((message) => (
              <button key={message.id} type="button" onClick={() => openMessage(message.id)} className="email-history-row grid min-h-[4.8rem] w-full grid-cols-[minmax(250px,1.3fr)_minmax(240px,1.5fr)_minmax(170px,0.8fr)] items-center gap-4 border-b border-cyan-100/[0.07] px-5 text-left transition last:border-b-0 hover:bg-cyan-300/[0.025]">
                <span className="flex min-w-0 items-center gap-3"><i className={`size-2 shrink-0 rounded-full ${message.readAt ? "bg-slate-700" : "bg-cyan-300 shadow-[0_0_0_3px_rgba(34,211,238,0.08)]"}`} /><span className="truncate text-sm text-slate-300">{message.recipient}</span></span>
                <span className="min-w-0"><span className={`block truncate text-sm ${message.readAt ? "font-medium text-slate-300" : "font-semibold text-white"}`}>{message.subject || "(No subject)"}</span><span className="mt-1 block truncate text-xs text-slate-500">From {message.sender}</span></span>
                <span className="flex items-center justify-between gap-3 text-xs text-slate-400">{formatDate(message.receivedAt)}<ChevronRight className="size-4 shrink-0 text-slate-600" /></span>
              </button>
            ))}
            {messages.length > rowsPerPage && (
              <div className="flex items-center justify-between border-t border-cyan-100/10 px-5 py-3 text-xs text-slate-400">
                <span>Page {historyPage} of {historyPageCount}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setHistoryPage((page) => Math.max(1, page - 1))} disabled={historyPage === 1} className="rounded-lg border border-white/10 px-3 py-2 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
                  <button type="button" onClick={() => setHistoryPage((page) => Math.min(historyPageCount, page + 1))} disabled={historyPage === historyPageCount} className="rounded-lg border border-white/10 px-3 py-2 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
