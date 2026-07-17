export const DEFAULT_CHAT_ENDPOINT = "https://rgd2742.abc-tunnel.us/v1";

export async function readApiResult(response, fallback) {
  let result = {};
  try {
    result = await response.json();
  } catch {
    // Use the safe fallback below.
  }
  if (!response.ok) {
    const message = typeof result?.error === "string"
      ? result.error
      : result?.error?.message || fallback;
    throw new Error(message);
  }
  return result;
}

export function mergeConversation(conversations, conversation) {
  return [conversation, ...conversations.filter((item) => item.id !== conversation.id)];
}

export function chooseConversationAfterDelete(conversations, deletedId) {
  return conversations.find((item) => item.id !== deletedId)?.id || "";
}
