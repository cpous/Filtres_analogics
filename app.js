import {filterModel,magnitude,response,asymptote,aliasFrequency,logspace,unwrapPhase} from './engine.js';
import {Chart,colors,format} from './charts.js';
const $=id=>document.getElementById(id);
const ids=['offset','a1','f1','a2','f2','a3','f3','duration','fs','type','order','fc1','fc2','q','adc'];
const checks=['nyquist','showInput','showOutput','showExact','showAsym'];
const names={none:'Sense filtre',low:'Passa-baix',high:'Passa-alt',band:'Passa-banda',notch:'Notch'};
const presets=[
  [0,2,30,.5,1000,0,50,.2,20000,'low',1,80,300,10,5000],
  [1.5,.8,.2,.15,30,.1,80,10,20000,'low',1,2,20,10,200],
  [1,.6,.3,.8,30,.3,120,2,20000,'high',1,2,200,10,1000],
  [.5,.8,3,.25,12,.35,50,2,20000,'notch',2,50,200,12,1000],
  [0,1,1000,.5,4000,0,50,.02,20000,'low',2,1500,3000,10,5000]
];
const charts=Object.fromEntries(['time','spectrum','origin','magnitude','phase'].map(name=>[name,new Chart($(`${name}Chart`))]));
let current=null,selected=0,sequence=0,worker=null,debounce;
function toast(text){$('toast').textContent=text;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,4500);}
function read(){
  const p={};for(const id of ids){const el=$(id);if(!el.disabled&&el.type==='number'&&!el.validity.valid)throw Error(`Revisa el valor de ${el.getAttribute('aria-label')||id}.`);p[id]=id==='type'?el.value:Number(el.value);}
  for(const id of checks)p[id]=$(id).checked;
  p.components=[1,2,3].map(i=>({amp:p[`a${i}`],freq:p[`f${i}`]}));
  if(p.components.some(v=>v.amp>0&&v.freq>=p.fs/2))throw Error('La resolució de simulació ha de ser superior al doble de la freqüència més alta del senyal. Augmenta «Resolució».');
  return p;
}
function controlState(){const type=$('type').value;$('fc1').disabled=type==='none';$('fc2').disabled=type!=='band';$('q').disabled=type!=='notch';$('order').disabled=type==='none'||type==='notch';$('showAsym').disabled=!['low','high','band'].includes(type);$('fcLabel').textContent=type==='band'?'fL [Hz]':type==='notch'?'f0 [Hz]':'fc [Hz]';}
function applyPreset(index){if(index<5){ids.forEach((id,i)=>$(id).value=presets[index][i]);selected=0;}controlState();compute();}
function compute(){
  clearTimeout(debounce);controlState();let params;
  try{params=read();filterModel(params);}catch(error){$('error').textContent=error.message;$('error').hidden=false;$('computeStatus').textContent='Revisa els paràmetres';return;}
  $('error').hidden=true;sequence++;if(worker)worker.terminate();
  $('computeStatus').textContent='Calculant…';
  try{worker=new Worker(new URL('./compute.js',import.meta.url),{type:'module'});worker.postMessage({id:sequence,params});
    worker.onmessage=({data})=>{if(data.id!==sequence)return;if(data.error){$('error').textContent=data.error;$('error').hidden=false;$('computeStatus').textContent='Revisa els paràmetres';return;}current=data;$('computeStatus').textContent=`${data.t.length.toLocaleString('ca')} mostres · H(s)`;render();};
    worker.onerror=()=>{$('error').textContent='No s’ha pogut calcular la simulació. Recarrega la pàgina.';$('error').hidden=false;$('computeStatus').textContent='Error de simulació';};
  }catch(error){$('error').textContent=error.message;$('error').hidden=false;}
}
function extent(arrays){let lo=0,hi=0;for(const a of arrays)for(const v of a){lo=Math.min(lo,v);hi=Math.max(hi,v);}const margin=Math.max(.05,(hi-lo)*.12);return [lo-margin,hi+margin];}
function select(index){selected=index;render();}
function render(){if(!current)return;const {params:p,model,t,x,y,input,output}=current;
  for(const id of checks)p[id]=$(id).checked;
  const fn=p.adc/2;
  $('nyquistStatus').textContent=`Nyquist ${p.nyquist?'visible':'ocult'}: fN = ${format(fn)} Hz.${fn>=p.fs/2?' Fora del rang de l’espectre; consulta el Bode.':''}`;
  const series=[];if(p.showInput)series.push({x:t,y:x,color:colors.input,name:'Entrada'});if(p.showOutput)series.push({x:t,y:y,color:colors.output,name:'Sortida'});
  const [ymin,ymax]=extent(series.map(v=>v.y));charts.time.set({xmin:0,xmax:p.duration,ymin,ymax,series,xlabel:'Temps [s]',ylabel:'Amplitud [V]',zoomable:true});
  let fmax=Math.max(5*Math.max(p.fc1,1),1.5*Math.max(...p.components.map(v=>v.freq)));if(p.nyquist&&fn<p.fs/2)fmax=Math.max(fmax,1.25*fn);fmax=Math.min(fmax,p.fs/2);
  const fmin=Math.max(1e-6,Math.min(fmax/4000,p.fc1/30,p.fc2/30,...p.components.map(v=>v.freq/30)));
  const ff=logspace(fmin,fmax,800,[p.fc1,p.fc2]),exact=ff.map(v=>magnitude(model,v)),asym=ff.map(v=>asymptote(p,v));
  const spectral=[];if(p.showInput)spectral.push({x:input.f,y:input.amp,color:colors.input,name:'Entrada'});if(p.showOutput)spectral.push({x:output.f,y:output.amp,color:colors.output,name:'Sortida'});
  if(p.showExact)spectral.push({x:ff,y:exact,color:colors.exact,right:true,dash:[5,4]});if(p.showAsym&&asym[0]!==null)spectral.push({x:ff,y:asym,color:colors.asym,right:true,dash:[4,3]});
  let maxAmp=.05;for(const s of spectral.filter(v=>!v.right))for(let i=1;i<s.x.length&&s.x[i]<=fmax;i++)maxAmp=Math.max(maxAmp,s.y[i]);
  const markers=[],lines=[],v=p.components[selected];
  if(p.showInput)p.components.forEach((c,index)=>{if(c.amp>0&&c.freq<=fmax)markers.push({x:c.freq,y:c.amp,index,color:colors.input,selected:index===selected});maxAmp=Math.max(maxAmp,c.amp);});
  const cutoffs=p.type==='band'?[Math.min(p.fc1,p.fc2),Math.max(p.fc1,p.fc2)]:['low','high'].includes(p.type)?[p.fc1]:[];
  if(p.showExact||p.showAsym&&asym[0]!==null)cutoffs.forEach(fc=>markers.push({x:fc,y:magnitude(model,fc),right:true,color:colors.output,label:'fc: −3 dB'}));
  if(v.amp>0){lines.push({x:v.freq,dash:[2,4]});if(p.nyquist&&v.freq>fn){const alias=aliasFrequency(v.freq,p.adc);if(alias>0)markers.push({x:alias,y:v.amp*10**(magnitude(model,v.freq)/20),color:colors.asym,label:`alias ${format(alias)} Hz`});}}
  charts.spectrum.set({xmin:fmin,xmax:fmax,ymin:-maxAmp*.05,ymax:maxAmp*1.16,log:true,series:spectral,markers,lines,right:(p.showExact||p.showAsym&&asym[0]!==null)?{min:-80,max:5}:null,nyquist:p.nyquist?fn:null,zoomable:true,onSelect:select});
  const active=p.components.filter(v=>v.amp>0);const lowMax=Math.min(p.fs/2,Math.max(2/p.duration,active.length?2*Math.min(...active.map(v=>v.freq)):2/p.duration));
  const lowSeries=[],dcMarkers=[];let lowPeak=.05;
  for(const [visible,s,color,name] of [[p.showInput,input,colors.input,'Entrada'],[p.showOutput,output,colors.output,'Sortida']]){if(!visible)continue;
    let end=1;while(end<s.f.length&&s.f[end]<=lowMax){lowPeak=Math.max(lowPeak,s.amp[end]);end++;}lowPeak=Math.max(lowPeak,s.amp[0]);
    lowSeries.push({x:s.f.subarray(1,end),y:s.amp.subarray(1,end),color,name},{x:[0,0],y:[0,s.amp[0]],color,width:3});dcMarkers.push({x:0,y:s.amp[0],color});
  }
  charts.origin.set({xmin:-lowMax*.08,xmax:lowMax,ymin:-lowPeak*.05,ymax:lowPeak*1.15,series:lowSeries,markers:dcMarkers,zoomable:true});
  $('dcReading').textContent=`0 Hz (registre): entrada ${p.showInput?format(input.amp[0])+' V':'oculta'} · sortida ${p.showOutput?format(output.amp[0])+' V':'oculta'}. Finestra de Hann: en registres curts, les oscil·lacions lentes també hi contribueixen.`;
  const positive=[...p.components.map(v=>v.freq),p.fc1,p.fc2,fn];const bmin=Math.max(.001,Math.min(...positive)/30),bmax=Math.max(...positive)*30;
  const bf=logspace(bmin,bmax,1000,cutoffs),mag=bf.map(v=>magnitude(model,v)),phase=unwrapPhase(model,bf),ba=bf.map(v=>asymptote(p,v));
  const magSeries=[{x:bf,y:mag,color:colors.input,name:'Resposta exacta'}];if(p.showAsym&&ba[0]!==null)magSeries.push({x:bf,y:ba,color:colors.asym,dash:[6,4],name:'Asímptota'});
  const bandLines=cutoffs.map(fc=>({x:fc,dash:[4,4]})),bandMarkers=cutoffs.map(fc=>({x:fc,y:magnitude(model,fc),color:colors.output,label:`fc ${format(fc)} Hz`}));
  if(v.amp>0)bandMarkers.push({x:v.freq,y:magnitude(model,v.freq),color:colors.output,selected:true});
  const [mlo,mhi]=extent([...magSeries.map(v=>v.y),[-3,0]]);charts.magnitude.set({xmin:bmin,xmax:bmax,ymin:mlo,ymax:mhi,log:true,ylabel:'|H(f)| [dB]',series:magSeries,lines:[...bandLines,{y:-3.0103,dash:[2,4]}],markers:bandMarkers,nyquist:p.nyquist?fn:null,zoomable:true});
  const [plo,phi]=extent([phase]);charts.phase.set({xmin:bmin,xmax:bmax,ymin:plo,ymax:phi,log:true,ylabel:'Fase [°]',series:[{x:bf,y:phase,color:colors.input}],lines:bandLines,nyquist:p.nyquist?fn:null,zoomable:true});
  $('filterReading').textContent=`${names[p.type]}${p.type==='none'?'':p.type==='notch'?' · ordre 2':` · ordre ${p.type==='band'?2*p.order:p.order}`}`;
  $('slopeReading').textContent=p.type==='low'?`Pendent: −${20*p.order} dB/dècada · fc ${format(p.fc1)} Hz`:p.type==='high'?`Pendent: +${20*p.order} dB/dècada · fc ${format(p.fc1)} Hz`:p.type==='band'?`Pendents: ±${20*p.order} dB/dècada · ${format(Math.min(p.fc1,p.fc2))}–${format(Math.max(p.fc1,p.fc2))} Hz`:p.type==='notch'?`f0 ${format(p.fc1)} Hz · Q ${format(p.q)} · BW ≈ ${format(p.fc1/p.q)} Hz`:'Guany unitari';
  $('componentsReading').replaceChildren();p.components.forEach((c,index)=>{if(c.amp<=0)return;const db=magnitude(model,c.freq),h=response(model,c.freq);const btn=document.createElement('button');btn.className=`component-reading${index===selected?' selected':''}`;btn.setAttribute('aria-pressed',String(index===selected));btn.textContent=`A${index+1} · ${format(c.freq)} Hz: ${format(c.amp)} V → ${db.toFixed(2)} dB → ${format(c.amp*10**(db/20))} V · fase ${(Math.atan2(h.im,h.re)*180/Math.PI).toFixed(1)}°`;btn.onclick=()=>select(index);$('componentsReading').append(btn);});
  const risks=p.components.filter(c=>c.amp>0&&c.freq>fn).map(c=>`${format(c.freq)} Hz → alias ${format(aliasFrequency(c.freq,p.adc))} Hz`);
  $('samplingReading').textContent=p.nyquist?`fs ADC ${format(p.adc)} S/s · fN ${format(fn)} Hz · atenuació a fN ${magnitude(model,fn).toFixed(2)} dB. ${risks.length?risks.join(' · '):'Cap component teòrica supera Nyquist.'} La vista mostra el senyal analògic abans de l’ADC.`:'Referències de Nyquist ocultes. El filtre analògic i els senyals no canvien.';
}
function switchTab(filter){$('signalView').hidden=filter;$('filterView').hidden=!filter;for(const [id,active] of [['tabSignal',!filter],['tabFilter',filter]]){$(id).classList.toggle('active',active);$(id).setAttribute('aria-selected',String(active));}requestAnimationFrame(()=>Object.values(charts).forEach(chart=>chart.draw()));}
$('tabSignal').onclick=()=>switchTab(false);$('tabFilter').onclick=()=>switchTab(true);
for(const id of ['tabSignal','tabFilter'])$(id).addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();const filter=id==='tabSignal';switchTab(filter);$(filter?'tabFilter':'tabSignal').focus();}});
$('preset').onchange=()=>applyPreset(Number($('preset').value));$('reset').onclick=()=>{if($('preset').value==='5')$('preset').value='0';applyPreset(Number($('preset').value));};
for(const id of ids)$(id).addEventListener('change',()=>{controlState();debounce=setTimeout(compute,120);});
for(const id of checks)$(id).addEventListener('change',()=>{if(current)render();});
let installPrompt=null;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('install').hidden=false;});
$('install').onclick=async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('install').hidden=true;};
window.addEventListener('appinstalled',()=>{$('install').hidden=true;toast('Aplicació instal·lada.');});
$('installHelp').onclick=()=>$('installation').showModal();
$('share').onclick=async()=>{const url=new URL('./',location.href).href;try{if(navigator.share)await navigator.share({title:'Filtratge analògic · MEI',url});else{await navigator.clipboard.writeText(url);toast('Enllaç copiat. Ja el pots compartir.');}}catch(error){if(error.name!=='AbortError'){const text=document.createElement('textarea');text.value=url;document.body.append(text);text.select();document.execCommand('copy');text.remove();toast('Enllaç copiat.');}}};
function connection(){const offline=!navigator.onLine;$('connection').textContent=offline?'Sense connexió':'Laboratori MEI';}
window.addEventListener('online',connection);window.addEventListener('offline',connection);connection();
if('serviceWorker' in navigator)window.addEventListener('load',()=>{navigator.serviceWorker.register('./sw.js').then(registration=>{if(registration.waiting){toast('Hi ha una versió nova. Recarrega per actualitzar.');}registration.addEventListener('updatefound',()=>{const installing=registration.installing;installing?.addEventListener('statechange',()=>{if(installing.state==='installed'&&navigator.serviceWorker.controller)toast('Hi ha una versió nova. Tanca i torna a obrir per actualitzar.');});});}).catch(()=>{toast('La vista web funciona, però no s’ha activat l’ús sense connexió.');});});
applyPreset(0);
