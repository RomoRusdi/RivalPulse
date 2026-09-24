import { ImageResponse } from "next/og";

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

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#FBFAF8",
          padding: 72,
          border: "16px solid #1F1E1C",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: "#E2650F",
            }}
          />
          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: "#1A1A1A",
            }}
          >
            RivalPulse
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 68,
              fontWeight: 800,
              letterSpacing: "-0.035em",
              lineHeight: 1.05,
              color: "#1A1A1A",
              maxWidth: 940,
            }}
          >
            Not just what competitors are doing — why it may matter.
          </div>
          <div style={{ fontSize: 30, color: "#4A4842", maxWidth: 900 }}>
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
            color: "#6B6862",
          }}
        >
          <div style={{ display: "flex", gap: 14 }}>
            <span
              style={{
                background: "#FCE9DC",
                color: "#B44F09",
                padding: "8px 18px",
                borderRadius: 99,
                fontWeight: 700,
              }}
            >
              Fact
            </span>
            <span
              style={{
                background: "#F2F0EC",
                color: "#4A4842",
                padding: "8px 18px",
                borderRadius: 99,
                fontWeight: 700,
              }}
            >
              Observed signal
            </span>
            <span
              style={{
                background: "#1F1E1C",
                color: "#FBFAF8",
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
