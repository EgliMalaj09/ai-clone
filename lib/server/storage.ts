import {env} from 'cloudflare:workers';
import {config,must,one,uid} from './data';
import {constantEqual,sign} from './security';
export interface ObjectStorage{put(key:string,body:ArrayBuffer|Uint8Array|ReadableStream,mime:string):Promise<void>;get(key:string,range?:string):Promise<R2ObjectBody|null>;delete(key:string):Promise<void>}
export class R2Storage implements ObjectStorage{
 bucket(){must(env.BUCKET,'File storage is unavailable.',503);return env.BUCKET;}
 async put(key:string,body:ArrayBuffer|Uint8Array|ReadableStream,mime:string){await this.bucket().put(key,body,{httpMetadata:{contentType:mime}});}
 async get(key:string,range?:string){return this.bucket().get(key,range?{range:new Headers({range})}:undefined);}
 async delete(key:string){await this.bucket().delete(key);}
}
export const storage:ObjectStorage=new R2Storage();
export async function mediaUrl(id:string,expires=Date.now()+3600000){const signature=await sign(id+':'+expires);return `${config().origin}/api/media/${id}?expires=${expires}&signature=${signature}`;}
export async function validSignature(id:string,url:URL){const expires=Number(url.searchParams.get('expires'));const s=url.searchParams.get('signature');return !!s&&expires>Date.now()&&expires<Date.now()+86400000&&constantEqual(s,await sign(id+':'+expires));}
export function imageMime(bytes:Uint8Array){if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10)return 'image/png';if(new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')return 'image/webp';return null;}
export function safeRemote(url:string){const u=new URL(url);must(u.protocol==='https:','Provider returned an unsafe URL.');const h=u.hostname.toLowerCase();must(h.endsWith('.fal.media')||h==='fal.media'||h.endsWith('.replicate.delivery')||h==='replicate.delivery'||h==='storage.googleapis.com'&&u.pathname.startsWith('/falserverless/'),'Provider output host is not permitted.');return u;}
export async function ingestRemote(url:string,key:string){
 safeRemote(url);
 const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000)});
 must(r.ok&&r.body,'Could not save the provider result.',502);
 const length=Number(r.headers.get('content-length')||0);
 must(length<=100*1024*1024,'Provider result exceeds the 100 MB limit.',502);
 const reader=r.body.getReader();
 const head:Uint8Array[]=[];let size=0;
 while(size<32){const part=await reader.read();if(part.done)break;head.push(part.value);size+=part.value.length;}
 const prefix=new Uint8Array(size);let offset=0;for(const part of head){prefix.set(part,offset);offset+=part.length;}
 const mime=imageMime(prefix)||(new TextDecoder().decode(prefix.slice(4,8))==='ftyp'?'video/mp4':null);
 if(!mime){await reader.cancel();must(false,'Provider output must be a valid JPG, PNG, WEBP, or MP4 file.',502);}
 // FixedLengthStream keeps large videos streaming while giving R2 the required byte length.
 if(length>0){
   const fixed=new FixedLengthStream(length);
   const source=new ReadableStream<Uint8Array>({
     start(controller){controller.enqueue(prefix)},
     async pull(controller){try{const v=await reader.read();if(v.done){controller.close();return}size+=v.value.length;if(size>100*1024*1024)throw new Error('Provider result exceeds the size limit');controller.enqueue(v.value)}catch(e){await reader.cancel();controller.error(e)}},
     cancel(){return reader.cancel()},
   });
   await Promise.all([source.pipeTo(fixed.writable),storage.put(key,fixed.readable,mime)]);
 }else{
   // Unknown-length responses are bounded below the Worker memory budget.
   const chunks=[prefix];while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>24*1024*1024){await reader.cancel();must(false,'Large provider outputs must include Content-Length.',502);}chunks.push(part.value);}
   const bytes=new Uint8Array(size);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.length;}
   await storage.put(key,bytes,mime);
 }
 return {size,mime};
}
