import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Atom,
  Bot,
  Check,
  CheckCheck,
  ChevronRight,
  Copy,
  Download,
  EllipsisVertical,
  FileText,
  Globe2,
  History,
  Eye,
  EyeOff,
  Lightbulb,
  LoaderCircle,
  Mail,
  MessageSquareText,
  Paperclip,
  Plus,
  Search,
  Send,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { apiFetch } from "../api";
import { Field, Modal, SelectField } from "./DashboardUi";
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
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const apiBase = /\/v\d+$/i.test(normalizedBase) ? normalizedBase : `${normalizedBase}/v1`;
  return `${apiBase}/${endpoint.replace(/^\/+/, "")}`;
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

function profileModelValue(profileId, model) {
  return JSON.stringify([profileId, model]);
}

function parseProfileModelValue(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length === 2 ? parsed : [];
  } catch {
    return [];
  }
}

function balancedModelTextClass(options) {
  const longestLabel = Math.max(0, ...options.map((option) => option.label.length));
  if (longestLabel > 80) return "text-[11px]";
  if (longestLabel > 65) return "text-[11.5px]";
  return "text-xs";
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

function redactDisclosedSecrets(content, secrets) {
  return secrets.reduce(
    (redacted, secret) => redacted.replaceAll(secret, "[secret redacted]"),
    content,
  );
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

async function discoverProviderModelIds(baseUrl, apiMode, apiKey) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(providerUrl(baseUrl, "models"), {
        method: "GET",
        headers: providerHeaders(apiMode, apiKey),
        signal: AbortSignal.timeout(10000),
      });
      const result = await readProviderResult(response, "Unable to discover provider models.");
      return normalizeProviderModels(result);
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError;
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
    throw new Error(result?.error?.message || result?.error || "The image model rejected the request.");
  }

  const imageUrl = extractGeneratedImage(result);
  if (!imageUrl) throw new Error("The image model returned no image.");
  return imageUrl;
}

async function requestProviderCompletion(config, apiKey, history, message, imageModel, pendingAction, conversationId) {
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
  const disclosedSecrets = [];
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
        content: redactDisclosedSecrets(content, disclosedSecrets),
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
            { approvedActionKey: confirmedAction.actionKey, conversationId },
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
            conversationId,
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
        const disclosedValue = toolResult?.data?.value;
        if (typeof disclosedValue === "string") disclosedSecrets.push(disclosedValue);
        activity.result = typeof disclosedValue === "string"
          ? { ok: true, data: { id: toolResult.data.id, value: "[secret redacted]" } }
          : toolResult;
      providerMessages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(toolResult),
      });
    }
    if (generatedImage && toolActivity.some((activity) => (
      activity.name === "generate_image" && activity.status === "completed"
    ))) {
      return {
        content: redactDisclosedSecrets(
          extractMessageText(providerMessage, choice) || "Your generated image is ready.",
          disclosedSecrets,
        ),
        toolActivity,
        imageUrl: generatedImage.imageUrl,
        pendingAction: requestedConfirmation,
      };
    }
  }
  throw new Error("The AI reached the Vault tool-call limit.");
}

function EndpointModal({ config, profiles, apiKey = "", initialModels = [], onSaved, onDeleted, onClose }) {
  const [selectedId, setSelectedId] = useState(config?.id || "new");
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
  const signature = JSON.stringify({
    providerId: verification.providerId,
    apiMode: verification.apiMode,
    baseUrl: verification.baseUrl,
    apiKey: verification.apiKey,
  });
  const [models, setModels] = useState(initialModels);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelListAvailable, setModelListAvailable] = useState(true);
  const [verifiedSignature, setVerifiedSignature] = useState(
    () => config && apiKey ? signature : "",
  );
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileQuery, setProfileQuery] = useState("");
  const [error, setError] = useState("");
  const autoVerificationSignature = useRef("");

  const verified = Boolean(verifiedSignature && verifiedSignature === signature);
  const modelOptions = [...new Set([fields.model, ...models].filter(Boolean))];
  const selectedProfile = profiles.find((profile) => profile.id === selectedId);
  const filteredProfiles = profiles.filter((profile) =>
    `${profile.providerName} ${profile.baseUrl} ${profile.model}`
      .toLowerCase()
      .includes(profileQuery.trim().toLowerCase()),
  );

  useEffect(() => {
    if (!config?.baseUrl || !apiKey || initialModels.length) return undefined;
    let cancelled = false;
    setModelsLoading(true);
    discoverProviderModelIds(config.baseUrl, config.apiMode, apiKey)
      .then((nextModels) => {
        if (cancelled || !nextModels.length) return;
        setModels(nextModels);
        setModelListAvailable(true);
      })
      .catch(() => {
        if (!cancelled) setModelListAvailable(false);
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => { cancelled = true; };
  }, [apiKey, config?.apiMode, config?.baseUrl, initialModels.length]);

  function updateField(event) {
    const { name, value } = event.target;
    setFields((current) => ({ ...current, [name]: value }));
    setError("");
  }

  function startNewEndpoint() {
    setSelectedId("new");
    setFields({ providerName: "9router", baseUrl: DEFAULT_CHAT_ENDPOINT, apiKey: "", model: "" });
    setModels([]);
    setModelListAvailable(true);
    setVerifiedSignature("");
    setError("");
  }

  async function loadEndpoint(id) {
    if (id === "new") {
      startNewEndpoint();
      return;
    }
    setSelectedId(id);
    setProfileLoading(true);
    setError("");
    try {
      const response = await apiFetch(`/ai/client-config/${encodeURIComponent(id)}`);
      const result = await readApiResult(response, "Unable to load the saved endpoint.");
      const selected = result.data;
      setFields({
        providerName: selected.providerName,
        baseUrl: selected.baseUrl,
        apiKey: selected.apiKey,
        model: selected.model,
      });
      setModels([]);
      setModelListAvailable(false);
      setVerifiedSignature(JSON.stringify({
        providerId: selected.providerId,
        apiMode: selected.apiMode,
        baseUrl: selected.baseUrl,
        apiKey: selected.apiKey,
      }));
      setModelsLoading(true);
      try {
        const nextModels = await discoverProviderModelIds(
          selected.baseUrl,
          selected.apiMode,
          selected.apiKey,
        );
        setModels(nextModels);
        setModelListAvailable(nextModels.length > 0);
      } catch {
        setModels([]);
        setModelListAvailable(false);
      } finally {
        setModelsLoading(false);
      }
    } catch (profileError) {
      setError(profileError.message);
    } finally {
      setProfileLoading(false);
    }
  }

  const verifyEndpoint = useCallback(async () => {
    if (!verification.providerName || !verification.baseUrl || !verification.apiKey) {
      setError("Provider name, endpoint URL, and API key are required.");
      return;
    }

    setVerifying(true);
    setError("");
    try {
      const nextModels = await discoverProviderModelIds(
        verification.baseUrl,
        verification.apiMode,
        verification.apiKey,
      );
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
  }, [signature, verification.apiKey, verification.apiMode, verification.baseUrl, verification.providerName]);

  useEffect(() => {
    if (
      !verification.providerName
      || !verification.baseUrl
      || !verification.apiKey
      || verified
      || verifying
      || saving
      || profileLoading
      || autoVerificationSignature.current === signature
    ) return undefined;

    const timer = window.setTimeout(() => {
      autoVerificationSignature.current = signature;
      verifyEndpoint();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [profileLoading, saving, signature, verification.apiKey, verification.baseUrl, verification.providerName, verified, verifyEndpoint, verifying]);

  async function saveEndpoint(event) {
    event.preventDefault();
    if (!verified || !fields.model.trim()) return;

    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(selectedId === "new" ? "/ai/config" : `/ai/config/${encodeURIComponent(selectedId)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...verification, model: fields.model.trim(), models }),
      });
      if (response.status === 401) {
        window.location.replace("/");
        return;
      }
      const result = await readApiResult(response, "Unable to save the AI endpoint.");
      onSaved(
        result.data.isActive ? { ...result.data, apiKey: fields.apiKey, models } : null,
        result.profiles || profiles,
      );
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
      const response = await apiFetch(`/ai/config/${encodeURIComponent(selectedId)}`, { method: "DELETE" });
      if (response.status === 401) {
        window.location.replace("/");
        return;
      }
      const result = await readApiResult(response, "Unable to remove the AI endpoint.");
      onDeleted(result.data, result.profiles || []);
      onClose();
    } catch (removeError) {
      setRemoveOpen(false);
      setError(removeError.message);
    } finally {
      setRemoving(false);
    }
  }

  async function activateEndpoint() {
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(`/ai/config/${encodeURIComponent(selectedId)}/activate`, { method: "POST" });
      const result = await readApiResult(response, "Unable to activate the AI endpoint.");
      onSaved({ ...result.data, models }, result.profiles || profiles);
      onClose();
    } catch (activateError) {
      setError(activateError.message);
    } finally {
      setSaving(false);
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
        size="endpoint-manager"
        header={(
          <div className="flex items-start gap-3 border-b border-white/8 px-4 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-cyan-300/10 text-cyan-300"><Settings2 className="size-[18px]" /></span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-white">AI endpoint profiles</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-400">Create, edit, and choose the provider AI Chat uses.</p>
            </div>
            <button type="button" onClick={closeModal} className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Close dialog"><X className="size-5" /></button>
          </div>
        )}
      >
        <form onSubmit={saveEndpoint} className="flex max-h-[calc(100dvh-7rem)] min-h-0 flex-col">
          <div className="grid min-h-0 flex-1 md:grid-cols-[225px_minmax(0,1fr)]">
            <aside className="flex min-h-0 flex-col border-b border-white/8 bg-black/10 p-2.5 md:border-b-0 md:border-r">
              <label className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-[#071219] px-3 text-slate-500 focus-within:border-cyan-300/35">
                <Search className="size-4 shrink-0" />
                <input type="search" value={profileQuery} onChange={(event) => setProfileQuery(event.target.value)} placeholder="Search profiles..." className="min-w-0 flex-1 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600" />
              </label>
              <button type="button" onClick={startNewEndpoint} disabled={saving || verifying} className="mt-2 flex h-10 items-center justify-center gap-2 rounded-lg border border-cyan-300/25 text-xs font-medium text-cyan-200 transition hover:bg-cyan-300/[0.05] disabled:opacity-50"><Plus className="size-4" />New profile</button>
              <p className="mt-3 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Saved profiles</p>
              <div className="mt-2 min-h-0 space-y-2 overflow-y-auto md:flex-1">
                {filteredProfiles.map((profile) => (
                  <button key={profile.id} type="button" onClick={() => loadEndpoint(profile.id)} disabled={profileLoading || saving || verifying} className={`w-full rounded-lg border px-2.5 py-2 text-left transition disabled:opacity-50 ${selectedId === profile.id ? "border-cyan-300/60 bg-cyan-300/[0.07]" : "border-white/10 bg-[#071219]/70 hover:border-white/20"}`}>
                    <span className="flex items-center gap-2">
                      <i className={`size-2 shrink-0 rounded-full ${profile.status === "verified" ? "bg-emerald-300" : "bg-amber-300"}`} />
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-200">{profile.providerName}</span>
                      {profile.isActive && <span className="rounded-full bg-cyan-300/10 px-2 py-0.5 text-[9px] font-semibold text-cyan-200">Active</span>}
                    </span>
                    <span className="mt-1 block truncate pl-4 text-[10px] text-slate-500">{profile.baseUrl}</span>
                  </button>
                ))}
                {!filteredProfiles.length && <p className="px-2 py-6 text-center text-xs text-slate-500">No profiles found.</p>}
              </div>
              <p className="mt-3 px-1 text-[10px] text-slate-600">{profiles.length} profile{profiles.length === 1 ? "" : "s"}</p>
            </aside>

            <div className="min-h-0 overflow-y-auto p-3.5 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-white">{selectedId === "new" ? "Custom provider" : "Edit profile"}</h3>
                    {selectedProfile?.isActive && <span className="rounded-full bg-cyan-300/10 px-2 py-0.5 text-[9px] font-semibold text-cyan-200">Active</span>}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">{selectedId === "new" ? "Configure a new OpenAI-compatible endpoint." : "Update this saved provider configuration."}</p>
                </div>
                <button type="button" disabled={verifying || saving || !fields.apiKey} onClick={verifyEndpoint} className="flex h-9 items-center gap-2 rounded-lg border border-cyan-300/30 px-3 text-xs font-medium text-cyan-200 transition hover:bg-cyan-300/[0.05] disabled:opacity-50">
                  {verifying ? <LoaderCircle className="size-4 auth-spinner" /> : verified ? <Check className="size-4" /> : <ChevronRight className="size-4" />}
                  {verifying ? "Testing..." : "Test connection"}
                </button>
              </div>

              <div className="mt-3 grid gap-2.5">
                <Field label="Provider name" name="providerName" value={fields.providerName} onChange={updateField} autoComplete="off" className="h-10" />
                <Field label="Endpoint URL" name="baseUrl" type="url" value={fields.baseUrl} onChange={updateField} autoComplete="url" className="h-10" />
                <label className="block min-w-0">
                  <span className="mb-2 block text-xs text-slate-400">API key</span>
                  <div className="relative">
                    <input name="apiKey" type={showApiKey ? "text" : "password"} value={fields.apiKey} onChange={updateField} autoComplete="off" placeholder="Enter provider API key" className="form-control h-10 pr-12" />
                    <button type="button" onClick={() => setShowApiKey((visible) => !visible)} className="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-500 hover:text-slate-200" aria-label={showApiKey ? "Hide API key" : "Show API key"}>{showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
                  </div>
                  {!verified && !verifying && !error && <p className="mt-1.5 text-[10px] text-slate-500">Connection and models are checked automatically after you stop typing.</p>}
                </label>
              </div>

              {verified && <div className="mt-3 flex items-center justify-between rounded-lg border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-2 text-xs text-emerald-200"><span className="flex items-center gap-2"><Check className="size-4" />Endpoint verified</span><span className="text-[10px] text-emerald-300/70">Ready</span></div>}

              {verified && (
                <div className="mt-3">
                  {modelsLoading ? (
                    <div className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-[#071219] px-3 text-xs text-slate-400"><LoaderCircle className="size-4 auth-spinner text-cyan-300" />Discovering models...</div>
                  ) : (
                    <div>
                      <SelectField label="Model" name="model" value={fields.model} options={modelOptions} onChange={updateField} className="h-10" />
                      {!modelListAvailable && <p className="mt-1.5 flex items-center justify-between gap-3 text-[10px] text-slate-500"><span>Showing the saved model because discovery is temporarily unavailable.</span><button type="button" onClick={verifyEndpoint} disabled={verifying} className="shrink-0 font-medium text-cyan-300 hover:text-cyan-200">Retry models</button></p>}
                    </div>
                  )}
                </div>
              )}

              {error && <p role="alert" className="mt-3 rounded-lg border border-red-400/20 bg-red-400/[0.06] px-3 py-2 text-xs text-red-200">{error}</p>}
            </div>
          </div>

          <footer className="flex flex-col-reverse gap-2 border-t border-white/8 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-h-10">
              {selectedId !== "new" && (
                <button type="button" disabled={saving || verifying} onClick={() => setRemoveOpen(true)} className="h-10 rounded-lg px-3 text-sm text-red-300 hover:bg-red-400/[0.06]">
                  Remove endpoint
                </button>
              )}
            </div>
            <div className="flex gap-3">
              {selectedId !== "new" && !profiles.find((profile) => profile.id === selectedId)?.isActive && (
                <button type="button" onClick={activateEndpoint} disabled={saving || profileLoading} className="h-10 flex-1 rounded-lg border border-cyan-300/25 px-4 text-sm font-medium text-cyan-200 sm:flex-none">Use endpoint</button>
              )}
              <button type="button" onClick={closeModal} className="h-10 flex-1 rounded-lg border border-white/10 px-4 text-sm text-slate-300 sm:flex-none">Cancel</button>
              <button type="submit" disabled={!verified || !fields.model.trim() || saving} className="h-10 flex-1 rounded-lg bg-cyan-300 px-5 text-sm font-semibold text-[#001316] disabled:opacity-50 sm:flex-none">
                {saving ? "Saving..." : selectedId === "new" ? "Save new endpoint" : "Save changes"}
              </button>
            </div>
          </footer>
        </form>
      </Modal>

      {removeOpen && (
        <Modal title="Remove AI endpoint?" onClose={() => !removing && setRemoveOpen(false)}>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            This removes only this saved endpoint. If it is active, Vault switches to another saved endpoint when available. Conversations remain available.
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

function ChatCodeBlock({ children }) {
  const [copied, setCopied] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const codeElement = Array.isArray(children) ? children[0] : children;
  const className = codeElement?.props?.className || "";
  const language = className.match(/language-([^\s]+)/)?.[1] || "code";
  const code = String(codeElement?.props?.children ?? "").replace(/\n$/, "");
  const previewable = ["html", "htm"].includes(language.toLowerCase());

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyCode() {
    if (!navigator.clipboard || !code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="chat-ai-code-block">
      <div className="chat-ai-code-header">
        <span>{language}</span>
        <span className="flex items-center gap-1">{previewable && <button type="button" onClick={() => setPreviewOpen(true)} aria-label="Preview generated HTML"><Eye className="size-3.5" />Preview</button>}<button type="button" onClick={copyCode} className={copied ? "is-copied" : ""} aria-label={copied ? "Code copied" : "Copy code"}><span key={copied ? "copied" : "copy"} className="copy-feedback-icon">{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}</span>{copied ? "Copied" : "Copy"}</button></span>
      </div>
      <pre><code className={className}>{code}</code></pre>
      {previewOpen && <Modal title="Generated template preview" size="wide" onClose={() => setPreviewOpen(false)}><iframe title="Generated HTML preview" sandbox="allow-scripts" srcDoc={code} className="mt-4 h-[70dvh] w-full rounded-xl border border-white/10 bg-white" /></Modal>}
    </div>
  );
}

function ChatTable({ children }) {
  return <div className="chat-ai-table-wrap"><table>{children}</table></div>;
}

const chatMarkdownComponents = { pre: ChatCodeBlock, table: ChatTable };
const chatMarkdownPlugins = [remarkGfm];

const chatFileExtensions = new Set(["css", "csv", "html", "htm", "java", "js", "jsx", "json", "md", "php", "py", "rb", "rs", "sql", "svg", "toml", "ts", "tsx", "txt", "vue", "xml", "yaml", "yml"]);

async function readChatAttachments(fileList) {
  const files = [...fileList].slice(0, 5);
  const attachments = [];
  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "txt";
    if ((!file.type.startsWith("text/") && !chatFileExtensions.has(extension)) || file.size > 200 * 1024) {
      throw new Error(`${file.name} must be a text/code file smaller than 200 KB.`);
    }
    const content = await file.text();
    if (content.includes("\0")) throw new Error(`${file.name} is not a readable text file.`);
    attachments.push({ id: crypto.randomUUID(), name: file.name, language: extension, content, size: file.size });
  }
  if (attachments.reduce((total, file) => total + file.size, 0) > 500 * 1024) {
    throw new Error("Uploaded files must be 500 KB or less in total.");
  }
  return attachments;
}

function providerMessageWithAttachments(prompt, attachments) {
  if (!attachments.length) return prompt;
  const files = attachments.map((file) => `\n<uploaded_file name=${JSON.stringify(file.name)} language=${JSON.stringify(file.language)}>\n${file.content}\n</uploaded_file>`).join("\n");
  return `${prompt}\n\nThe user attached these files for this request:${files}`;
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
  const [profiles, setProfiles] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [composerDragging, setComposerDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [modelSaving, setModelSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newConversationActive, setNewConversationActive] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState(null);
  const [pendingToolAction, setPendingToolAction] = useState(null);
  const requestSequence = useRef(0);
  const composerRef = useRef(null);
  const attachmentInputRef = useRef(null);
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
      const startupSignal = AbortSignal.timeout(10000);
      const [configResponse, conversationsResponse] = await Promise.all([
        apiFetch("/ai/client-config", { signal: startupSignal }),
        apiFetch("/chat/conversations", { signal: startupSignal }),
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
      setProfiles(configResult.profiles || []);
      if (configResult.data) {
        const { apiKey, ...savedConfig } = configResult.data;
        setConfig(savedConfig);
        setClientApiKey(apiKey || "");
      } else {
        setConfig(null);
        setClientApiKey("");
        setAvailableModels([]);
      }
      setConversations(nextConversations);
      const firstId = nextConversations[0]?.id || "";
      setActiveConversationId(firstId);
      setLoading(false);

      const backgroundTasks = [loadMessages(firstId)];
      if (configResult.data) {
        const { apiKey, ...savedConfig } = configResult.data;
        backgroundTasks.push((async () => {
          try {
            const modelResponse = await fetch(providerUrl(savedConfig.baseUrl, "models"), {
              headers: providerHeaders(savedConfig.apiMode, apiKey),
              signal: AbortSignal.timeout(8000),
            });
            const modelResult = await readProviderResult(
              modelResponse,
              "Unable to discover provider models.",
            );
            setAvailableModels(normalizeProviderModels(modelResult));
          } catch {
            setAvailableModels([]);
          }
        })());
      }
      await Promise.all(backgroundTasks);
    } catch (loadError) {
      setError(loadError.name === "TimeoutError"
        ? "AI Chat startup timed out. Check the API connection and retry."
        : loadError.message);
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
    const prompt = draft.trim() || (attachments.length ? "Review the attached files." : "");
    if (!prompt || sending || !config || !clientApiKey) return;
    const sentAttachments = attachments;
    const attachmentNames = sentAttachments.map((file) => file.name).join(", ");
    const message = sentAttachments.length ? `${prompt}\n\nAttached: ${attachmentNames}` : prompt;
    const providerMessage = providerMessageWithAttachments(prompt, sentAttachments);

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
    setAttachments([]);
    setMessages((current) => [...current, optimisticUser]);
    requestAnimationFrame(() => composerRef.current?.focus());
    try {
      let imageUrl = "";
      let assistantContent;
      let toolActivity = [];
      const completion = await requestProviderCompletion(
        config,
        clientApiKey,
        history,
        providerMessage,
        imageModel,
        pendingToolAction,
        activeConversationId,
      );
      assistantContent = completion.content;
      toolActivity = completion.toolActivity;
      imageUrl = completion.imageUrl;
      setPendingToolAction(completion.pendingAction || null);
      const response = await apiFetch("/chat/exchanges", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message,
          assistantContent,
          providerName: config.providerName,
          model: config.model,
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
      setAttachments(sentAttachments);
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
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  async function addAttachments(fileList) {
    try {
      const next = await readChatAttachments(fileList);
      setAttachments((current) => [...current, ...next].slice(0, 5));
      setError("");
    } catch (uploadError) {
      setError(uploadError.message);
    }
  }

  function handleComposerDrop(event) {
    event.preventDefault();
    setComposerDragging(false);
    if (event.dataTransfer.files?.length) addAttachments(event.dataTransfer.files);
  }

  const imageModel = findImageModel(
    [config?.model, ...availableModels].filter(Boolean),
  );
  const modelOptions = profiles.flatMap((profile) => {
    const profileModels = [...new Set([
      profile.model,
      ...(profile.models || []),
      ...(profile.id === config?.id ? availableModels : []),
    ].filter(Boolean))];
    return profileModels.map((model) => ({
      value: profileModelValue(profile.id, model),
      label: `${profile.providerName} / ${model}`,
    }));
  });
  const selectedModelValue = config?.id && config?.model
    ? profileModelValue(config.id, config.model)
    : "";
  const modelTextClassName = balancedModelTextClass(modelOptions);
  const starterPrompts = [
    { text: "Create a new temporary email", icon: Mail },
    { text: "Show my active accounts", icon: Atom },
    { text: "Summarize unread email", icon: FileText },
    { text: "Show recent Vault activity", icon: Lightbulb },
  ];

  function chooseStarterPrompt(prompt) {
    setDraft(prompt);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function handleDraftChange(event) {
    setDraft(event.target.value);
    setHistoryOpen(false);
  }

  function handleConfigSaved(savedConfig, nextProfiles = profiles) {
    setProfiles(nextProfiles);
    if (!savedConfig) return;
    const { apiKey, models: discoveredModels, ...presentedConfig } = savedConfig;
    setConfig(presentedConfig);
    setClientApiKey(apiKey);
    setAvailableModels(discoveredModels || []);
  }

  function handleConfigDeleted(nextConfig, nextProfiles) {
    setProfiles(nextProfiles);
    if (nextConfig) {
      const { apiKey, ...presentedConfig } = nextConfig;
      setConfig(presentedConfig);
      setClientApiKey(apiKey || "");
    } else {
      setConfig(null);
      setClientApiKey("");
    }
    setAvailableModels([]);
  }

  async function selectChatModel(event) {
    const [profileId, model] = parseProfileModelValue(event.target.value);
    if (!profileId || !model || modelSaving) return;
    if (profileId === config?.id && model === config.model) return;
    setModelSaving(true);
    setError("");
    try {
      let targetConfig = config;
      let targetApiKey = clientApiKey;
      if (profileId !== config?.id) {
        const configResponse = await apiFetch(`/ai/client-config/${encodeURIComponent(profileId)}`);
        const configResult = await readApiResult(configResponse, "Unable to load the selected provider.");
        targetConfig = configResult.data;
        targetApiKey = targetConfig.apiKey;
      }
      const targetProfile = profiles.find((profile) => profile.id === profileId);
      const response = await apiFetch(`/ai/config/${encodeURIComponent(profileId)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerId: targetConfig.providerId,
          providerName: targetConfig.providerName,
          apiMode: targetConfig.apiMode,
          baseUrl: targetConfig.baseUrl,
          apiKey: targetApiKey,
          model,
          models: targetProfile?.models || targetConfig.models || [model],
          activate: profileId !== config?.id,
        }),
      });
      const result = await readApiResult(response, "Unable to change the active model.");
      const { apiKey, models: nextModels, ...savedConfig } = result.data;
      setConfig(savedConfig);
      setClientApiKey(apiKey || targetApiKey);
      setAvailableModels(nextModels || []);
      setProfiles(result.profiles || profiles);
    } catch (modelError) {
      setError(modelError.message);
    } finally {
      setModelSaving(false);
    }
  }

  return (
    <section className="chat-ai-page" aria-label="AI Chat">
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
                      <div className={`rounded-2xl px-5 py-4 ${message.imageUrl ? "max-w-[760px]" : message.role === "user" ? "max-w-[46%]" : message.content.includes("```") ? "max-w-[88%]" : "max-w-[64%]"} ${message.role === "user" ? "rounded-br-md bg-gradient-to-br from-cyan-300/[0.13] to-sky-500/[0.08] text-cyan-50" : "rounded-bl-md border border-cyan-100/10 bg-[#07121a]/90 text-slate-200"}`}>
                        <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-cyan-300/70"><span>{message.role === "user" ? "You" : message.providerName || "AI"}</span>{message.role !== "user" && message.model && <span className="max-w-48 truncate text-[9px] font-normal normal-case tracking-normal text-slate-500" title={message.model}>{message.model}</span>}</p>
                        <div className={`chat-ai-markdown ${message.role === "user" ? "chat-ai-markdown-user" : ""}`}>
                          <Markdown components={chatMarkdownComponents} remarkPlugins={chatMarkdownPlugins}>{message.content}</Markdown>
                        </div>
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
              {error && <div role="alert" className="mx-auto mb-2 flex max-w-[1200px] items-center justify-between gap-3 rounded-lg border border-red-400/20 bg-red-400/[0.06] px-3 py-2 text-sm text-red-200"><span>{error}</span>{(loading || !config) && <button type="button" onClick={loadPage} className="shrink-0 font-medium underline">Retry</button>}</div>}
              <div onDragEnter={(event) => { event.preventDefault(); setComposerDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setComposerDragging(false); }} onDrop={handleComposerDrop} className={`chat-ai-composer relative mx-auto max-w-[1200px] rounded-xl border bg-[#08141d]/95 p-4 transition ${composerDragging ? "border-cyan-300 bg-cyan-300/[0.04] shadow-[0_0_0_3px_rgba(34,211,238,0.08)]" : "border-cyan-100/15"}`}>
                <label className="sr-only" htmlFor="chat-ai-message">Type your message</label>
                {composerDragging && <div className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-lg border border-dashed border-cyan-300/50 bg-[#07141d]/95 text-sm font-medium text-cyan-200">Drop text or code files here</div>}
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
                {attachments.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{attachments.map((file) => <span key={file.id} className="flex h-8 max-w-56 items-center gap-2 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.05] px-2.5 text-xs text-slate-300"><FileText className="size-3.5 shrink-0 text-cyan-300" /><span className="truncate">{file.name}</span><button type="button" onClick={() => setAttachments((current) => current.filter((item) => item.id !== file.id))} className="text-slate-600 hover:text-white" aria-label={`Remove ${file.name}`}><X className="size-3.5" /></button></span>)}</div>}
                <div className="flex min-h-12 items-start gap-2">
                  <textarea id="chat-ai-message" ref={composerRef} value={draft} onChange={handleDraftChange} onKeyDown={handleComposerKeyDown} disabled={!config || sending} rows={1} placeholder={config ? "Type your message..." : "Configure an endpoint to start chatting"} className="max-h-32 min-h-12 min-w-0 flex-1 resize-none bg-transparent text-sm text-white outline-none placeholder:text-slate-500 disabled:cursor-not-allowed" />
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-slate-500">
                    <input ref={attachmentInputRef} type="file" multiple accept=".txt,.md,.json,.js,.jsx,.ts,.tsx,.html,.htm,.css,.py,.java,.php,.rb,.rs,.sql,.svg,.xml,.yaml,.yml,.toml,.vue,.csv,text/*" onChange={(event) => { addAttachments(event.target.files || []); event.target.value = ""; }} className="sr-only" />
                    <button type="button" onClick={() => attachmentInputRef.current?.click()} disabled={!config || sending || attachments.length >= 5} className="grid size-10 place-items-center rounded-lg border border-white/10 transition hover:border-cyan-300/25 hover:text-cyan-200 disabled:opacity-40" aria-label="Upload text or code files"><Paperclip className="size-4" /></button>
                    <button type="button" onClick={toggleNewConversation} className={`grid size-10 place-items-center rounded-lg border transition hover:border-cyan-300/25 hover:text-cyan-200 ${newConversationActive ? "border-cyan-300/35 bg-cyan-300/10 text-cyan-200 shadow-sm shadow-cyan-950/30" : "border-white/10"}`} aria-label="New conversation" aria-pressed={newConversationActive}><Plus className="size-4" /></button>
                    <button ref={historyButtonRef} type="button" onClick={() => setHistoryOpen((open) => !open)} className={`grid size-10 place-items-center rounded-lg border transition hover:border-cyan-300/25 hover:text-cyan-200 ${historyOpen ? "border-cyan-300/35 bg-cyan-300/10 text-cyan-200 shadow-sm shadow-cyan-950/30" : "border-white/10"}`} aria-label="Conversation history" aria-expanded={historyOpen} aria-pressed={historyOpen}>{historyOpen ? <History className="size-4" /> : <Globe2 className="size-4" />}</button>
                    <button type="button" onClick={() => setConfigOpen((open) => !open)} className={`grid size-10 place-items-center rounded-lg border transition hover:border-cyan-300/25 hover:text-cyan-200 ${configOpen ? "border-cyan-300/35 bg-cyan-300/10 text-cyan-200 shadow-sm shadow-cyan-950/30" : "border-white/10"}`} aria-label="Configure endpoint" aria-pressed={configOpen}><Settings2 className="size-4" /></button>
                  </div>
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="w-80 max-w-[45vw]">
                      <SelectField name="chatModel" value={selectedModelValue} options={modelOptions} onChange={selectChatModel} disabled={!config?.id || modelSaving || sending} ariaLabel="Select provider and AI model" textClassName={modelTextClassName} className="h-10 w-full text-slate-300" />
                    </div>
                    <button type="button" onClick={sendMessage} disabled={!config || (!draft.trim() && !attachments.length) || sending} aria-label="Send message" className="grid size-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-cyan-300 to-cyan-500 text-[#001316] shadow-md shadow-cyan-950/25 transition hover:from-cyan-200 hover:to-cyan-400 disabled:opacity-35">{sending ? <LoaderCircle className="size-4 auth-spinner" /> : <Send className="size-[18px]" />}</button>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-center text-[10px] text-slate-600">AI responses can be inaccurate. Verify important information.</p>
            </div>
          </div>
        )}
      </div>

      {configOpen && <EndpointModal config={config} profiles={profiles} apiKey={clientApiKey} initialModels={availableModels} onSaved={handleConfigSaved} onDeleted={handleConfigDeleted} onClose={() => setConfigOpen(false)} />}

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
