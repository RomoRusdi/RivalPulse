"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The "faulty terminal" background on the sign-in panel.
 *
 * A grid of procedural 3x5 glyphs whose bits reshuffle over time, brightness
 * modulated by a drifting fBm field, plus scanlines, frame flicker, occasional
 * glitch bands, a red-channel offset, a vignette, and a glow that follows the
 * cursor.
 *
 * Ported from the prototype's vanilla custom element. The shader below is the
 * source of truth for the effect and is kept verbatim — treat it as an asset,
 * not as code to refactor.
 *
 * Decorative only: `aria-hidden`, `pointer-events: none`, and if WebGL is
 * unavailable nothing renders and the panel's solid colour shows through.
 */

const VERTEX_SHADER = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;

const FRAGMENT_SHADER = `precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec3 uTint; uniform vec3 uBg;
uniform vec2 uMouse; uniform float uMouseOn; uniform float uCell; uniform float uBright;
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float v=0.,a=.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.03; a*=.5; } return v; }
float glyphAt(vec2 frag, float t){
  vec2 id = floor(frag/uCell); vec2 cuv = fract(frag/uCell);
  vec2 gp = (cuv - vec2(.2,.14))/vec2(.6,.72);
  float inside = step(0.,gp.x)*step(gp.x,.999)*step(0.,gp.y)*step(gp.y,.999);
  vec2 px = floor(gp*vec2(3.,5.));
  float seed = floor(t*1.2 + hash(id)*12.);
  float bit = step(.46, hash(id*7.13 + px*1.71 + seed));
  vec2 p = id*.055; p.y -= t*.12;
  float n = fbm(p + fbm(p*1.4 + t*.04));
  float b = smoothstep(.38,.86,n);
  vec2 m = uMouse*uRes; float md = length(frag - m)/uRes.y;
  b += .7*exp(-md*md*14.)*uMouseOn;
  return bit*inside*b;
}
void main(){
  vec2 frag = gl_FragCoord.xy; vec2 uv = frag/uRes; float t = uTime;
  float band = floor(uv.y*28.);
  float g = step(.982, hash(vec2(band, floor(t*7.))));
  frag.x += g*(hash(vec2(band,floor(t*30.)))-.5)*uCell*3.;
  float r = glyphAt(frag + vec2(1.5,0.), t);
  float c = glyphAt(frag, t);
  float fl = .9 + .1*hash(vec2(floor(t*20.),3.));
  float scan = .82 + .18*sin(gl_FragCoord.y*1.6);
  float v = clamp(c*fl*scan*uBright, 0., 1.);
  vec3 col = mix(uBg, uTint, v);
  col.r = mix(col.r, mix(uBg.r, uTint.r, clamp(r*fl*scan*uBright,0.,1.)), .5);
  vec2 q = uv-.5; col *= 1. - dot(q,q)*.7;
  gl_FragColor = vec4(col,1.);
}`;

/** "#E2650F" -> [r, g, b] in 0..1 */
function toRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

export function FaultyTerminal({
  tint = "#E2650F",
  bg = "#1F1E1C",
  cell = 14,
  brightness = 1,
}: {
  tint?: string;
  bg?: string;
  cell?: number;
  brightness?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Mount after first paint so the shader never delays the sign-in form.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      antialias: false,
      premultipliedAlpha: false,
    });
    // No WebGL: leave the canvas blank and let the panel colour show.
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      return shader;
    };

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const attr = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(attr);
    gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0);

    const u = {
      res: gl.getUniformLocation(program, "uRes"),
      time: gl.getUniformLocation(program, "uTime"),
      tint: gl.getUniformLocation(program, "uTint"),
      bg: gl.getUniformLocation(program, "uBg"),
      mouse: gl.getUniformLocation(program, "uMouse"),
      mouseOn: gl.getUniformLocation(program, "uMouseOn"),
      cell: gl.getUniformLocation(program, "uCell"),
      bright: gl.getUniformLocation(program, "uBright"),
    };

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const mouse = { x: 0.5, y: 0.5, on: 0, target: 0 };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, rect.width * dpr);
      canvas.height = Math.max(1, rect.height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    // The canvas is pointer-events:none, so track the cursor on window.
    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = 1 - (e.clientY - rect.top) / rect.height;
      mouse.target = x >= 0 && x <= 1 && y >= 0 && y <= 1 ? 1 : 0;
      if (mouse.target) {
        mouse.x = x;
        mouse.y = y;
      }
    };
    window.addEventListener("pointermove", onPointerMove);

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const started = performance.now();
    let frameId = 0;
    let running = true;

    const draw = (now: number) => {
      mouse.on += (mouse.target - mouse.on) * 0.08;
      gl.uniform2f(u.res, canvas.width, canvas.height);
      // Reduced motion: one static frame at a fixed point in the animation.
      gl.uniform1f(u.time, reduceMotion ? 4 : (now - started) / 1000);
      gl.uniform3fv(u.tint, toRgb(tint));
      gl.uniform3fv(u.bg, toRgb(bg));
      gl.uniform2f(u.mouse, mouse.x, mouse.y);
      gl.uniform1f(u.mouseOn, mouse.on);
      gl.uniform1f(u.cell, cell * dpr);
      gl.uniform1f(u.bright, brightness);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduceMotion && running) frameId = requestAnimationFrame(draw);
    };
    frameId = requestAnimationFrame(draw);

    // Don't burn GPU on a tab nobody is looking at.
    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(frameId);
      } else if (!reduceMotion && !running) {
        running = true;
        frameId = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ready, tint, bg, cell, brightness]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 block h-full w-full"
    />
  );
}
