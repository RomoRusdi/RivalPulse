"use client";
import { useState } from "react";
/** Fade received append-only chunks; replacements reset, with no simulated typing. */
export function ReceivedText({ text }: { text: string }) {
  const [received, setReceived] = useState({ text, chunks: [text] });
  if (received.text !== text) setReceived({ text, chunks: text.startsWith(received.text) ? [...received.chunks, text.slice(received.text.length)] : [text] });
  return <>{received.chunks.map((chunk, index) => <span key={`${index}-${chunk}`} className="rp-text-chunk">{chunk}</span>)}</>;
}
