"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fadeUp } from "@/lib/animations";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Good day. I'm Quinn, the AI CMO for Dermaqea.\n\nI can help with strategy, content, research, partnerships, and marketing. What would you like to discuss?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/quinn/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.content }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.response,
            timestamp: new Date(),
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "I encountered an error processing your request.",
            timestamp: new Date(),
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Unable to connect to the server. Ensure the API is running.",
          timestamp: new Date(),
        },
      ]);
    }
    setLoading(false);
  }

  return (
    <motion.div
      className="space-y-6 h-[calc(100vh-8rem)] flex flex-col"
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}
    >
      <motion.div variants={fadeUp}>
        <h1 className="text-3xl font-semibold tracking-tight text-[#EDE8E0]">
          Talk to Quinn
        </h1>
        <p className="text-[#A0988E] mt-2 text-sm">
          Direct conversation with your AI CMO.
        </p>
      </motion.div>

      <motion.div variants={fadeUp} className="flex-1 flex flex-col">
        <Card className="flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 p-6" ref={scrollRef}>
            <div className="space-y-5 max-w-3xl mx-auto">
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div
                    className={`rounded-xl px-4 py-3 max-w-[80%] leading-relaxed text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-white/[0.04] border border-white/[0.06] text-[#EDE8E0]/80"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <p
                      className={`text-[10px] mt-2 ${
                        msg.role === "user"
                          ? "text-primary-foreground/60"
                          : "text-[#A0988E]/50"
                      }`}
                    >
                      {msg.timestamp.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </motion.div>
              ))}
              {loading && (
                <div className="flex gap-3">
                  <div className="rounded-xl px-4 py-3 bg-white/[0.04] border border-white/[0.06]">
                    <span className="text-sm text-[#A0988E]">Quinn is thinking</span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="border-t border-white/[0.06] p-4 bg-white/[0.02]">
            <div className="flex gap-3 max-w-3xl mx-auto">
              <Textarea
                placeholder="Ask Quinn about Dermaqea's marketing..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                className="min-h-[44px] max-h-[140px] resize-none"
                rows={1}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="shrink-0"
              >
                Send
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}
