import { useEffect, useRef } from 'react'
import { setEnergy } from '../lib/beat'
import { bass } from '../lib/engine'
import { useSaver } from '../lib/saver'
import { usePlayer } from '../store/player'

// Domain-warped noise, tinted with three colours from the current cover.
// Energy from the music speeds up the warp and lifts the light.
const FRAG = `
precision mediump float;
uniform vec2 r;
uniform float t;
uniform float e;
uniform float s;
uniform vec3 c1;
uniform vec3 c2;
uniform vec3 c3;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
void main(){
  vec2 p=(gl_FragCoord.xy-.5*r)/r.y;
  p.y+=s;
  float tt=t*.035;
  vec2 q=vec2(fbm(p*1.3+tt),fbm(p*1.3-tt+3.1));
  vec2 w=vec2(fbm(p*1.1+2.2*q+vec2(1.7,9.2)+tt*1.6+e*.5),fbm(p*1.1+2.2*q+vec2(8.3,2.8)-tt*1.2));
  float f=fbm(p+2.6*w);
  vec3 col=mix(c1,c2,smoothstep(.25,.85,f));
  col=mix(col,c3,smoothstep(.5,1.,length(w)*.85));
  float core=smoothstep(1.3,0.,length(p-vec2(.25,.1)));
  col*=.18+.5*f*f+e*.28*core;
  col*=smoothstep(1.6,.15,length(p*vec2(.8,1.15)));
  col+=(h(gl_FragCoord.xy+fract(t))-.5)*.03;
  gl_FragColor=vec4(col,1.);
}`

const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** Fixed WebGL backdrop behind the app; moves above it while the full player is open. */
export function AuraField() {
  const ref = useRef<HTMLCanvasElement>(null)
  const fullOpen = usePlayer((s) => s.fullOpen)

  useEffect(() => {
    const canvas = ref.current!
    const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false })
    if (!gl) return
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      return sh
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const u = (name: string) => gl.getUniformLocation(prog, name)
    const U = { r: u('r'), t: u('t'), e: u('e'), s: u('s'), c1: u('c1'), c2: u('c2'), c3: u('c3') }

    // Render at reduced resolution; the blur-like noise doesn't need more.
    const SCALE = 0.4
    const resize = () => {
      canvas.width = Math.max(1, Math.round(innerWidth * SCALE))
      canvas.height = Math.max(1, Math.round(innerHeight * SCALE))
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()
    addEventListener('resize', resize)

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const cur = { c1: rgb('#1a1430'), c2: rgb('#ff3b5c'), c3: rgb('#5b3cff') }
    let energy = 0
    let raf = 0
    const start = performance.now()
    const main = document.querySelector('main')

    const frame = (now: number) => {
      const s = usePlayer.getState()
      const target = { c1: rgb(s.palette.base), c2: rgb(s.palette.accent), c3: rgb(s.palette.glow) }
      for (const k of ['c1', 'c2', 'c3'] as const) for (let i = 0; i < 3; i++) cur[k][i] += (target[k][i] - cur[k][i]) * 0.03
      const raw = s.isPlaying ? bass() : 0
      energy += (raw - energy) * 0.18
      setEnergy(energy)
      gl.uniform2f(U.r, canvas.width, canvas.height)
      gl.uniform1f(U.t, reduce ? 0 : (now - start) / 1000)
      gl.uniform1f(U.e, energy)
      gl.uniform1f(U.s, ((main?.scrollTop ?? 0) / innerHeight) * 0.12)
      gl.uniform3fv(U.c1, cur.c1)
      gl.uniform3fv(U.c2, cur.c2)
      gl.uniform3fv(U.c3, cur.c3)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    // Stop drawing while the tab is hidden or the screensaver is up.
    const onVis = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden && !useSaver.getState().on) raf = requestAnimationFrame(frame)
    }
    document.addEventListener('visibilitychange', onVis)
    const unsubSaver = useSaver.subscribe(onVis)
    return () => {
      unsubSaver()
      cancelAnimationFrame(raf)
      removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return <canvas ref={ref} className={`aura-field ${fullOpen ? 'is-front' : ''}`} aria-hidden="true" />
}
