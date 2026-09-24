import { Send } from "lucide-react";
import { useState } from "react";

function ChatInput({ onSend, disabled = false }) {
  const [value, setValue] = useState("");

  const submit = () => {
    const message = value.trim();

    if (!message || disabled) {
      return;
    }

    onSend(message);
    setValue("");
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-2 shadow-2xl">
      <div className="flex items-end gap-2">
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder={
            disabled
              ? "RivalPulse is thinking..."
              : "Ask RivalPulse anything..."
          }
          className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-3 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed"
        />

        <button
          onClick={submit}
          disabled={!value.trim() || disabled}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Send message"
        >
          <Send size={17} />
        </button>
      </div>

      <div className="px-3 pb-1 pt-1">
        <p className="text-[10px] text-zinc-700">
          Enter to send · Shift + Enter for a new line
        </p>
      </div>
    </div>
  );
}

export default ChatInput;