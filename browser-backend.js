'use strict';
const BrowserBackend = (()=>{
  const ACTOR='propietario@dispositivo.invalid';let key=null,demoData=null,lastActivity=0;
  const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'}).format(new Date());
  const context=()=>({now:new Date().toISOString(),today:today(),id:p=>p+'-'+crypto.randomUUID(),hash:sha256});
  const check=()=>{if(!key&&!demoData)throw Error('Desbloquea tu espacio para continuar');if(Date.now()-lastActivity>15*60*1000){lock();throw Error('Espacio bloqueado por inactividad. Vuelve a entrar.');}lastActivity=Date.now();};
  function lock(){key=null;demoData=null;lastActivity=0;}
  async function exists(){return !!await PrivateVault.read();}
  async function create(password,company){const data={state:Engine.initial(ACTOR,String(company||'Mi negocio').trim().slice(0,200)),attachments:{}};const created=await PrivateVault.create(password,data);key=created.key;demoData=null;lastActivity=Date.now();}
  async function unlock(password){const opened=await PrivateVault.unlock(password);Engine.auth(opened.data.state,ACTOR);key=opened.key;demoData=null;lastActivity=Date.now();}
  async function restore(file,password){if(file.size>80000000)throw Error('Copia superior al límite del piloto');const opened=await PrivateVault.restore(await file.text(),password);key=opened.key;demoData=null;lastActivity=Date.now();}
  function demo(){key=null;demoData={state:Engine.initial(ACTOR,'DEMOSTRACIÓN · datos ficticios'),attachments:{}};lastActivity=Date.now();const call=(action,p)=>{const o=Engine.run(demoData.state,ACTOR,action,{requestId:crypto.randomUUID(),...p},context());demoData.state=o.state;return o.result;};const c=call('addClient',{name:'Cliente ficticio',nif:'TEST-CLIENTE',address:'Calle de ejemplo 1',city:'Málaga'});call('createDraft',{clientId:c.id,lines:[{description:'Servicio de demostración',quantity:1,price:100,vat:21}]});const base={date:today(),docType:'invoice',confirmed:true,externalConfirmed:true,base:100,tax:21,total:121};call('registerInvoice',{...base,type:'sales',number:'EXT-DEMO-01',name:c.name,nif:c.nif});call('registerInvoice',{...base,type:'received',number:'PROV-DEMO-01',name:'Proveedor ficticio',nif:'TEST-PROVEEDOR'});call('importBank',{account:'Cuenta ficticia',csv:'Fecha;Concepto;Importe;Referencia\n'+today()+';Cobro EXT-DEMO-01;121;FICTICIO-1\n'+today()+';Pago PROV-DEMO-01;-40;FICTICIO-2\n'+today()+';Cargo sin documento;-25;FICTICIO-3'});call('propose',{});}
  async function backup(){check();if(demoData)throw Error('La demostración no contiene un espacio personal que guardar');const e=await PrivateVault.read();return {name:'mi-negocio-copia-'+today()+'.json',mime:'application/json',base64:PrivateVault.toBase64(new TextEncoder().encode(JSON.stringify(e)))};}
  async function execute(action,p={}){
    check();
    if(['syncReceived','importExcel','setUser','addDocument'].includes(action))throw Error({syncReceived:'La sincronización con Google requiere el servidor privado. Esta versión guarda los datos solo en este navegador.',importExcel:'En GitHub Pages, exporta el Excel como CSV. La lectura XLSX está disponible en el servidor local.',setUser:'El espacio cifrado de Pages es personal. Los empleados y la gestoría requieren el servidor privado.',addDocument:'Usa la subida protegida de documentos.'}[action]);
    return PrivateVault.locked(async()=>{
      check();const envelope=demoData?null:await PrivateVault.read();const data=demoData?structuredClone(demoData):await PrivateVault.decrypt(envelope,key);
      if(action==='readDocument'){const doc=data.state.documents.find(d=>d.id===p.id);if(!doc||!data.attachments[doc.storageId])throw Error('Documento no encontrado');return {name:doc.name,mime:doc.mime,base64:data.attachments[doc.storageId]};}
      if(action==='draftPDF'){const output=Engine.run(data.state,ACTOR,action,p,context()).result;return {name:output.draft.id+'.pdf',mime:'application/pdf',base64:btoa(createDraftPDF(output.company,output.draft))};}
      let payload=p,operation=action;
      if(action==='upload'){
        if(!p.base64||p.base64.length>5600000)throw Error('Archivo vacío o superior a 4 MB');
        const bytes=PrivateVault.fromBase64(p.base64),head=bytes.subarray(0,12),ascii=String.fromCharCode(...head);
        const mime=ascii.startsWith('%PDF-')?'application/pdf':head[0]===255&&head[1]===216&&head[2]===255?'image/jpeg':head.slice(0,8).join(',')==='137,80,78,71,13,10,26,10'?'image/png':ascii.startsWith('RIFF')&&ascii.slice(8)==='WEBP'?'image/webp':'';
        if(!mime||mime!==p.mime)throw Error('El archivo no coincide con su formato');
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
        const prior=data.state.requests.find(r=>r.key===p.requestId&&r.email===ACTOR);if(prior){const existing=data.state.documents.find(d=>d.hash===hash);if(!existing)throw Error('Identificador reutilizado');return existing;}
        const storageId=crypto.randomUUID();payload={requestId:p.requestId,name:String(p.name||'documento').replace(/[\\/\x00-\x1f]/g,'_').slice(0,100),mime,size:bytes.length,hash,storageId};operation='addDocument';
        data.attachments[storageId]=p.base64;
      }
      const output=Engine.run(data.state,ACTOR,operation,payload,context());
      if(output.changed){data.state=output.state;if(demoData)demoData=data;else{const encrypted=await PrivateVault.encrypt(data,key,envelope);await PrivateVault.write(encrypted,envelope);}}
      return output.result;
    });
  }
  return {exists,create,unlock,restore,demo,execute,backup,lock,touch:()=>{if(key||demoData)lastActivity=Date.now();},expired:()=>!!(key||demoData)&&Date.now()-lastActivity>15*60*1000,mode:()=>demoData?'demo':key?'personal':'locked'};
})();
