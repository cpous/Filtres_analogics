// Continuous-time analog transfer functions, evaluated without a digital filter.
const TAU = 2 * Math.PI;
export const C = (re = 0, im = 0) => ({re, im});
const add = (a,b) => C(a.re+b.re,a.im+b.im);
const sub = (a,b) => C(a.re-b.re,a.im-b.im);
const mul = (a,b) => C(a.re*b.re-a.im*b.im,a.re*b.im+a.im*b.re);
const scale = (a,k) => C(a.re*k,a.im*k);
const div = (a,b) => {const d=b.re*b.re+b.im*b.im;return C((a.re*b.re+a.im*b.im)/d,(a.im*b.re-a.re*b.im)/d);};
const exp = a => scale(C(Math.cos(a.im),Math.sin(a.im)),Math.exp(a.re));
const sqrt = a => {const r=Math.hypot(a.re,a.im);return C(Math.sqrt(Math.max(0,(r+a.re)/2)),(a.im<0?-1:1)*Math.sqrt(Math.max(0,(r-a.re)/2)));};
const prod = xs => xs.reduce(mul,C(1));
export function filterModel(p) {
  const n=p.order, wc=TAU*p.fc1;
  if(p.type==='none') return {poles:[],zeros:[],gain:1,direct:1,terms:[]};
  const prototype=Array.from({length:n},(_,i)=>C(Math.cos(Math.PI*(2*i+1+n)/(2*n)),Math.sin(Math.PI*(2*i+1+n)/(2*n))));
  let poles,zeros=[],gain=1,repeated=false;
  if(p.type==='low'||p.type==='high') {
    poles=prototype.map(v=>scale(v,wc));
    if(p.type==='low')gain=wc**n;else zeros=Array.from({length:n},()=>C());
  } else if(p.type==='band') {
    const fl=Math.min(p.fc1,p.fc2),fh=Math.max(p.fc1,p.fc2);
    if(fh-fl<1e-8)throw Error('El passa-banda necessita dues freqüències de tall diferents.');
    const bw=TAU*(fh-fl),w0=TAU*Math.sqrt(fl*fh);
    poles=prototype.flatMap(v=>{const bp=scale(v,bw),r=sqrt(sub(mul(bp,bp),C(4*w0*w0)));return [scale(add(bp,r),.5),scale(sub(bp,r),.5)];});
    zeros=Array.from({length:n},()=>C());gain=bw**n;
  } else if(p.type==='notch') {
    const a=wc/p.q,r=sqrt(C(a*a-4*wc*wc));
    poles=[scale(add(C(-a),r),.5),scale(sub(C(-a),r),.5)];zeros=[C(0,wc),C(0,-wc)];
    repeated=Math.abs(p.q-.5)<1e-10;
  } else throw Error('Tipus de filtre desconegut.');
  const direct=zeros.length===poles.length?gain:0;
  const terms=repeated?[{pole:C(-wc),r:C(-2*wc),r2:C(2*wc*wc)}]:poles.map((pole,i)=>({pole,r:div(scale(prod(zeros.map(z=>sub(pole,z))),gain),prod(poles.filter((_,j)=>j!==i).map(v=>sub(pole,v))))}));
  return {poles,zeros,gain,direct,terms};
}
export function response(model,f) {
  const s=C(0,TAU*f);
  return div(scale(prod(model.zeros.map(z=>sub(s,z))),model.gain),prod(model.poles.map(p=>sub(s,p))));
}
export function magnitude(model,f) {const h=response(model,f);return 20*Math.log10(Math.max(1e-15,Math.hypot(h.re,h.im)));}
export function asymptote(p,f) {
  if(p.type==='low')return f<=p.fc1?0:-20*p.order*Math.log10(f/p.fc1);
  if(p.type==='high')return f>=p.fc1?0:20*p.order*Math.log10(f/p.fc1);
  if(p.type==='band'){const lo=Math.min(p.fc1,p.fc2),hi=Math.max(p.fc1,p.fc2);return f<lo?20*p.order*Math.log10(f/lo):f>hi?-20*p.order*Math.log10(f/hi):0;}
  return null;
}
export function aliasFrequency(f,fs) {const fm=f%fs;return fm<=fs/2?fm:fs-fm;}
// Exact zero-state response to a DC value and sinusoidal components, including
// the startup transient. Residues integrate the analog impulse response.
export function outputAt(model,p,t) {
  let x=p.offset;
  for(const v of p.components)x+=v.amp*Math.sin(TAU*v.freq*t);
  let y=model.direct*x;
  for(const {pole,r,r2} of model.terms){
    const ep=exp(scale(pole,t));
    y+=p.offset*mul(r,div(sub(ep,C(1)),pole)).re;
    if(r2)y+=p.offset*mul(r2,div(add(mul(ep,sub(scale(pole,t),C(1))),C(1)),mul(pole,pole))).re;
    for(const v of p.components){
      if(!v.amp)continue;
      const jw=C(0,TAU*v.freq),ej=exp(scale(jw,t));
      y+=v.amp*mul(r,div(sub(ej,ep),sub(jw,pole))).im;
      if(r2){const d=sub(pole,jw);const integral=div(add(mul(exp(scale(d,t)),sub(scale(d,t),C(1))),C(1)),mul(d,d));y+=v.amp*mul(r2,mul(ej,integral)).im;}
    }
  }
  return {x,y};
}
// Precompute steady-state sinusoidal coefficients and transient pole weights.
// This keeps large records practical without changing the continuous-time model.
export function sampleSignal(p,model) {
  const n=Math.max(100,Math.floor(p.fs*p.duration));
  if(n>2000000)throw Error('Redueix la durada o la resolució: màxim 2 milions de mostres.');
  const x=new Float64Array(n),y=new Float64Array(n),t=new Float64Array(n);
  if(model.terms.some(v=>v.r2)){
    for(let i=0;i<n;i++){t[i]=i/p.fs;const v=outputAt(model,p,t[i]);x[i]=v.x;y[i]=v.y;}return {t,x,y};
  }
  const dc=p.offset*response(model,0).re;
  const waves=p.components.map(v=>({...v,h:response(model,v.freq)}));
  const transient=model.terms.map(({pole,r})=>{
    let complex=scale(div(r,pole),p.offset);
    for(const v of p.components){const q=scale(div(r,sub(C(0,TAU*v.freq),pole)),v.amp);complex=add(complex,mul(C(0,1),q));}
    return {pole,complex};
  });
  for(let i=0;i<n;i++){
    const time=i/p.fs;t[i]=time;let input=p.offset,output=dc;
    for(const v of waves){const angle=TAU*v.freq*time,s=Math.sin(angle),c=Math.cos(angle);input+=v.amp*s;output+=v.amp*(v.h.re*s+v.h.im*c);}
    for(const term of transient)output+=mul(term.complex,exp(scale(term.pole,time))).re;
    x[i]=input;y[i]=output;
  }
  return {t,x,y};
}
export function spectrum(x,fs) {
  const n=x.length;let length=1;
  const target=n*Math.max(1,Math.min(8,Math.floor(1000000/n)));
  while(length<target)length*=2;
  const re=new Float64Array(length),im=new Float64Array(length);let windowSum=0;
  for(let i=0;i<n;i++){const w=.5-.5*Math.cos(TAU*i/(n-1));windowSum+=w;re[i]=x[i]*w;}
  for(let i=1,j=0;i<length;i++){let bit=length>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];}}
  for(let size=2;size<=length;size*=2){const angle=-TAU/size,wr0=Math.cos(angle),wi0=Math.sin(angle);
    for(let start=0;start<length;start+=size){let wr=1,wi=0;for(let j=0;j<size/2;j++){
      const a=start+j,b=a+size/2,tr=wr*re[b]-wi*im[b],ti=wr*im[b]+wi*re[b];
      re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;const next=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=next;
    }}
  }
  const f=new Float64Array(length/2+1),amp=new Float64Array(f.length);
  for(let i=0;i<f.length;i++){f[i]=i*fs/length;amp[i]=Math.hypot(re[i],im[i])*(i===0||i===length/2?1:2)/windowSum;}
  return {f,amp};
}
export function logspace(lo,hi,count=900,corners=[]) {
  const values=Array.from({length:count},(_,i)=>10**(Math.log10(lo)+i/(count-1)*(Math.log10(hi)-Math.log10(lo))));
  return [...new Set([...values,...corners.filter(v=>v>=lo&&v<=hi)])].sort((a,b)=>a-b);
}
export function unwrapPhase(model,f) {
  let previous=0,shift=0;
  return f.map((freq,i)=>{const h=response(model,freq);let phase=Math.atan2(h.im,h.re)*180/Math.PI;if(i){if(phase-previous>180)shift-=360;if(phase-previous< -180)shift+=360;}previous=phase;return phase+shift;});
}
