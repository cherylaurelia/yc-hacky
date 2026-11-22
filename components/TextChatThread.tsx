"use client";

// The "Type instead" chat: an assistant-ui thread over the live ElevenLabs conversation. The
// transcript from useCoworker is the store, and a new message goes through useCoworker's send,
// so the agent, its tools and the board alerts behave as they do by voice. Load it through
// components/TextChat.tsx, which keeps this chunk out of the first page load.
import { AssistantRuntimeProvider, ComposerPrimitive, MessagePrimitive, ThreadPrimitive, type ThreadMessageLike, useExternalStoreRuntime } from "@assistant-ui/react";
import type { Msg } from "@/components/useCoworker";

const toThreadMessage = (m: Msg): ThreadMessageLike => ({ id: String(m.id), role: m.role === "agent" ? "assistant" : "user", content: [{ type: "text", text: m.text }] });

export default function TextChatThread({ messages, onSend }: { messages: readonly Msg[]; onSend: (text: string) => void }) {
  const runtime = useExternalStoreRuntime<Msg>({
    messages,
    convertMessage: toThreadMessage,
    // The agent answers after the user's line: until it does, the thread shows a pending reply.
    isRunning: messages.at(-1)?.role === "user",
    onNew: async (m) => {
      const part = m.content[0];
      if (part?.type !== "text") throw new Error("Only text can be sent here.");
      onSend(part.text);
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex w-full max-w-md flex-col gap-2">
        <ThreadPrimitive.Viewport className="flex max-h-72 min-h-16 flex-col gap-2 overflow-y-auto px-1 py-1 text-[14px] leading-snug">
          <ThreadPrimitive.Empty>
            <p className="py-3 text-center text-soft">Ask about the repo, or tell me what to do with an agent&rsquo;s request.</p>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages>{({ message }) => (message.role === "user" ? <UserMessage /> : <AgentMessage />)}</ThreadPrimitive.Messages>
        </ThreadPrimitive.Viewport>

        <ComposerPrimitive.Root className="flex items-end gap-2 rounded-3xl bg-ink p-1.5 pl-5">
          <ComposerPrimitive.Input
            autoFocus
            rows={1}
            aria-label="Message"
            placeholder="Type to your coworker"
            className="max-h-28 min-w-0 flex-1 resize-none self-center bg-transparent py-1.5 text-[15px] text-paper outline-none placeholder:text-paper/60"
          />
          <ComposerPrimitive.Send className="h-9 shrink-0 rounded-full bg-paper px-4 text-sm font-semibold text-ink disabled:opacity-40">Send</ComposerPrimitive.Send>
        </ComposerPrimitive.Root>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="max-w-[85%] self-end whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-chip px-3.5 py-2 text-ink">
      <span className="sr-only">You: </span>
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  );
}

function AgentMessage() {
  return (
    <MessagePrimitive.Root className="max-w-[90%] self-start whitespace-pre-wrap break-words rounded-2xl rounded-bl-md border border-line bg-card px-3.5 py-2 text-ink">
      <span className="sr-only">Terminal 1: </span>
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  );
}
