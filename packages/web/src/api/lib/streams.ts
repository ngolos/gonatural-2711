import { auth } from '../auth';
import { db } from '../database';
import * as s from '../database/schema';
import { eq } from 'drizzle-orm';
import { fileAccess,creator } from './permissions';
import { objectStream } from './storage';
import { exportRecords } from '../routes/transfers';
import { zipSync, strToU8 } from 'fflate';

async function member(headers:Headers){
 const session=await auth.api.getSession({headers});if(!session)return null;
 const [m]=await db.select().from(s.members).where(eq(s.members.userId,session.user.id));return m??null;
}
export async function mediaResponse(request:Request,id:string){
 const m=await member(request.headers);if(!m)return new Response('Unauthorized',{status:401});
 try{
  const f=await fileAccess(m,id);const stream=await objectStream(f.key);
  const download=new URL(request.url).searchParams.has('download');
  const safe=f.name.replace(/[^a-zA-Z0-9._ -]/g,'_');
  return new Response(stream,{status:200,headers:{'Content-Type':f.mime,'Content-Disposition':`${download?'attachment':'inline'}; filename="${safe}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox"}});
 }catch(e){return new Response(e instanceof Error?e.message:'Forbidden',{status:403});}
}
export async function backupResponse(request:Request){
 const m=await member(request.headers);if(!m)return new Response('Unauthorized',{status:401});
 try{
  creator(m);const exported=await exportRecords();const originals=await db.select().from(s.files);const zip:Record<string,Uint8Array>={'records.json':strToU8(JSON.stringify(exported,null,2))};const manifest=[];
  for(const f of originals.filter(f=>f.state==='ready')){
   const path=`originals/${f.id}-${f.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
   const stream=await objectStream(f.key);const bytes=new Uint8Array(await new Response(stream).arrayBuffer());zip[path]=bytes;manifest.push({fileId:f.id,key:f.key,path,size:bytes.length});
  }
  zip['file-manifest.json']=strToU8(JSON.stringify(manifest,null,2));
  return new Response(zipSync(zip,{level:1}),{status:200,headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="go-natural-workspace-backup.zip"','Cache-Control':'private, no-store'}});
 }catch(e){return new Response(e instanceof Error?e.message:'Forbidden',{status:403});}
}