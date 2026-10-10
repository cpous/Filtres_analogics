import {filterModel,sampleSignal,spectrum} from './engine.js';
self.onmessage=({data:{params,id}})=>{
  try {const model=filterModel(params),samples=sampleSignal(params,model),input=spectrum(samples.x,params.fs),output=spectrum(samples.y,params.fs);
    const data={id,params,model,...samples,input,output};
    self.postMessage(data,[samples.t.buffer,samples.x.buffer,samples.y.buffer,input.f.buffer,input.amp.buffer,output.f.buffer,output.amp.buffer]);
  }catch(error){self.postMessage({id,error:error.message});}
};
