export const colors={input:'#39b7f0',output:'#ff6676',exact:'#a3bac8',asym:'#edb65b',nyquist:'#ff6676',grid:'#29404d',text:'#8da8b8'};
export function format(v) {
  if(!Number.isFinite(v))return '—';
  if(v===0)return '0';
  if(Math.abs(v)<.1||Math.abs(v)>=1000){const [m,e]=v.toExponential(1).split('e');return `${Number(m)}e${Number(e)}`;}
  return Number(v.toPrecision(3)).toString();
}
function linearTicks(lo,hi,count=5) {
  const raw=(hi-lo)/count,p=10**Math.floor(Math.log10(raw));
  const step=([1,2,5,10].find(v=>v*p>=raw)||10)*p;
  const values=[];for(let v=Math.ceil(lo/step)*step;v<=hi+step*1e-6;v+=step)values.push(Math.abs(v)<step*1e-7?0:v);
  return values;
}
export class Chart {
  constructor(canvas){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.zoom=null;
    this.observer=new ResizeObserver(()=>this.draw());this.observer.observe(canvas);
    canvas.addEventListener('wheel',event=>{
      if(!this.config||!this.config.zoomable)return;
      event.preventDefault();const cfg=this.config,r=canvas.getBoundingClientRect();
      let [lo,hi]=this.zoom||[cfg.xmin,cfg.xmax];const log=cfg.log;
      let a=log?Math.log10(lo):lo,b=log?Math.log10(hi):hi;
      const fraction=Math.max(0,Math.min(1,(event.clientX-r.left-56)/(r.width-56-(cfg.right?58:16))));
      const middle=a+(b-a)*fraction,factor=event.deltaY>0?1.25:.8;
      const range=(b-a)*factor;
      if(range<1e-9||range>(log?Math.log10(cfg.xmax/cfg.xmin)*1.5:(cfg.xmax-cfg.xmin)*1.5))return;
      a=middle-range*fraction;b=middle+range*(1-fraction);
      this.zoom=[log?10**a:a,log?10**b:b];this.draw();
    },{passive:false});
    canvas.addEventListener('dblclick',()=>{this.zoom=null;this.draw();});
    canvas.addEventListener('click',event=>{
      if(!this.config?.onSelect)return;const r=canvas.getBoundingClientRect();
      const px=event.clientX-r.left,py=event.clientY-r.top;
      let nearest=null,distance=28;
      for(const marker of this.config.markers||[]){if(marker.index===undefined)continue;const pos=this.project(marker.x,marker.y,marker.right);const d=Math.hypot(px-pos[0],py-pos[1]);if(d<distance){distance=d;nearest=marker.index;}}
      if(nearest!==null)this.config.onSelect(nearest);
    });
  }
  set(config){this.config=config;this.zoom=null;this.draw();}
  project(x,y,right=false){const cfg=this.config,b=this.bounds;const [xmin,xmax]=this.zoom||[cfg.xmin,cfg.xmax];const a=cfg.log?Math.log10(xmin):xmin,z=cfg.log?Math.log10(xmax):xmax;const value=cfg.log?Math.log10(x):x;const lo=right?cfg.right.min:cfg.ymin,hi=right?cfg.right.max:cfg.ymax;return [b.l+(value-a)/(z-a)*b.w,b.t+(hi-y)/(hi-lo)*b.h];}
  draw(){
    if(!this.config)return;const canvas=this.canvas,r=canvas.getBoundingClientRect();
    if(r.width<50||r.height<50)return;
    const dpr=Math.min(window.devicePixelRatio||1,2),ctx=this.ctx,cfg=this.config;
    canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    const b=this.bounds={l:56,t:25,w:r.width-56-(cfg.right?58:16),h:r.height-25-42};
    ctx.clearRect(0,0,r.width,r.height);ctx.font='10px system-ui';ctx.fillStyle=colors.text;ctx.strokeStyle=colors.grid;ctx.lineWidth=.7;
    const [xmin,xmax]=this.zoom||[cfg.xmin,cfg.xmax];let ticks;
    if(cfg.log){const a=Math.log10(xmin),z=Math.log10(xmax),step=Math.max(1,Math.ceil((z-a)*65/b.w));ticks=[];for(let i=Math.ceil(a/step)*step;i<=z;i+=step)ticks.push(10**i);
      if(z-a<1.5)ticks=Array.from({length:Math.ceil(z)-Math.floor(a)+1},(_,i)=>Math.floor(a)+i).flatMap(e=>[1,2,5].map(m=>m*10**e)).filter(v=>v>=xmin&&v<=xmax);
    }else ticks=linearTicks(xmin,xmax,Math.max(2,Math.floor(b.w/65)));
    ctx.textAlign='center';
    for(const tick of ticks){const [x]=this.project(tick,cfg.ymin);ctx.beginPath();ctx.moveTo(x,b.t);ctx.lineTo(x,b.t+b.h);ctx.stroke();ctx.fillText(format(tick),x,b.t+b.h+16);}
    ctx.textAlign='right';for(const tick of linearTicks(cfg.ymin,cfg.ymax,5)){const [,y]=this.project(xmin,tick);ctx.beginPath();ctx.moveTo(b.l,y);ctx.lineTo(b.l+b.w,y);ctx.stroke();ctx.fillText(format(tick),b.l-8,y+3);}
    if(cfg.right){ctx.textAlign='left';for(const tick of linearTicks(cfg.right.min,cfg.right.max,5)){const [,y]=this.project(xmin,tick,true);ctx.fillText(format(tick),b.l+b.w+8,y+3);}}
    ctx.strokeStyle='#54707f';ctx.strokeRect(b.l,b.t,b.w,b.h);
    ctx.textAlign='center';ctx.fillText(cfg.xlabel||'Freqüència [Hz]',b.l+b.w/2,r.height-5);
    ctx.save();ctx.translate(13,b.t+b.h/2);ctx.rotate(-Math.PI/2);ctx.fillText(cfg.ylabel||'Amplitud [V]',0,0);ctx.restore();
    if(cfg.right){ctx.save();ctx.translate(r.width-8,b.t+b.h/2);ctx.rotate(-Math.PI/2);ctx.fillText(cfg.right.label||'|H(f)| [dB]',0,0);ctx.restore();}
    ctx.save();ctx.beginPath();ctx.rect(b.l,b.t,b.w,b.h);ctx.clip();
    if(cfg.nyquist){const [x]=this.project(cfg.nyquist,cfg.ymin);ctx.fillStyle='#ff667618';ctx.fillRect(Math.max(x,b.l),b.t,Math.max(0,b.l+b.w-Math.max(x,b.l)),b.h);}
    for(const series of cfg.series||[]){this.path(series);}
    for(const line of cfg.lines||[]){ctx.strokeStyle=line.color||'#668292';ctx.lineWidth=line.width||1;ctx.setLineDash(line.dash||[3,4]);ctx.beginPath();if(line.x!==undefined){const [x]=this.project(line.x,cfg.ymin);ctx.moveTo(x,b.t);ctx.lineTo(x,b.t+b.h);}else{const [,y]=this.project(xmin,line.y,line.right);ctx.moveTo(b.l,y);ctx.lineTo(b.l+b.w,y);}ctx.stroke();ctx.setLineDash([]);}
    if(cfg.nyquist){const [x]=this.project(cfg.nyquist,cfg.ymin);ctx.strokeStyle=colors.nyquist;ctx.lineWidth=1.7;ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(x,b.t);ctx.lineTo(x,b.t+b.h);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=colors.nyquist;ctx.textAlign='right';ctx.fillText(`fN ${format(cfg.nyquist)} Hz`,Math.min(b.l+b.w-5,x-5),b.t+13);}
    for(const marker of cfg.markers||[]){const [x,y]=this.project(marker.x,marker.y,marker.right);if(!Number.isFinite(x)||!Number.isFinite(y))continue;ctx.fillStyle=marker.color||colors.input;ctx.beginPath();ctx.arc(x,y,marker.selected?5:3.8,0,Math.PI*2);ctx.fill();if(marker.selected){ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();}if(marker.label){ctx.textAlign='left';ctx.fillText(marker.label,Math.min(x+7,b.l+b.w-ctx.measureText(marker.label).width()-5),Math.max(b.t+12,y-9));}}
    ctx.restore();
    let legendX=b.l+8;for(const series of (cfg.series||[]).filter(v=>v.name)){ctx.strokeStyle=series.color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(legendX,12);ctx.lineTo(legendX+14,12);ctx.stroke();ctx.fillStyle=colors.text;ctx.textAlign='left';ctx.fillText(series.name,legendX+19,15);legendX+=ctx.measureText(series.name).width+34;}
  }
  path(series){const ctx=this.ctx,cfg=this.config,[xmin,xmax]=this.zoom||[cfg.xmin,cfg.xmax];
    ctx.strokeStyle=series.color;ctx.lineWidth=series.width||1.5;ctx.setLineDash(series.dash||[]);ctx.beginPath();let started=false,bucket=null;
    const flush=()=>{if(!bucket)return;if(!started){ctx.moveTo(bucket.x,bucket.first);started=true;}else ctx.lineTo(bucket.x,bucket.first);if(bucket.max!==bucket.min){ctx.lineTo(bucket.x,bucket.min);ctx.lineTo(bucket.x,bucket.max);}ctx.lineTo(bucket.x,bucket.last);};
    for(let i=0;i<series.x.length;i++){const vx=series.x[i],vy=series.y[i];if(vx<xmin||vx>xmax||!Number.isFinite(vy)||(cfg.log&&vx<=0))continue;const [x,y]=this.project(vx,vy,series.right);const key=Math.floor(x);if(!bucket||bucket.key!==key){flush();bucket={key,x,first:y,last:y,min:y,max:y};}else{bucket.last=y;bucket.min=Math.min(bucket.min,y);bucket.max=Math.max(bucket.max,y);}}
    flush();ctx.stroke();ctx.setLineDash([]);
  }
}
