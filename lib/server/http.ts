import {HttpError,must} from './data';

/** Limit streamed input, including chunked bodies without Content-Length. */
export async function boundedText(request:Request,limit=1_000_000){
  must(Number(request.headers.get('content-length')||0)<=limit,'Request is too large.',413);
  if(!request.body)return '';
  const reader=request.body.getReader();const decoder=new TextDecoder();let size=0,text='';
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new HttpError(413,'Request is too large.')}text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}finally{reader.releaseLock();}
}
export async function jsonBody(request:Request){
  must((request.headers.get('content-type')||'').split(';')[0].trim()==='application/json','Use application/json for this request.',415);
  const raw=await boundedText(request);
  try{const value=JSON.parse(raw);must(value&&typeof value==='object'&&!Array.isArray(value),'Expected a JSON object.');return value;}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'Invalid JSON request.');}
}
/** Read one multipart file field, bounding the entire body before parsing, including requests without Content-Length. */
export async function readUploadedFile(request:Request,limit:number,tooLarge:string){
  must(Number(request.headers.get('content-length')||0)<=limit+65536,'The file is too large.',413);
  must((request.headers.get('content-type')||'').startsWith('multipart/form-data;'),'Use a multipart file upload.',415);
  const reader=request.body?.getReader();must(reader,'No file was uploaded.');
  const chunks:Uint8Array[]=[];let total=0;
  while(true){const c=await reader.read();if(c.done)break;total+=c.value.length;if(total>limit+65536){await reader.cancel();throw new HttpError(413,'The file is too large.')}chunks.push(c.value);}
  const full=new Uint8Array(total);let offset=0;for(const c of chunks){full.set(c,offset);offset+=c.length}
  const form=await new Response(full,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();
  const file=form.get('file');must(file instanceof File,'Choose a file to upload.');
  must(file.size>32&&file.size<=limit,tooLarge,413);
  return {file,bytes:new Uint8Array(await file.arrayBuffer())};
}
export function pageQuery(url:URL,defaultLimit=50){
  const page=Number(url.searchParams.get('page')||1),limit=Number(url.searchParams.get('limit')||defaultLimit);
  must(Number.isSafeInteger(page)&&page>=1&&page<=100000&&Number.isSafeInteger(limit)&&limit>=1&&limit<=100,'Invalid pagination.');
  return {page,limit,offset:(page-1)*limit};
}
