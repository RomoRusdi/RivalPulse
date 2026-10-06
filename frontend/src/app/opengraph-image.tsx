import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The social card. The one-minute teaser and social post are frontend
 * deliverables, and every share of the repo or demo link renders this — so it
 * carries the positioning line, not just a logo.
 *
 * Generated at build time; no runtime cost, no external assets.
 */
export const alt =
  "RivalPulse — AI competitive intelligence for Indonesian companies";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const logo = await readFile(path.join(process.cwd(), "public/brand/rivalpulse.png"));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f5f8f6",
          padding: 72,
          border: "16px solid #122d23",
        }}
      >
        <div style={{ display: "flex", width: 360, height: 72, overflow: "hidden", position: "relative" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="RivalPulse" src={`data:image/png;base64,${logo.toString("base64")}`} width={446} height={149} style={{ position: "absolute", left: -43, top: -34 }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 68,
              fontWeight: 800,
              letterSpacing: "-0.035em",
              lineHeight: 1.05,
              color: "#17352b",
              maxWidth: 940,
            }}
          >
            Not just what competitors are doing — why it may matter.
          </div>
          <div style={{ fontSize: 30, color: "#40584b", maxWidth: 900 }}>
            An AI competitive-intelligence agent for Indonesian public
            companies, grounded in verified Sectors financial data.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 24,
            color: "#56685e",
          }}
        >
          <div style={{ display: "flex", gap: 14 }}>
            <span
              style={{
                background: "#e6f3ec",
                color: "#0D503C",
                padding: "8px 18px",
                borderRadius: 99,
                fontWeight: 700,
              }}
            >
              Fact
            </span>
            <span
              style={{
                background: "#eef4f0",
                color: "#40584b",
                padding: "8px 18px",
                borderRadius: 99,
                fontWeight: 700,
              }}
            >
              Observed signal
            </span>
            <span
              style={{
                background: "#122d23",
                color: "#f5f8f6",
                padding: "8px 18px",
                borderRadius: 99,
                fontWeight: 700,
              }}
            >
              AI hypothesis
            </span>
          </div>
          <div>Sectors Hackathon 2026</div>
        </div>
      </div>
    ),
    size,
  );
}
