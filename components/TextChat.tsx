"use client";

// Mount: <TextChat messages={msgs} onSend={send} /> where Coworker.tsx renders the "Type instead"
// form. The thread library loads on first use, so voice-only visits never download it.
import dynamic from "next/dynamic";

const TextChat = dynamic(() => import("@/components/TextChatThread"), {
  ssr: false,
  loading: () => <p className="text-[13px] text-soft">Opening the chat&hellip;</p>,
});

export default TextChat;
