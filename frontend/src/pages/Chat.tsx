import { Bot, Send, Sparkles, User as UserIcon, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api, errorMessage, type AgentReply } from "../api";
import { PageHeader, inputClass } from "../components/ui";
import { useFetch } from "../useFetch";

interface Message {
  role: "user" | "agent";
  text: string;
  mode?: "gemini" | "offline";
  category?: string;
  sources?: string[];
}

const GREETING: Message = {
  role: "agent",
  text:
    "Ask me anything about this project. I answer from the project records only - requirements, " +
    "sprints, tasks, bugs, tests, deployments and the traceability matrix.",
};

export function Chat() {
  const suggestions = useFetch<{ questions: string[] }>("/ai/agent/suggestions");
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setMessages((previous) => [...previous, { role: "user", text: trimmed }]);
    setQuestion("");
    setBusy(true);
    try {
      const response = await api.post<AgentReply>("/ai/agent", {
        project_id: 1,
        question: trimmed,
      });
      setMessages((previous) => [
        ...previous,
        {
          role: "agent",
          text: response.data.answer,
          mode: response.data.mode,
          category: response.data.category,
          sources: response.data.sources,
        },
      ]);
    } catch (caught) {
      setMessages((previous) => [
        ...previous,
        { role: "agent", text: errorMessage(caught) },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="AI Project Agent"
        subtitle="Answers are built from sanitized project data - no credentials ever leave the database"
      />

      <div className="flex h-[32rem] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-2.5 ${message.role === "user" ? "justify-end" : ""}`}
            >
              {message.role === "agent" && (
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                  <Bot className="h-4 w-4" />
                </div>
              )}
              <div className={`max-w-[80%] ${message.role === "user" ? "order-first" : ""}`}>
                <div
                  className={`whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-sm ${
                    message.role === "user"
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {message.text}
                </div>
                {message.role === "agent" && message.mode && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${
                        message.mode === "gemini"
                          ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 bg-white text-slate-500"
                      }`}
                    >
                      {message.mode === "gemini" ? (
                        <Sparkles className="h-3 w-3" />
                      ) : (
                        <WifiOff className="h-3 w-3" />
                      )}
                      {message.mode === "gemini" ? "Gemini" : "Offline mode"}
                    </span>
                    {message.category && (
                      <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-400">
                        {message.category}
                      </span>
                    )}
                    {(message.sources ?? []).slice(0, 5).map((source) => (
                      <span
                        key={source}
                        className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-500"
                      >
                        {source}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {message.role === "user" && (
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600">
                  <UserIcon className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div className="flex gap-2.5">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-xl bg-slate-100 px-3.5 py-2.5 text-sm text-slate-400">
                Reading the project records...
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-slate-100 p-4">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {(suggestions.data?.questions ?? []).map((item) => (
              <button
                key={item}
                onClick={() => void ask(item)}
                disabled={busy}
                className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-500 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50"
              >
                {item}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void ask(question);
            }}
          >
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about sprints, bugs, tests, requirements..."
              className={inputClass}
            />
            <button
              type="submit"
              disabled={busy || !question.trim()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
