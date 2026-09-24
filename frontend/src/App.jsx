import {
  Activity,
  Bot,
  ChevronDown,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { useEffect, useRef, useState } from "react";

import ChatInput from "./components/ChatInput";
import MessageBubble from "./components/MessageBubble";
import QuickPrompt from "./components/QuickPrompt";
import ResearchResult from "./components/ResearchResult";
import SuggestedQuestions from "./components/SuggestedQuestions";

import { sendChatMessage } from "./services/api";

const quickPrompts = [
  {
    type: "compare",
    title: "Compare ISAT vs TLKM",
    description:
      "Analyze financial performance and competitive signals.",
    message: "Compare ISAT with TLKM.",
  },
  {
    type: "analyze",
    title: "Analyze ISAT",
    description:
      "Get a structured company research overview.",
    message: "Analyze ISAT.",
  },
  {
    type: "signals",
    title: "Find competitive signals",
    description:
      "Identify meaningful differences between companies.",
    message:
      "Find competitive signals for ISAT against TLKM.",
  },
  {
    type: "marketing",
    title: "Marketing implications",
    description:
      "Turn research findings into marketing insights.",
    message:
      "What are the marketing implications for ISAT?",
  },
];

function App() {
  const [messages, setMessages] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const [lastResearchResult, setLastResearchResult] =
    useState(null);

  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, isThinking]);

  const handleSend = async (question) => {
    const trimmedQuestion = question.trim();

    if (!trimmedQuestion || isThinking) {
      return;
    }

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedQuestion,
    };

    const history = messages
      .filter(
        (message) =>
          message.role === "user" ||
          message.role === "assistant"
      )
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));

    setMessages((current) => [
      ...current,
      userMessage,
    ]);

    setIsThinking(true);

    try {
      console.log(
        "[RivalPulse] Sending message:",
        trimmedQuestion
      );

      const response = await sendChatMessage({
        message: trimmedQuestion,
        history,
        previousResult: lastResearchResult,
      });

      console.log(
        "[RivalPulse] Backend response:",
        response
      );

      const assistantMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          response.message ||
          "I didn't receive a response from the AI.",
        suggestions: response.suggestions || [],
        researchResult:
          response.research_result || null,
      };

      setMessages((current) => [
        ...current,
        assistantMessage,
      ]);

      if (response.research_result) {
        setLastResearchResult(
          response.research_result
        );
      }

    } catch (error) {
      console.error(
        "[RivalPulse] Chat request failed:",
        error
      );

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          error: true,
          content:
            error.message ||
            "Something went wrong while processing your message.",
        },
      ]);

    } finally {
      setIsThinking(false);
    }
  };

  const handleNewConversation = () => {
    setMessages([]);
    setLastResearchResult(null);
    setIsThinking(false);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100">

      {/* Sidebar */}
      <aside className="hidden w-72 flex-col border-r border-zinc-800 bg-zinc-950 md:flex">

        <div className="flex h-16 items-center border-b border-zinc-800 px-5">
          <div className="flex items-center gap-3">

            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-black">
              <Activity size={19} />
            </div>

            <div>
              <h1 className="text-sm font-semibold tracking-tight">
                RivalPulse
              </h1>

              <p className="text-[11px] text-zinc-500">
                Competitive Intelligence
              </p>
            </div>

          </div>
        </div>

        <div className="p-4">
          <button
            onClick={handleNewConversation}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-zinc-200"
          >
            <Plus size={16} />
            New conversation
          </button>
        </div>

        <div className="px-3">

          <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wider text-zinc-600">
            Today
          </p>

          {messages.length > 0 && (
            <button className="flex w-full items-center gap-3 rounded-lg bg-zinc-900 px-3 py-2.5 text-left text-sm text-zinc-200">

              <MessageSquare
                size={15}
                className="text-zinc-500"
              />

              <div className="min-w-0 flex-1">

                <p className="truncate">
                  Current conversation
                </p>

                <p className="mt-0.5 text-[11px] text-zinc-600">
                  Active conversation
                </p>

              </div>

            </button>
          )}

        </div>

        <div className="mt-8 px-3">

          <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wider text-zinc-600">
            Explore
          </p>

          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-300">
            <TrendingUp size={15} />
            Market signals
          </button>

          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-300">
            <Search size={15} />
            Research companies
          </button>

        </div>

        <div className="mt-auto border-t border-zinc-800 p-4">

          <div className="flex items-center justify-between rounded-lg bg-zinc-900 px-3 py-2.5">

            <div className="flex items-center gap-2">

              <div className="h-2 w-2 rounded-full bg-emerald-500" />

              <span className="text-xs text-zinc-400">
                Agent online
              </span>

            </div>

            <ChevronDown
              size={14}
              className="text-zinc-600"
            />

          </div>

        </div>

      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col">

        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b border-zinc-800 px-5 md:px-8">

          <div>

            <h2 className="text-sm font-semibold">
              RivalPulse AI
            </h2>

            <p className="hidden text-xs text-zinc-600 sm:block">
              Competitive intelligence assistant
            </p>

          </div>

          <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5">

            <Sparkles
              size={13}
              className="text-zinc-400"
            />

            <span className="text-xs text-zinc-500">
              Qwen AI Agent
            </span>

          </div>

        </header>

        {/* Chat */}
        <div className="flex flex-1 flex-col overflow-hidden">

          <div className="flex-1 overflow-y-auto">

            <div className="mx-auto max-w-4xl px-5 py-10 md:px-8">

              {/* Empty state */}
              {messages.length === 0 && (
                <>

                  <div className="mb-10 flex gap-4">

                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-800">

                      <Bot
                        size={18}
                        className="text-zinc-300"
                      />

                    </div>

                    <div className="max-w-2xl">

                      <h3 className="mb-2 text-lg font-semibold">
                        What would you like to research?
                      </h3>

                      <p className="text-sm leading-6 text-zinc-500">
                        Ask RivalPulse anything about
                        companies, competitors, financial
                        performance, signals, news, or
                        marketing implications.
                      </p>

                    </div>

                  </div>

                  <div className="mb-12 grid gap-3 sm:grid-cols-2">

                    {quickPrompts.map((prompt) => (

                      <QuickPrompt
                        key={prompt.type}
                        type={prompt.type}
                        title={prompt.title}
                        description={prompt.description}
                        onClick={() =>
                          handleSend(prompt.message)
                        }
                      />

                    ))}

                  </div>

                </>
              )}

              {/* Messages */}
              {messages.length > 0 && (

                <div className="space-y-8">

                  {messages.map((message) => (

                    <div key={message.id}>

                      <MessageBubble
                        message={message}
                      />

                      {message.role === "assistant" &&
                        message.suggestions?.length > 0 && (

                          <div className="ml-0 sm:ml-13">

                            <SuggestedQuestions
                              suggestions={
                                message.suggestions
                              }
                              onSelect={handleSend}
                            />

                          </div>

                        )}

                      {message.researchResult && (

                        <div className="ml-0 sm:ml-13">

                          <ResearchResult
                            result={
                              message.researchResult
                            }
                          />

                        </div>

                      )}

                    </div>

                  ))}

                  {isThinking && (

                    <MessageBubble
                      message={{
                        role: "assistant",
                        loading: true,
                      }}
                    />

                  )}

                </div>

              )}

              <div ref={chatEndRef} />

            </div>

          </div>

          {/* Input */}
          <div className="border-t border-zinc-800 bg-zinc-950 px-4 py-4 md:px-8">

            <div className="mx-auto max-w-4xl">

              <ChatInput
                onSend={handleSend}
                disabled={isThinking}
              />

            </div>

          </div>

        </div>

      </main>

    </div>
  );
}

export default App;