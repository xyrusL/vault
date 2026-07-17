# Chat Ai Design

## Goal

Add a dashboard tab named **Chat Ai** where an authenticated Vault user can configure the OpenAI-compatible 9router endpoint at `https://rgd2742.abc-tunnel.us/v1/` and hold persistent AI conversations. The page should closely follow the supplied dark cyan reference while remaining responsive and consistent with the existing dashboard.

## Scope

The feature includes:

- A `Chat Ai` sidebar item and dashboard page.
- A configuration modal with the 9router URL prefilled.
- Per-user API-key entry, encrypted by the existing Worker before database storage.
- Provider verification and model discovery through the existing AI API routes.
- Persistent conversation listing, selection, creation, and deletion.
- Persistent user and assistant messages.
- A multiline composer with keyboard and button submission.
- Loading, empty, unconfigured, and recoverable error states.

The first version does not include streaming, attachments, web browsing, voice input, editable system prompts, message editing, regeneration, or markdown rendering. Unsupported reference-image controls will not appear as nonfunctional decoration.

## Architecture

The existing backend already supplies the required secure boundary:

- `GET`, `PUT`, and `DELETE /v1/ai/config` manage a per-user provider configuration.
- `POST /v1/ai/verify` verifies credentials and discovers models.
- `/v1/chat/conversations` and nested message routes persist conversation history.
- `POST /v1/chat/completions` sends the latest message through the configured provider and persists both sides of the exchange.

The frontend will call these routes through the existing `apiFetch` utility. It will not contact 9router directly, place API credentials in browser storage, or add another backend abstraction.

A focused `ChatAiView` module will own chat-specific UI and state. `Dashboard` will only register and render the page, and `DashboardChrome` will only register its navigation item. Small internal components may remain in the chat module while they serve only this page; shared primitives such as `Modal`, `Field`, `SelectField`, and `PageTitle` will be reused.

## Endpoint Configuration

The configuration modal opens from the page action and from the unconfigured empty state. It contains:

- Provider name, defaulting to `9router`.
- Base URL, defaulting to `https://rgd2742.abc-tunnel.us/v1`.
- API mode fixed to `openai-compatible` for this integration.
- API key as a password field. The existing key is never returned to the browser, so saving requires entering a key.
- Model selection populated by verification. If the provider returns no discoverable model list, the user may enter a model identifier manually.

The modal first verifies the supplied endpoint and key, then allows model selection, then saves through `/ai/config`. A saved configuration may also be deleted after confirmation. Closing the modal discards unsaved secret input.

## Page Layout

The page follows the reference hierarchy:

1. A title block with the eyebrow `AI CHAT`, heading `Chat with AI`, supporting text, and `Configure endpoint` action.
2. An active-endpoint card showing provider name, selected model, online/verified status, OpenAI-compatible mode, and a `Change` action.
3. A large chat workspace.

On wide screens, the workspace contains a compact conversation rail and the active message area. The rail provides `New chat`, the persisted conversation list, and delete actions. The message area shows either the centered welcome state or alternating user and assistant message bubbles, followed by a composer anchored at the bottom.

On narrow screens, conversation history becomes a compact selector or collapsible area above the messages so the composer and current conversation remain primary. Touch targets remain at least 44 pixels.

The composer uses a textarea, a model label, and a cyan send button. `Enter` sends and `Shift+Enter` inserts a newline. Submission is disabled for an empty message, while a request is pending, or when no endpoint is configured.

## Data Flow

When the page mounts, it loads provider configuration and the conversation list in parallel.

- If no provider is configured, it shows the endpoint setup state.
- If conversations exist, it selects the most recently updated conversation and loads its messages.
- Selecting another conversation loads that conversation's messages.
- `New chat` clears the active conversation and shows the welcome state without creating an empty database row.
- Sending the first message omits `conversationId`; the completion response creates and returns the conversation.
- Sending subsequent messages includes the active conversation ID.
- After a successful completion, the frontend appends the user and assistant messages and refreshes/reorders the conversation list.
- Deleting the active conversation selects the next available conversation or returns to the welcome state.

The non-streaming behavior is intentional because the existing completion route returns one persisted assistant response. The UI shows a clear pending indicator until that response arrives.

## Error Handling

API errors are converted into concise inline messages while retaining user input whenever retry is useful.

- `401` follows the app's existing session behavior and redirects to sign-in.
- `409` for missing provider configuration opens or points to endpoint setup.
- Verification errors remain inside the configuration modal.
- Completion errors leave the composed message available for retry and do not fabricate a local persisted message.
- Conversation/message load failures show a retry action without breaking the dashboard shell.
- Deletion is confirmed before the irreversible API request.

The frontend will prefer the backend's JSON `error` value and use a safe generic fallback when unavailable.

## Security

The browser sends the API key only to Vault's authenticated Worker API. The Worker validates the HTTPS public endpoint, verifies the provider, encrypts the key with `CREDENTIALS_ENCRYPTION_KEY`, and stores only ciphertext and an IV. The key is not returned by configuration reads, logged, placed in URLs, or saved to local/session storage.

All chat and configuration routes remain scoped to the authenticated Vault user. The implementation will preserve the existing request-size, response-size, timeout, and SSRF protections.

## Testing and Validation

Focused automated tests will cover pure state or response-handling helpers introduced for the frontend where practical, plus route/source registration if that matches the repository's lightweight Node test style. The existing tests must continue to pass.

Implementation validation will include:

- `npm run lint`, as required by project instructions.
- The repository's test command or direct Node test runner because the package currently has no `test` script.
- An end-to-end browser exercise of navigation, endpoint configuration, model selection, conversation creation, message exchange, conversation restoration, deletion, responsive layout, and visible console/network errors.

A real 9router completion requires a valid user-supplied API key. If no credential is available during verification, the authenticated UI and failure handling will be exercised, and that limitation will be reported explicitly rather than claiming a successful upstream response.
