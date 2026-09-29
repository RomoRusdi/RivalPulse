# -*- coding: utf-8 -*-
"""Generate an n8n-style canvas diagram of the RivalPulse agent workflow.

Run:  python docs/build_workflow_svg.py
Out:  docs/agent-workflow.svg
"""
import pathlib
from html import escape as esc

W, H = 1680, 1180
NW, NH = 260, 66
CW, CH = 205, 38
ROWS = [140, 450, 800]
COLS = [50, 380, 710, 1040, 1370]

TYPES = {
    "trigger": ("#22c55e", "&#9655;"),
    "router": ("#f59e0b", "&#8646;"),
    "llm": ("#a855f7", "&#10022;"),
    "tool": ("#3b82f6", "&#9881;"),
    "store": ("#14b8a6", "&#9707;"),
    "guard": ("#ef4444", "&#9888;"),
    "out": ("#6366f1", "&#9993;"),
}
p = []
add = p.append


def node(x, y, kind, title, sub, num=None):
    color, glyph = TYPES[kind]
    add(f'<g><rect x="{x}" y="{y}" width="{NW}" height="{NH}" rx="9" fill="#ffffff" '
        f'stroke="#c9ccd4" stroke-width="1.4" filter="url(#sh)"/>')
    add(f'<path d="M{x} {y + 9} a9,9 0 0 1 9,-9 h38 v{NH} h-38 a9,9 0 0 1 -9,-9 z" fill="{color}" opacity="0.14"/>')
    add(f'<rect x="{x}" y="{y}" width="4" height="{NH}" rx="2" fill="{color}"/>')
    add(f'<text x="{x + 27}" y="{y + NH / 2 + 7}" font-size="19" text-anchor="middle" fill="{color}">{glyph}</text>')
    add(f'<text x="{x + 58}" y="{y + 26}" font-size="13.5" font-weight="650" fill="#22242b">{esc(title)}</text>')
    for i, line in enumerate(sub):
        add(f'<text x="{x + 58}" y="{y + 43 + i * 14}" font-size="10.5" fill="#787b86">{esc(line)}</text>')
    if num is not None:
        add(f'<circle cx="{x + NW - 15}" cy="{y + 15}" r="10.5" fill="#22242b"/>'
            f'<text x="{x + NW - 15}" y="{y + 19}" font-size="11" font-weight="700" '
            f'text-anchor="middle" fill="#fff">{num}</text>')
    add('</g>')


def chip(x, y, color, title, sub):
    add(f'<g><rect x="{x}" y="{y}" width="{CW}" height="{CH}" rx="7" fill="#ffffff" '
        f'stroke="#d7dae1" stroke-dasharray="4 3"/>')
    add(f'<circle cx="{x + 15}" cy="{y + CH / 2}" r="4.5" fill="{color}"/>')
    add(f'<text x="{x + 28}" y="{y + 16}" font-size="11" font-weight="600" fill="#33353d">{esc(title)}</text>')
    add(f'<text x="{x + 28}" y="{y + 29}" font-size="9.2" fill="#8a8d97">{esc(sub)}</text></g>')


def link(x1, y1, x2, y2, dash=False, label=None):
    dx = max(40, abs(x2 - x1) * 0.45)
    style = ' stroke-dasharray="5 4"' if dash else ''
    add(f'<path d="M{x1},{y1} C{x1 + dx},{y1} {x2 - dx},{y2} {x2},{y2}" fill="none" '
        f'stroke="#9ea1ab" stroke-width="2"{style} marker-end="url(#ar)"/>')
    if label:
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2 - 9
        wd = 8.5 * len(label) + 16
        add(f'<rect x="{mx - wd / 2}" y="{my - 12}" width="{wd}" height="19" rx="9.5" '
            f'fill="#fff" stroke="#d7dae1"/>'
            f'<text x="{mx}" y="{my + 1.5}" font-size="10.5" text-anchor="middle" fill="#5c5f69">{esc(label)}</text>')


def wrap(x1, y1, x2, y2, lane):
    r = 14
    d = (f"M{x1},{y1} H{W - 45 - r} Q{W - 45},{y1} {W - 45},{y1 + r} V{lane - r} "
         f"Q{W - 45},{lane} {W - 45 - r},{lane} H{35 + r} Q{35},{lane} {35},{lane - r} "
         f"V{y2 + r} Q{35},{y2} {35 + r},{y2} H{x2}")
    add(f'<path d="{d}" fill="none" stroke="#9ea1ab" stroke-width="2" marker-end="url(#ar)"/>')


add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
    f'font-family="Inter,Segoe UI,system-ui,sans-serif">')
add('<defs>'
    '<pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">'
    '<circle cx="1.6" cy="1.6" r="1.4" fill="#d5d8e0"/></pattern>'
    '<marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
    'orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#9ea1ab"/></marker>'
    '<filter id="sh" x="-20%" y="-20%" width="140%" height="150%">'
    '<feDropShadow dx="0" dy="1.5" stdDeviation="2.2" flood-color="#1b1d24" flood-opacity="0.10"/></filter>'
    '</defs>')
add(f'<rect width="{W}" height="{H}" fill="#f5f6f8"/><rect width="{W}" height="{H}" fill="url(#dots)"/>')
add('<text x="50" y="42" font-size="21" font-weight="750" fill="#1b1d24">RivalPulse &#8212; agent workflow</text>')
add('<text x="50" y="64" font-size="11.5" fill="#787b86">'
    'Chat request to cited, immutable signal. Every stage is recorded as a run step and visible in run history.</text>')

R1, R2, R3 = ROWS
mid = R1 + NH / 2
mid2 = R2 + NH / 2
mid3 = R3 + NH / 2

node(COLS[0], R1, "trigger", "User message", ["AgentWorkspace chat", "natural-language goal"])
node(COLS[1], R1, "router", "Intent router", ["agent-router.ts", "instant vs. research"])
node(COLS[2], R1, "store", "Create run", ["freeze companies + sources", "pick baseline run"])
node(COLS[3], R1, "store", "Enqueue to worker", ["Redis / RQ, lease token", "reconciler fences strays"])
node(COLS[4], R1, "guard", "validate", ["frozen inputs loaded"], num=1)
node(COLS[1], 25, "out", "Instant workspace action", ["add / remove / rename / list", "0 credits, 0 provider calls"])

link(COLS[0] + NW, mid, COLS[1], mid)
link(COLS[1] + NW / 2, R1, COLS[1] + NW / 2, 25 + NH, label="workspace command")
link(COLS[1] + NW, mid, COLS[2], mid, label="analytical")
link(COLS[2] + NW, mid, COLS[3], mid)
link(COLS[3] + NW, mid, COLS[4], mid)
wrap(COLS[4] + NW, mid, COLS[0], mid2, 300)

node(COLS[0], R2, "llm", "plan", ["route + typed tool plan", "records planner and reason"], num=2)
node(COLS[1], R2, "tool", "collect", ["bounded tools; credits", "reserved before each call"], num=3)
node(COLS[2], R2, "router", "recover", ["diagnose evidence gaps", "re-plan on what returned"], num=4)
node(COLS[3], R2, "store", "compare", ["diff against baseline run", "baseline/new/updated/unchanged"], num=5)
node(COLS[4], R2, "llm", "analyze", ["claim IDs and text only", "no numbers, no URLs"], num=6)

chip(COLS[0], 560, "#a855f7", "Qwen proposes plan", "structured output, one repair attempt")
chip(COLS[0], 606, "#ef4444", "validated_fallback", "invalid plan to deterministic, recorded")
chip(COLS[1], 560, "#3b82f6", "get_company_metrics", "Sectors v2 report (live only)")
chip(COLS[1], 606, "#3b82f6", "get_recent_signals", "approved pages, SSRF-guarded")
chip(COLS[1], 652, "#22c55e", "get_company_news", "Sectors news, live mode")
chip(COLS[2], 560, "#f59e0b", "gap recoverable?", "re-read remaining approved pages")
chip(COLS[2], 606, "#f59e0b", "not recoverable", "reason recorded; no retry, no spend")

for cy in (560, 606):
    link(COLS[0] + NW / 2, R2 + NH, COLS[0] + CW / 2, cy, dash=True)
    link(COLS[2] + NW / 2, R2 + NH, COLS[2] + CW / 2, cy, dash=True)
for cy in (560, 606, 652):
    link(COLS[1] + NW / 2, R2 + NH, COLS[1] + CW / 2, cy, dash=True)

link(COLS[0] + NW, mid2, COLS[1], mid2)
link(COLS[1] + NW, mid2, COLS[2], mid2)
link(COLS[2] + NW, mid2, COLS[3], mid2, label="gaps closed or explained")
link(COLS[3] + NW, mid2, COLS[4], mid2)
wrap(COLS[4] + NW, mid2, COLS[0], mid3, 730)

node(COLS[0], R3, "guard", "validate_output", ["citations resolve", "excerpts verified in snapshot"], num=7)
node(COLS[1], R3, "store", "persist", ["one transaction + advisory lock", "immutable Signal + Revision"], num=8)
node(COLS[2], R3, "out", "Gmail digest", ["new / updated at or above", "the severity threshold only"])
node(COLS[3], R3, "out", "Signals and dashboards", ["cited cards, evidence ledger", "financial context"])
link(COLS[0] + NW, mid3, COLS[1], mid3)
link(COLS[1] + NW, mid3, COLS[2], mid3)
link(COLS[2] + NW, mid3, COLS[3], mid3)

gx, gy = COLS[4], R3 - 8
add(f'<rect x="{gx}" y="{gy}" width="{NW}" height="132" rx="9" fill="#fffdf6" stroke="#e8d9a8"/>')
add(f'<text x="{gx + 14}" y="{gy + 22}" font-size="12" font-weight="700" fill="#7a5c11">Hard limits on every run</text>')
for i, t in enumerate(["180 s deadline, 3 attempts max",
                       "12 external calls, 16 credits",
                       "fewer than 3 LLM calls",
                       "credits reserved before the call",
                       "model cannot emit numbers or URLs",
                       "model cannot write to the database"]):
    add(f'<text x="{gx + 14}" y="{gy + 42 + i * 15}" font-size="10" fill="#8a6d1c">&#8226; {esc(t)}</text>')

add(f'<text x="50" y="{H - 52}" font-size="10.5" font-weight="700" fill="#5c5f69">NODE TYPES</text>')
for i, (kind, label) in enumerate([("trigger", "input"), ("router", "routing / logic"), ("llm", "LLM step"),
                                   ("tool", "external tool"), ("store", "database"),
                                   ("guard", "validation gate"), ("out", "output")]):
    x = 145 + i * 152
    add(f'<rect x="{x}" y="{H - 62}" width="11" height="11" rx="3" fill="{TYPES[kind][0]}"/>'
        f'<text x="{x + 17}" y="{H - 52.5}" font-size="10.5" fill="#787b86">{esc(label)}</text>')
add(f'<text x="50" y="{H - 26}" font-size="10" fill="#9a9da6">'
    'Dashed connectors are sub-steps of their parent node. Steps 1&#8211;8 map to STAGES in backend/app/research.py.</text>')
add('</svg>')

out = pathlib.Path(__file__).resolve().parent / "agent-workflow.svg"
out.write_text("\n".join(p), encoding="utf-8")
print("wrote", out)
