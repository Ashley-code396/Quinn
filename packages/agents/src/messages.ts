import { BaseMessage } from "@langchain/core/messages";

export function getMessageType(msg: unknown): string {
  if (!msg) return "human";
  if (typeof (msg as BaseMessage)._getType === "function") {
    return (msg as BaseMessage)._getType();
  }
  return (msg as Record<string, unknown>)?.role as string ?? "human";
}

export function lastMessageType(messages: unknown[]): string {
  return getMessageType(messages[messages.length - 1]);
}
