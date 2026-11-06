import { client } from './api';
import { token } from './auth';
export async function readPrivate(id:string,download=false){
 const response=await fetch(`/api/media/${encodeURIComponent(id)}${download?'?download=1':''}`,{headers:token()?{Authorization:`Bearer ${token()}`}:{},credentials:'include'});
 if(!response.ok)throw new Error(await response.text());return response.blob();
}
export function saveBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export async function downloadPrivate(id:string,name:string){saveBlob(await readPrivate(id,true),name);}
export async function downloadBackup(){const response=await fetch('/api/backup',{headers:token()?{Authorization:`Bearer ${token()}`}:{},credentials:'include'});if(!response.ok)throw new Error(await response.text());saveBlob(await response.blob(),'go-natural-workspace-backup.zip');}
export async function uploadFile(file:File,scopeType:'version'|'product'|'board'|'intake',scopeId:string){
 const mime=file.type||'text/plain';
 const result=await client.media.presign({name:file.name,mime:mime as 'image/png',size:file.size,scopeType,scopeId});
 const response=await fetch(result.url,{method:'PUT',body:file,headers:{'Content-Type':mime}});if(!response.ok)throw new Error(`Upload failed (${response.status}). Retry the original file.`);
 let width:number|null=null,height:number|null=null;
 if(mime.startsWith('image/')){const im=await createImageBitmap(file);width=im.width;height=im.height;im.close();}
 await client.media.complete({id:result.id,width,height});return result.id;
}