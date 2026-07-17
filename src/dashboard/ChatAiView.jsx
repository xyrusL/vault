import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import {
  Atom,
  Bot,
  Check,
  CheckCheck,
  ChevronRight,
  Download,
  EllipsisVertical,
  FileText,
  Globe2,
  History,
  ImageIcon,
  Eye,
  EyeOff,
  Lightbulb,
  LoaderCircle,
  Mail,
  MessageSquareText,
  Plus,
  Send,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { apiFetch } from "../api";
import { Field, Modal, PageTitle, SelectField } from "./DashboardUi";
import {
  DEFAULT_CHAT_ENDPOINT,
  chooseConversationAfterDelete,
  mergeConversation,
  readApiResult,
} from "./chatAiState";
import {
  executeVaultAiTool,
  VAULT_AGENT_INSTRUCTIONS,
  VAULT_AI_TOOLS,
} from "./chatAiTools";

// 9router keeps media models in its provider registry, separate from /v1/models.
const ROUTER_IMAGE_MODELS = [
  {
    id: "ag/gemini-3.1-flash-image",
    kind: "image",
    imageGen: true,
    capabilities: ["textToImage"],
  },
  {
    id: "cx/gpt-5.5-image",
    kind: "image",
    capabilities: ["text2img", "edit"],
  },
  {
    id: "cx/gpt-5.4-image",
    kind: "image",
    capabilities: ["text2img", "edit"],
  },
  {
    id: "cx/gpt-5.3-image",
    kind: "image",
    capabilities: ["text2img", "edit"],
  },
];

const IMAGE_GENERATION_TOOL = {
  type: "function",
  function: {
    name: "generate_image",
    description: "Generate one image with the configured image model. Use this whenever the user asks to create, draw, render, or generate an image. Improve the prompt and infer sensible parameters from the request.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "A detailed, production-ready image prompt that preserves the user's intent." },
        aspectRatio: { type: "string", enum: ["1:1", "16:9", "9:16", "4:3", "3:4"] },
        resolution: { type: "string", enum: ["1k", "2k", "4k"], description: "Requested output resolution. Use 4k when the user asks for 4K, UHD, or very high resolution." },
        quality: { type: "string", enum: ["standard", "high"], description: "Use high for detailed or professional-quality requests." },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
};

function pendingActionTools(pendingAction) {
  if (!pendingAction) return [];
  const parameters = {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  };
  return [
    {
      type: "function",
      function: {
        name: "confirm_pending_action",
        description: `Execute the exact pending action after the latest user reply clearly approves it. Pending request: ${pendingAction.message}`,
        parameters,
      },
    },
    {
      type: "function",
      function: {
        name: "cancel_pending_action",
        description: `Cancel the pending action only when the latest user reply clearly rejects it. Pending request: ${pendingAction.message}`,
        parameters,
      },
    },
  ];
}

const IMAGE_SIZES = {
  "1:1": { "1k": "1024x1024", "2k": "2048x2048", "4k": "4096x4096" },
  "16:9": { "1k": "1024x576", "2k": "2048x1152", "4k": "3840x2160" },
  "9:16": { "1k": "576x1024", "2k": "1152x2048", "4k": "2160x3840" },
  "4:3": { "1k": "1024x768", "2k": "2048x1536", "4k": "4096x3072" },
  "3:4": { "1k": "768x1024", "2k": "1536x2048", "4k": "3072x4096" },
};

function formatConversationTime(value) {
  if (!value) return "";
  const date = new Date(`${value}${value.endsWith("Z") ? "" : "Z"}`);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatMessageTime(value) {
  if (!value) return "";
  const date = new Date(`${value}${value.endsWith("Z") ? "" : "Z"}`);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function providerUrl(baseUrl, endpoint) {
  return `${baseUrl.replace(/\/+$/, "")}/${endpoint}`;
}

function providerHeaders(apiMode, apiKey, includeJson = false) {
  const headers = { Accept: "application/json" };
  if (apiMode === "anthropic-messages") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  if (includeJson) headers["Content-Type"] = "application/json";
  return headers;
}

async function readProviderResult(response, fallback) {
  let result = {};
  try {
    result = await response.json();
  } catch {
    // Use the safe fallback below.
  }
  if (!response.ok) {
    throw new Error(
      result?.error?.message || result?.error || fallback,
    );
  }
  return result;
}

function extractMessageText(message, choice) {
  if (typeof message?.content === "string") return message.content;
  if (Array.isArray(message?.content)) {
    const text = message.content
      .map((item) => typeof item === "string" ? item : item?.text || item?.content || "")
      .join("");
    if (text) return text;
  }
  if (typeof choice?.text === "string") return choice.text;
  if (typeof message?.reasoning_content === "string") return message.reasoning_content;
  return "";
}

function normalizeProviderModels(payload) {
  const candidates = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : [];
  return [...new Set(candidates
    .map((model) => typeof model === "string" ? model : model?.id ?? model?.name)
    .filter((id) => typeof id === "string" && id.trim())
    .map((id) => id.trim()))]
    .sort((left, right) => left.localeCompare(right));
}

function findImageModel(models) {
  const discoveredModel = models.find((model) => {
    const id = model.toLowerCase();
    return id.includes("imagen")
      || id.includes("nano-banana")
      || (id.includes("gemini") && id.includes("image"));
  });
  if (discoveredModel) return discoveredModel;

  return ROUTER_IMAGE_MODELS.find((model) => (
    model.kind === "image"
    && model.imageGen
    && model.capabilities.includes("textToImage")
  ))?.id || "";
}

function extractGeneratedImage(payload) {
  const image = payload?.data?.[0];
  if (typeof image?.url === "string") return image.url;
  if (typeof image?.image_url === "string") return image.image_url;
  if (typeof image?.b64_json === "string") {
    return `data:image/png;base64,${image.b64_json}`;
  }

  const message = payload?.choices?.[0]?.message;
  const messageImage = message?.images?.[0]?.image_url;
  if (typeof messageImage === "string") return messageImage;
  if (typeof messageImage?.url === "string") return messageImage.url;
  const contentImage = Array.isArray(message?.content)
    ? message.content.find((item) => item?.type === "image_url")?.image_url
    : null;
  return typeof contentImage === "string" ? contentImage : contentImage?.url || "";
}

async function downloadGeneratedImage(imageUrl, format, filename) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error("Unable to download the generated image.");

  const sourceBlob = await response.blob();
  const bitmap = await createImageBitmap(sourceBlob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (format === "jpg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("Unable to prepare the image download.")),
      format === "jpg" ? "image/jpeg" : "image/png",
      0.92,
    );
  });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `${filename}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

async function requestProviderImage(config, apiKey, model, prompt, options = {}) {
  const applyParameters = Object.keys(options).length > 0;
  const aspectRatio = IMAGE_SIZES[options.aspectRatio] ? options.aspectRatio : "1:1";
  const resolution = ["1k", "2k", "4k"].includes(options.resolution) ? options.resolution : "1k";
  const quality = options.quality === "high" ? "hd" : "standard";
  const requestedSize = IMAGE_SIZES[aspectRatio][resolution];
  const enhancedPrompt = applyParameters
    ? `${prompt}\n\nOutput requirements: ${aspectRatio} aspect ratio, ${resolution.toUpperCase()} resolution intent, ${options.quality === "high" ? "high detail and professional quality" : "standard quality"}.`
    : prompt;
  const requestImage = (body) => fetch(providerUrl(config.baseUrl, "images/generations"), {
    method: "POST",
    headers: providerHeaders(config.apiMode, apiKey, true),
    body: JSON.stringify(body),
  });
  const baseRequest = {
    model,
    prompt: enhancedPrompt,
    n: 1,
    response_format: "b64_json",
  };
  let response = await requestImage(applyParameters
    ? { ...baseRequest, size: requestedSize, quality }
    : baseRequest);
  let result = await response.json().catch(() => ({}));

  if (!response.ok && applyParameters) {
    response = await requestImage(baseRequest);
    result = await response.json().catch(() => ({}));
  }

  if (!response.ok) {
    response = await fetch(providerUrl(config.baseUrl, "chat/completions"), {
      method: "POST",
      headers: providerHeaders(config.apiMode, apiKey, true),
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: enhancedPrompt }],
        modalities: ["text", "image"],
        stream: false,
      }),
    });
    result = await readProviderResult(response, "The image model rejected the request.");
  }

  const imageUrl = extractGeneratedImage(result);
  if (!imageUrl) throw new Error("The image model returned no image.");
  return imageUrl;
}

async function requestProviderCompletion(config, apiKey, history, message, imageModel, pendingAction) {
  const anthropic = config.apiMode === "anthropic-messages";
  const responses = config.apiMode === "openai-responses";
  const conversationMessages = [...history, { role: "user", content: message }];
  if (anthropic || responses) {
    const response = await fetch(providerUrl(
      config.baseUrl,
      anthropic ? "messages" : "responses",
    ), {
      method: "POST",
      headers: providerHeaders(config.apiMode, apiKey, true),
      body: JSON.stringify(anthropic
        ? { model: config.model, max_tokens: 4096, messages: conversationMessages }
        : { model: config.model, input: conversationMessages, stream: false }),
    });
    const result = await readProviderResult(response, "The AI provider rejected the request.");
    const content = anthropic
      ? result?.content
        ?.filter((block) => block?.type === "text" && typeof block.text === "string")
        .map((block) => block.text)
        .join("")
      : result?.output_text || result?.output
        ?.flatMap((item) => Array.isArray(item?.content) ? item.content : [])
        .map((block) => block?.output_text || block?.text || "")
        .join("");
    if (!content) throw new Error("The AI provider returned an invalid response.");
    return { content, toolActivity: [] };
  }

  const providerMessages = [
    { role: "system", content: VAULT_AGENT_INSTRUCTIONS },
    ...conversationMessages,
  ];
  const availableTools = [
    ...VAULT_AI_TOOLS,
    ...(imageModel ? [IMAGE_GENERATION_TOOL] : []),
    ...pendingActionTools(pendingAction),
  ];
  const toolActivity = [];
  let generatedImage = null;
  let requestedConfirmation = pendingAction;
  let forceTextResponse = false;
  let totalToolCalls = 0;
  for (let round = 0; round < 8; round += 1) {
    let response = await fetch(providerUrl(config.baseUrl, "chat/completions"), {
      method: "POST",
      headers: providerHeaders(config.apiMode, apiKey, true),
      body: JSON.stringify({
        model: config.model,
        messages: providerMessages,
        tools: availableTools,
        tool_choice: forceTextResponse ? "none" : "auto",
        stream: false,
      }),
    });
    if (!response.ok && round === 0) {
      response = await fetch(providerUrl(config.baseUrl, "chat/completions"), {
        method: "POST",
        headers: providerHeaders(config.apiMode, apiKey, true),
        body: JSON.stringify({ model: config.model, messages: conversationMessages, stream: false }),
      });
    }
    const result = await readProviderResult(response, "The AI provider rejected the request.");
    const choice = result?.choices?.[0];
    const providerMessage = choice?.message || {};
    const toolCalls = Array.isArray(providerMessage.tool_calls) ? providerMessage.tool_calls : [];
    if (!toolCalls.length) {
      const content = extractMessageText(providerMessage, choice);
      if (!content) throw new Error("The AI provider returned an invalid response.");
      return {
        content,
        toolActivity,
        imageUrl: generatedImage?.imageUrl || "",
        pendingAction: requestedConfirmation,
      };
    }

    totalToolCalls += toolCalls.length;
    if (totalToolCalls > 20) throw new Error("The AI requested too many Vault operations.");
    providerMessages.push({
      role: "assistant",
      content: providerMessage.content || null,
      tool_calls: toolCalls,
    });
    for (const call of toolCalls) {
      let args;
      try {
        args = JSON.parse(call?.function?.arguments || "{}");
      } catch {
        throw new Error("The AI returned invalid Vault tool arguments.");
      }
      const activity = { id: call.id, name: call?.function?.name, status: "running" };
      toolActivity.push(activity);
      let toolResult;
      try {
        if (activity.name === "confirm_pending_action") {
          if (!requestedConfirmation) throw new Error("There is no action waiting for confirmation.");
          const confirmedAction = requestedConfirmation;
          requestedConfirmation = null;
          toolResult = await executeVaultAiTool(
            confirmedAction.name,
            confirmedAction.args,
            { approvedActionKey: confirmedAction.actionKey },
          );
        } else if (activity.name === "cancel_pending_action") {
          toolResult = { ok: true, canceled: true, message: "The pending action was canceled." };
          requestedConfirmation = null;
        } else if (activity.name === "generate_image") {
          if (generatedImage) throw new Error("Only one image can be generated per chat request.");
          const imageUrl = await requestProviderImage(
            config,
            apiKey,
            imageModel,
            args.prompt,
            args,
          );
          generatedImage = { imageUrl };
          toolResult = {
            ok: true,
            generated: true,
            model: imageModel,
            prompt: args.prompt,
            aspectRatio: args.aspectRatio || "1:1",
            resolution: args.resolution || "1k",
            quality: args.quality || "standard",
            note: "The generated image is attached to the assistant response.",
          };
        } else {
          toolResult = await executeVaultAiTool(activity.name, args, {
            // A repeated exact call on a later turn means the model interpreted
            // the user's natural-language reply as approval.
            approvedActionKey: pendingAction?.actionKey || "",
          });
          if (toolResult.confirmationRequired) {
            requestedConfirmation = {
              actionKey: toolResult.actionKey,
              name: activity.name,
              args,
              message: toolResult.message,
            };
            forceTextResponse = true;
          } else if (pendingAction?.name === activity.name) {
            requestedConfirmation = null;
          }
        }
        activity.status = toolResult.confirmationRequired
          ? "confirmation"
          : toolResult.denied ? "denied" : "completed";
      } catch (toolError) {
        toolResult = { ok: false, error: toolError.message };
        activity.status = "failed";
      }
      activity.result = toolResult;
      providerMessages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(toolResult),
      });
    }
  }
  throw new Error("The AI reached the Vault tool-call limit.");
}

function EndpointModal({ config, apiKey = "", initialModels = [], onSaved, onDeleted, onClose }) {
  const [fields, setFields] = useState({
    providerName: config?.providerName || "9router",
    baseUrl: config?.baseUrl || DEFAULT_CHAT_ENDPOINT,
    apiKey,
    model: config?.model || "",
  });
  const verification = {
    providerId: "9router",
    providerName: fields.providerName.trim(),
    apiMode: "openai-compatible",
    baseUrl: fields.baseUrl.trim(),
    apiKey: fields.apiKey,
  };
  const signature = JSON.stringify(verification);
  const [models, setModels] = useState(initialModels);
  const [modelListAvailable, setModelListAvailable] = useState(true);
  const [verifiedSignature, setVerifiedSignature] = useState(
    () => config && apiKey ? signature : "",
  );
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [error, setError] = useState("");

  const verified = Boolean(verifiedSignature && verifiedSignature === signature);

  function updateField(event) {
    const { name, value } = event.target;
    setFields((current) => ({ ...current, [name]: value }));
    setError("");
  }

  async function verifyEndpoint() {
    if (!verification.providerName || !verification.baseUrl || !verification.apiKey) {
      setError("Provider name, endpoint URL, and API key are required.");
      return;
    }

    setVerifying(true);
    setError("");
    try {
      const response = await fetch(providerUrl(verification.baseUrl, "models"), {
        method: "GET",
        headers: providerHeaders(verification.apiMode, verification.apiKey),
      });
      const result = await readProviderResult(response, "Unable to verify the AI endpoint.");
      const nextModels = normalizeProviderModels(result);
      const hasList = nextModels.length > 0;
      setModels(nextModels);
      setModelListAvailable(hasList);
      setFields((current) => ({
        ...current,
        model: nextModels.includes(current.model) ? current.model : nextModels[0] || current.model,
      }));
      setVerifiedSignature(signature);
    } catch (verifyError) {
      setVerifiedSignature("");
      setError(verifyError.message);
    } finally {
      setVerifying(false);
    }
  }

  async function saveEndpoint(event) {
    event.preventDefault();
    if (!verified || !fields.model.trim()) return;

    setSaving(true);
    setError("");
    try {
      const response = await apiFetch("/ai/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...verification, model: fields.model.trim() }),
      });
      if (response.status === 401) {
        window.location.replace("/");
        return;
      }
      const result = await readApiResult(response, "Unable to save the AI endpoint.");
      onSaved({ ...result.data, apiKey: fields.apiKey, models });
      setFields((current) => ({ ...current, apiKey: "" }));
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeEndpoint() {
    setRemoving(true);
    setError("");
    try {
      const response = await apiFetch("/ai/config", { method: "DELETE" });
      if (response.status === 401) {
        window.location.replace("/");
        return;
      }
      if (!response.ok) await readApiResult(response, "Unable to remove the AI endpoint.");
      onDeleted();
      onClose();
    } catch (removeError) {
      setRemoveOpen(false);
      setError(removeError.message);
    } finally {
      setRemoving(false);
    }
  }

  function closeModal() {
    setFields((current) => ({ ...current, apiKey: "" }));
    onClose();
  }

  return (
    <>
      <Modal
        title="Configure AI endpoint"
        onClose={closeModal}
        size="endpoint"
        header={(
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-cyan-300/10 text-cyan-300"><Settings2 className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-white">Configure AI endpoint</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-400">Connect your 9router account. Your API key is encrypted and never stored in this browser.</p>
            </div>
            <button type="button" onClick={closeModal} className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Close dialog"><X className="size-5" /></button>
          </div>
        )}
      >
        <form onSubmit={saveEndpoint}>
          <div className="mt-3 grid gap-2.5">
            <Field label="Provider name" name="providerName" value={fields.providerName} onChange={updateField} autoComplete="off" className="h-11" />
            <Field label="Endpoint URL" name="baseUrl" type="url" value={fields.baseUrl} onChange={updateField} autoComplete="url" className="h-11" />
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs text-slate-400">API key</span>
              <div className="relative">
                <input name="apiKey" type={showApiKey ? "text" : "password"} value={fields.apiKey} onChange={updateField} autoComplete="off" placeholder="Enter your 9router API key" className="form-control h-11 pr-12" />
                <button type="button" onClick={() => setShowApiKey((visible) => !visible)} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-500 hover:text-slate-200" aria-label={showApiKey ? "Hide API key" : "Show API key"}>{showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
              </div>
            </label>
          </div>

          <button
            type="button"
            disabled={verifying || saving || !fields.apiKey}
            onClick={verifyEndpoint}
            className="mt-2.5 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-300/[0.06] text-sm font-medium text-cyan-200 disabled:opacity-50"
          >
            {verifying ? <LoaderCircle className="size-4 auth-spinner" /> : verified ? <Check className="size-4" /> : <ChevronRight className="size-4" />}
            {verifying ? "Verifying..." : verified ? "Endpoint verified" : "Verify and discover models"}
          </button>

          {verified && (
            <div className="mt-2.5">
              {modelListAvailable && models.length ? (
                <SelectField label="Model" name="model" value={fields.model} options={models} onChange={updateField} className="h-11" />
              ) : (
                <Field label="Model ID" name="model" value={fields.model} onChange={updateField} placeholder="Enter the model identifier" />
              )}
            </div>
          )}

          {error && <p role="alert" className="mt-3 rounded-lg border border-red-400/20 bg-red-400/[0.06] px-3 py-2 text-sm text-red-200">{error}</p>}

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <div>
              {config && (
                <button type="button" disabled={saving || verifying} onClick={() => setRemoveOpen(true)} className="h-10 rounded-lg px-3 text-sm text-red-300 hover:bg-red-400/[0.06]">
                  Remove endpoint
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={closeModal} className="h-10 flex-1 rounded-lg border border-white/10 px-4 text-sm text-slate-300 sm:flex-none">Cancel</button>
              <button type="submit" disabled={!verified || !fields.model.trim() || saving} className="h-10 flex-1 rounded-lg bg-cyan-300 px-5 text-sm font-semibold text-[#001316] disabled:opacity-50 sm:flex-none">
                {saving ? "Saving..." : "Save endpoint"}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {removeOpen && (
        <Modal title="Remove AI endpoint?" onClose={() => !removing && setRemoveOpen(false)}>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            This removes the encrypted API key and disables new AI replies. Your saved conversations remain available.
          </p>
          <div className="mt-7 flex justify-end gap-3">
            <button type="button" disabled={removing} onClick={() => setRemoveOpen(false)} className="h-11 rounded-lg border border-white/10 px-4 text-sm">Cancel</button>
            <button type="button" disabled={removing} onClick={removeEndpoint} className="h-11 rounded-lg bg-red-500 px-4 text-sm font-semibold disabled:opacity-50">
              {removing ? "Removing..." : "Remove endpoint"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function ToolActivity({ calls }) {
  return (
    <div className="mt-3 space-y-2 border-t border-white/8 pt-3">
      {calls.map((call) => (
        <div key={call.id} className="flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2 text-xs text-slate-400">
          {call.status === "completed" ? (
            <Check className="size-3.5 text-emerald-300" />
          ) : call.status === "confirmation" ? (
            <MessageSquareText className="size-3.5 text-amber-300" />
          ) : call.status === "failed" || call.status === "denied" ? (
            <X className="size-3.5 text-amber-300" />
          ) : (
            <LoaderCircle className="size-3.5 auth-spinner text-cyan-300" />
          )}
          <span className="font-mono text-[11px] text-slate-300">{call.name}</span>
          <span className="ml-auto capitalize">{call.status === "confirmation" ? "needs confirmation" : call.status}</span>
        </div>
      ))}
    </div>
  );
}

function GeneratedImage({ message }) {
  const [downloading, setDownloading] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const downloadMenuRef = useRef(null);

  useEffect(() => {
    if (!downloadMenuOpen) return undefined;

    function closeDownloadMenu(event) {
      if (!downloadMenuRef.current?.contains(event.target)) {
        setDownloadMenuOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") setDownloadMenuOpen(false);
    }

    document.addEventListener("pointerdown", closeDownloadMenu);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", closeDownloadMenu);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [downloadMenuOpen]);

  async function handleDownload(format) {
    setDownloadMenuOpen(false);
    setDownloading(format);
    setDownloadError("");
    try {
      await downloadGeneratedImage(
        message.imageUrl,
        format,
        `generated-image-${message.id}`,
      );
    } catch (error) {
      setDownloadError(error.message);
    } finally {
      setDownloading("");
    }
  }

  return (
    <div className="relative mt-3">
      <img src={message.imageUrl} alt={message.content} className="max-h-[520px] w-auto max-w-full rounded-xl border border-white/10 object-contain" />
      <div ref={downloadMenuRef} className="absolute right-3 top-3">
        <button type="button" onClick={() => setDownloadMenuOpen((open) => !open)} disabled={Boolean(downloading)} className="grid size-9 place-items-center rounded-lg border border-white/15 bg-[#061019]/85 text-slate-200 shadow-lg backdrop-blur transition hover:bg-[#0b1b26] hover:text-white disabled:opacity-50" aria-label="Image download options" aria-expanded={downloadMenuOpen}>
          {downloading ? <LoaderCircle className="size-4 auth-spinner" /> : <EllipsisVertical className="size-4" />}
        </button>
        {downloadMenuOpen && (
          <div className="absolute right-0 top-11 z-10 w-40 overflow-hidden rounded-lg border border-white/10 bg-[#08141d] p-1.5 shadow-2xl shadow-black/50">
            {["png", "jpg"].map((format) => (
              <button key={format} type="button" disabled={Boolean(downloading)} onClick={() => handleDownload(format)} className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/[0.06] disabled:opacity-50">
                <Download className="size-4 text-cyan-300" />Download {format.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>
      {downloadError && <p role="alert" className="mt-2 text-xs text-red-300">{downloadError}</p>}
    </div>
  );
}

export default function ChatAiView() {
  const [config, setConfig] = useState(null);
  const [clientApiKey, setClientApiKey] = useState("");
  const [availableModels, setAvailableModels] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [activeCommand, setActiveCommand] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newConversationActive, setNewConversationActive] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState(null);
  const [pendingToolAction, setPendingToolAction] = useState(null);
  const requestSequence = useRef(0);
  const composerRef = useRef(null);
  const messagesRef = useRef(null);
  const historyButtonRef = useRef(null);
  const historyMenuRef = useRef(null);

  const loadMessages = useCallback(async (id) => {
    if (!id) {
      requestSequence.current += 1;
      setMessages([]);
      setMessagesLoading(false);
      return;
    }

    const sequence = ++requestSequence.current;
    setMessagesLoading(true);
    setError("");
    try {
      const response = await apiFetch(`/chat/conversations/${id}/messages`);
      if (response.status === 401) {
        window.location.replace("/");
        return;
      }
      const result = await readApiResult(response, "Unable to load this conversation.");
      if (sequence === requestSequence.current) setMessages(result.data || []);
    } catch (loadError) {
      if (sequence === requestSequence.current) setError(loadError.message);
    } finally {
      if (sequence === requestSequence.current) setMessagesLoading(false);
    }
  }, []);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [configResponse, conversationsResponse] = await Promise.all([
        apiFetch("/ai/client-config"),
        apiFetch("/chat/conversations"),
      ]);
      if (configResponse.status === 401 || conversationsResponse.status === 401) {
        window.location.replace("/");
        return;
      }
      const [configResult, conversationResult] = await Promise.all([
        readApiResult(configResponse, "Unable to load endpoint configuration."),
        readApiResult(conversationsResponse, "Unable to load conversations."),
      ]);
      const nextConversations = conversationResult.data || [];
      if (configResult.data) {
        const { apiKey, ...savedConfig } = configResult.data;
        setConfig(savedConfig);
        setClientApiKey(apiKey || "");
        try {
          const modelResponse = await fetch(providerUrl(savedConfig.baseUrl, "models"), {
            headers: providerHeaders(savedConfig.apiMode, apiKey),
          });
          const modelResult = await readProviderResult(
            modelResponse,
            "Unable to discover provider models.",
          );
          setAvailableModels(normalizeProviderModels(modelResult));
        } catch {
          setAvailableModels([]);
        }
      } else {
        setConfig(null);
        setClientApiKey("");
        setAvailableModels([]);
      }
      setConversations(nextConversations);
      const firstId = nextConversations[0]?.id || "";
      setActiveConversationId(firstId);
      await loadMessages(firstId);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [loadMessages]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  useEffect(() => {
    const container = messagesRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages, sending]);

  useEffect(() => {
    if (!historyOpen) return undefined;

    function handleOutsideInteraction(event) {
      if (
        !historyMenuRef.current?.contains(event.target)
        && !historyButtonRef.current?.contains(event.target)
      ) {
        setHistoryOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setHistoryOpen(false);
        historyButtonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handleOutsideInteraction);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutsideInteraction);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [historyOpen]);

  async function selectConversation(id) {
    setHistoryOpen(false);
    setPendingToolAction(null);
    setActiveConversationId(id);
    await loadMessages(id);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function newConversation() {
    setHistoryOpen(false);
    setActiveCommand("");
    setPendingToolAction(null);
    requestSequence.current += 1;
    setActiveConversationId("");
    setMessages([]);
    setMessagesLoading(false);
    setError("");
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function toggleNewConversation() {
    setNewConversationActive((active) => !active);
    newConversation();
  }

  async function sendMessage() {
    const prompt = draft.trim();
    if (!prompt || sending || !config || !clientApiKey) return;
    const message = activeCommand === "imagine"
      ? `/imagine ${prompt}`
      : prompt;
    const imagineMatch = activeCommand === "imagine"
      ? [message, prompt]
      : message.match(/^\/imagine(?:\s+(.+))?$/is);
    if (imagineMatch && !imagineMatch[1]?.trim()) {
      setError("Add an image prompt after /imagine.");
      return;
    }
    if (imagineMatch && !imageModel) {
      setError("No image-generation model is available from this provider.");
      return;
    }

    const history = messages
      .filter((item) => item.role === "user" || item.role === "assistant")
      .slice(-30)
      .map(({ role, content }) => ({ role, content }));
    const optimisticUserId = `pending-user-${crypto.randomUUID()}`;
    const optimisticUser = {
      id: optimisticUserId,
      conversationId: activeConversationId,
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
    };

    setSending(true);
    setError("");
    setDraft("");
    setActiveCommand("");
    setMessages((current) => [...current, optimisticUser]);
    requestAnimationFrame(() => composerRef.current?.focus());
    try {
      let imageUrl = "";
      let assistantContent;
      let toolActivity = [];
      if (imagineMatch) {
        const prompt = imagineMatch[1].trim();
        imageUrl = await requestProviderImage(
          config,
          clientApiKey,
          imageModel,
          prompt,
        );
        assistantContent = `Generated an image for: ${prompt}`;
      } else {
        const completion = await requestProviderCompletion(
          config,
          clientApiKey,
          history,
          message,
          imageModel,
          pendingToolAction,
        );
        assistantContent = completion.content;
        toolActivity = completion.toolActivity;
        imageUrl = completion.imageUrl;
        setPendingToolAction(completion.pendingAction || null);
      }
      const response = await apiFetch("/chat/exchanges", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message,
          assistantContent,
          ...(activeConversationId ? { conversationId: activeConversationId } : {}),
        }),
      });
      if (response.status === 401) {
        window.location.replace("/");
        return;
      }
      const result = await readApiResult(response, "Unable to save the AI response.");
      const conversation = result.data.conversation;
      setActiveConversationId(conversation.id);
      setMessages((current) => [
        ...current.filter((item) => item.id !== optimisticUserId),
        result.data.user,
        {
          ...result.data.assistant,
          ...(imageUrl ? { imageUrl } : {}),
          ...(toolActivity.length ? { toolActivity } : {}),
        },
      ]);
      setConversations((current) => mergeConversation(current, conversation));
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setSending(false);
    }
  }

  async function deleteConversation() {
    if (!conversationToDelete) return;
    const deletedId = conversationToDelete.id;
    setDeleting(true);
    setError("");
    try {
      const response = await apiFetch(`/chat/conversations/${deletedId}`, { method: "DELETE" });
      if (response.status === 401) {
        window.location.replace("/");
        return;
      }
      if (!response.ok) await readApiResult(response, "Unable to delete this conversation.");
      const nextId = chooseConversationAfterDelete(conversations, deletedId);
      setConversations((current) => current.filter((item) => item.id !== deletedId));
      setConversationToDelete(null);
      if (activeConversationId === deletedId) {
        setActiveConversationId(nextId);
        await loadMessages(nextId);
      }
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setDeleting(false);
    }
  }

  function handleComposerKeyDown(event) {
    if (event.key === "Backspace" && activeCommand && !draft) {
      event.preventDefault();
      setActiveCommand("");
      return;
    }
    if (
      (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey))
      && imageModel
      && /^\/(?:i|im|ima|imag|imagi|imagin|imagine)?$/i.test(draft.trim())
    ) {
      event.preventDefault();
      chooseImagineCommand();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  const imageModel = findImageModel(
    [config?.model, ...availableModels].filter(Boolean),
  );
  const commandQuery = /^\/[^\s]*$/.test(draft) ? draft.slice(1).toLowerCase() : null;
  const showImagineCommand = !activeCommand
    && commandQuery !== null
    && "imagine".startsWith(commandQuery);
  const starterPrompts = [
    { text: "Create a new temporary email", icon: Mail },
    { text: "Show my active accounts", icon: Atom },
    { text: "Summarize unread email", icon: FileText },
    { text: "Show recent Vault activity", icon: Lightbulb },
  ];

  function chooseStarterPrompt(prompt) {
    setActiveCommand("");
    setDraft(prompt);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function chooseImagineCommand() {
    if (!imageModel) return;
    setActiveCommand("imagine");
    setDraft("");
    requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(0, 0);
    });
  }

  function handleDraftChange(event) {
    const value = event.target.value;
    const imaginePrompt = !activeCommand && imageModel
      ? value.match(/^\/imagine\s+([\s\S]*)$/i)?.[1]
      : undefined;
    if (imaginePrompt !== undefined) {
      setActiveCommand("imagine");
      setDraft(imaginePrompt);
      requestAnimationFrame(() => {
        composerRef.current?.focus();
        composerRef.current?.setSelectionRange(
          imaginePrompt.length,
          imaginePrompt.length,
        );
      });
    } else {
      setDraft(value);
    }
    setHistoryOpen(false);
  }

  function handleConfigSaved(savedConfig) {
    const { apiKey, models: discoveredModels, ...presentedConfig } = savedConfig;
    setConfig(presentedConfig);
    setClientApiKey(apiKey);
    setAvailableModels(discoveredModels || []);
  }

  function handleConfigDeleted() {
    setConfig(null);
    setClientApiKey("");
    setAvailableModels([]);
  }

  return (
    <section className="chat-ai-page space-y-5" aria-labelledby="chat-ai-title">
      <PageTitle
        eyebrow="AI Chat"
        title="Chat with AI"
        text="Ask questions, get answers, and accomplish more with AI."
      />

      <div className="chat-ai-workspace overflow-hidden rounded-xl border border-cyan-200/15 bg-[#061019]/80">
        {loading ? (
          <div role="status" className="grid h-full place-items-center text-sm text-slate-400"><span className="flex items-center gap-2"><LoaderCircle className="size-5 auth-spinner text-cyan-300" />Loading Chat Ai...</span></div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div ref={messagesRef} className="chat-ai-messages min-h-0 flex-1 overflow-y-auto px-4 py-7 sm:px-16 sm:py-8">
              {messagesLoading ? (
                <div role="status" className="grid h-full place-items-center text-sm text-slate-400"><span className="flex items-center gap-2"><LoaderCircle className="size-4 auth-spinner" />Loading messages...</span></div>
              ) : !messages.length && !sending ? (
                <div className="flex h-full min-h-56 flex-col items-center justify-center text-center">
                  <span className="chat-ai-signal-ring grid size-14 place-items-center rounded-full border border-cyan-300/45 text-cyan-300"><MessageSquareText className="size-6" /></span>
                  <h2 id="chat-ai-title" className="mt-4 text-lg font-semibold sm:text-xl">How can I help you today?</h2>
                  <p className="mt-1.5 text-xs text-slate-400">{config ? "Start a conversation by typing a message below." : "Configure your endpoint to start a conversation."}</p>
                  <div className="mt-6 grid w-full max-w-[1200px] gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                    {starterPrompts.map(({ text, icon: Icon }) => (
                      <button key={text} type="button" onClick={() => chooseStarterPrompt(text)} disabled={!config} className="flex min-h-11 items-center gap-2.5 rounded-lg border border-white/10 bg-[#07131b]/70 px-3 text-left text-xs text-slate-300 transition hover:border-cyan-300/25 hover:bg-cyan-300/[0.035] hover:text-white disabled:opacity-45">
                        <Icon className="size-4 shrink-0 text-slate-400" />{text}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mx-auto w-full max-w-[1160px] space-y-8">
                  {messages.map((message) => (
                    <article key={message.id} className={`flex gap-4 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                      {message.role !== "user" && <span className="mt-1 grid size-10 shrink-0 place-items-center rounded-full border border-cyan-300/15 bg-cyan-300/10 text-cyan-300"><Bot className="size-[18px]" /></span>}
                      <div className={`rounded-2xl px-5 py-4 ${message.imageUrl ? "max-w-[760px]" : message.role === "user" ? "max-w-[46%]" : "max-w-[58%]"} ${message.role === "user" ? "rounded-br-md bg-gradient-to-br from-cyan-300/[0.13] to-sky-500/[0.08] text-cyan-50" : "rounded-bl-md border border-cyan-100/10 bg-[#07121a]/90 text-slate-200"}`}>
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-cyan-300/70">{message.role === "user" ? "You" : config?.providerName || "AI"}</p>
                        {message.role === "user" ? (
                          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>
                        ) : (
                          <div className="chat-ai-markdown">
                            <Markdown>{message.content}</Markdown>
                          </div>
                        )}
                        {message.toolActivity?.length > 0 && <ToolActivity calls={message.toolActivity} />}
                        {message.imageUrl && <GeneratedImage message={message} />}
                        <p className={`mt-2 flex items-center gap-2 text-[11px] text-slate-500 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                          {formatMessageTime(message.createdAt)}
                          {message.role === "user" && <CheckCheck className="size-3.5 text-cyan-300" />}
                        </p>
                      </div>
                    </article>
                  ))}
                  {sending && (
                    <div role="status" aria-label="AI is responding" className="flex items-center gap-3">
                      <span className="grid size-8 place-items-center rounded-full bg-cyan-300/10 text-cyan-300"><Bot className="size-4" /></span>
                      <span className="flex gap-1 rounded-2xl rounded-bl-md border border-white/8 bg-[#071016] px-4 py-4">{[0, 1, 2].map((dot) => <span key={dot} className="chat-ai-pending-dot size-1.5 rounded-full bg-cyan-300" />)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-3 pb-3 sm:px-4 sm:pb-3">
              {error && <div role="alert" className="mx-auto mb-2 flex max-w-[1200px] items-center justify-between gap-3 rounded-lg border border-red-400/20 bg-red-400/[0.06] px-3 py-2 text-sm text-red-200"><span>{error}</span>{loading && <button type="button" onClick={loadPage} className="shrink-0 font-medium underline">Retry</button>}</div>}
              <div className="chat-ai-composer relative mx-auto max-w-[1200px] rounded-xl border border-cyan-100/15 bg-[#08141d]/95 p-4 transition">
                <label className="sr-only" htmlFor="chat-ai-message">Type your message</label>
                {historyOpen && (
                  <div ref={historyMenuRef} className="absolute bottom-[calc(100%+0.6rem)] left-0 z-10 w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-[#08141d] p-2 shadow-2xl shadow-black/40">
                    <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium uppercase tracking-wider text-slate-500"><History className="size-4" />Conversations</div>
                    <div className="max-h-64 overflow-y-auto">
                      {!conversations.length && <p className="px-3 py-4 text-sm text-slate-500">No saved conversations yet.</p>}
                      {conversations.map((conversation) => (
                        <div key={conversation.id} className={`flex items-center gap-2 rounded-lg ${activeConversationId === conversation.id ? "bg-cyan-300/[0.06]" : "hover:bg-white/[0.03]"}`}>
                          <button type="button" onClick={() => selectConversation(conversation.id)} className="min-w-0 flex-1 px-3 py-2.5 text-left">
                            <span className="block truncate text-sm text-slate-200">{conversation.title}</span>
                            <span className="mt-0.5 block text-[11px] text-slate-500">{formatConversationTime(conversation.updatedAt)}</span>
                          </button>
                          <button type="button" onClick={() => { setHistoryOpen(false); setConversationToDelete(conversation); }} className="mr-2 grid size-8 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-red-400/[0.06] hover:text-red-300" aria-label={`Delete ${conversation.title}`}><Trash2 className="size-4" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {showImagineCommand && (
                  <div className="absolute bottom-[calc(100%+0.6rem)] left-0 z-10 w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-[#08141d] p-2 shadow-2xl shadow-black/40">
                    <button
                      type="button"
                      disabled={!imageModel}
                      onClick={chooseImagineCommand}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-cyan-300/10 text-cyan-300"><ImageIcon className="size-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-white">/imagine</span>
                        <span className="mt-0.5 block text-xs text-slate-500">{imageModel ? `Generate an image with ${imageModel}` : "No image-generation model available"}</span>
                      </span>
                    </button>
                  </div>
                )}
                <div className="flex min-h-12 items-start gap-2">
                  {activeCommand && (
                    <span className="mt-0.5 inline-flex h-7 shrink-0 items-center rounded-md border border-cyan-300/25 bg-cyan-300/10 px-2.5 text-xs font-semibold text-cyan-200">
                      /{activeCommand}
                    </span>
                  )}
                  <textarea id="chat-ai-message" ref={composerRef} value={draft} onChange={handleDraftChange} onKeyDown={handleComposerKeyDown} disabled={!config || sending} rows={1} placeholder={config ? activeCommand === "imagine" ? "Describe the image you want..." : "Type your message or / for commands..." : "Configure an endpoint to start chatting"} className="max-h-32 min-h-12 min-w-0 flex-1 resize-none bg-transparent text-sm text-white outline-none placeholder:text-slate-500 disabled:cursor-not-allowed" />
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-slate-500">
                    <button type="button" onClick={toggleNewConversation} className={`grid size-10 place-items-center rounded-lg border transition hover:border-cyan-300/25 hover:text-cyan-200 ${newConversationActive ? "border-cyan-300/35 bg-cyan-300/10 text-cyan-200 shadow-sm shadow-cyan-950/30" : "border-white/10"}`} aria-label="New conversation" aria-pressed={newConversationActive}><Plus className="size-4" /></button>
                    <button ref={historyButtonRef} type="button" onClick={() => setHistoryOpen((open) => !open)} className={`grid size-10 place-items-center rounded-lg border transition hover:border-cyan-300/25 hover:text-cyan-200 ${historyOpen ? "border-cyan-300/35 bg-cyan-300/10 text-cyan-200 shadow-sm shadow-cyan-950/30" : "border-white/10"}`} aria-label="Conversation history" aria-expanded={historyOpen} aria-pressed={historyOpen}>{historyOpen ? <History className="size-4" /> : <Globe2 className="size-4" />}</button>
                    <button type="button" onClick={() => setConfigOpen((open) => !open)} className={`grid size-10 place-items-center rounded-lg border transition hover:border-cyan-300/25 hover:text-cyan-200 ${configOpen ? "border-cyan-300/35 bg-cyan-300/10 text-cyan-200 shadow-sm shadow-cyan-950/30" : "border-white/10"}`} aria-label="Configure endpoint" aria-pressed={configOpen}><Settings2 className="size-4" /></button>
                  </div>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="max-w-48 truncate rounded-lg border border-white/8 px-2.5 py-1.5 text-[11px] text-slate-400">{activeCommand === "imagine" && imageModel ? imageModel : config?.model || "No model"}</span>
                    <button type="button" onClick={sendMessage} disabled={!config || !draft.trim() || sending} aria-label="Send message" className="grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-300 to-cyan-500 text-[#001316] shadow-lg shadow-cyan-950/30 transition hover:from-cyan-200 hover:to-cyan-400 disabled:opacity-35">{sending ? <LoaderCircle className="size-5 auth-spinner" /> : <Send className="size-5" />}</button>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-center text-[10px] text-slate-600">AI responses can be inaccurate. Verify important information.</p>
            </div>
          </div>
        )}
      </div>

      {configOpen && <EndpointModal config={config} apiKey={clientApiKey} initialModels={availableModels} onSaved={handleConfigSaved} onDeleted={handleConfigDeleted} onClose={() => setConfigOpen(false)} />}

      {conversationToDelete && (
        <Modal title="Delete conversation?" onClose={() => !deleting && setConversationToDelete(null)}>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">This permanently deletes “{conversationToDelete.title}” and all of its messages.</p>
          <div className="mt-7 flex justify-end gap-3">
            <button type="button" disabled={deleting} onClick={() => setConversationToDelete(null)} className="h-11 rounded-lg border border-white/10 px-4 text-sm">Cancel</button>
            <button type="button" disabled={deleting} onClick={deleteConversation} className="h-11 rounded-lg bg-red-500 px-4 text-sm font-semibold disabled:opacity-50">{deleting ? "Deleting..." : "Delete conversation"}</button>
          </div>
        </Modal>
      )}
    </section>
  );
}
