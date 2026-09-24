import { AlertCircle, Bot, User } from "lucide-react";

function MessageBubble({ message }) {
  const isUser = message.role === "user";

  if (message.loading) {
    return (
      <div className="flex gap-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-800">
          <Bot size={18} className="text-zinc-300" />
        </div>

        <div className="rounded-2xl rounded-tl-md border border-zinc-800 bg-zinc-900 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex gap-4 ${
        isUser ? "justify-end" : ""
      }`}
    >
      {!isUser && (
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            message.error
              ? "bg-zinc-800"
              : "bg-zinc-800"
          }`}
        >
          {message.error ? (
            <AlertCircle
              size={18}
              className="text-zinc-400"
            />
          ) : (
            <Bot
              size={18}
              className="text-zinc-300"
            />
          )}
        </div>
      )}

      <div
        className={[
          "max-w-2xl rounded-2xl px-4 py-3",
          isUser
            ? "rounded-br-md bg-zinc-800 text-zinc-100"
            : "rounded-tl-md border border-zinc-800 bg-zinc-900 text-zinc-300",
        ].join(" ")}
      >
        <div className="flex items-start gap-2">
          {isUser && (
            <User
              size={15}
              className="mt-0.5 shrink-0 text-zinc-500"
            />
          )}

          <p className="whitespace-pre-wrap text-sm leading-6">
            {message.content}
          </p>
        </div>
      </div>
    </div>
  );
}

export default MessageBubble;