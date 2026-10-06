// Fast, byte-level cleanup of uploaded photos: reads the real dimensions, removes metadata (EXIF with GPS location,
// XMP, IPTC, text chunks) and drops anything stored after the end of the image. The picture data itself is copied
// unchanged, so this costs milliseconds and never alters quality. Returns null when the file is not a readable image.

export type CleanImage={bytes:Uint8Array;width:number;height:number};

const u16be=(b:Uint8Array,o:number)=>(b[o]<<8)|b[o+1];
const u32be=(b:Uint8Array,o:number)=>((b[o]<<24)>>>0)+(b[o+1]<<16)+(b[o+2]<<8)+b[o+3];
const u32le=(b:Uint8Array,o:number)=>b[o]+(b[o+1]<<8)+(b[o+2]<<16)+((b[o+3]<<24)>>>0);
const ascii=(b:Uint8Array,o:number,n:number)=>String.fromCharCode(...b.subarray(o,o+n));
function join(parts:Uint8Array[]){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let o=0;for(const p of parts){out.set(p,o);o+=p.length}return out}

// JPEG: keep JFIF (APP0), ICC colour profile (APP2), Adobe colour info (APP14) and every non-APP segment.
const keptJpegApps=new Set([0xe0,0xe2,0xee]);
const sofMarkers=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
function cleanJpeg(b:Uint8Array):CleanImage|null{
 if(b[0]!==0xff||b[1]!==0xd8)return null;
 const parts=[b.subarray(0,2)];let o=2,width=0,height=0;
 while(o+4<=b.length){
  if(b[o]!==0xff)return null;
  const m=b[o+1];if(m===0xff){o++;continue}
  if(m===0xd9)return null; // End of image before any picture data.
  if(m===0x01||(m>=0xd0&&m<=0xd7)){parts.push(b.subarray(o,o+2));o+=2;continue}
  const len=u16be(b,o+2);if(len<2||o+2+len>b.length)return null;
  if(m===0xda){
   // Start of scan: picture data runs to the end-of-image marker. Inside it, 0xFF is always followed by 0x00,
   // a restart marker or another segment marker, so the first FF D9 is the real end.
   let e=o+2+len;while(e+1<b.length&&!(b[e]===0xff&&b[e+1]===0xd9))e++;
   if(e+1>=b.length)return null;
   parts.push(b.subarray(o,e+2));
   return width&&height?{bytes:join(parts),width,height}:null;
  }
  if(sofMarkers.has(m)){height=u16be(b,o+5);width=u16be(b,o+7);}
  const isApp=(m>=0xe0&&m<=0xef)||m===0xfe;
  if(!isApp||keptJpegApps.has(m))parts.push(b.subarray(o,o+2+len));
  o+=2+len;
 }
 return null;
}

// PNG: keep the chunks needed to draw the image and its colours; drop text, EXIF, time and animation chunks.
const keptPngChunks=new Set(['IHDR','PLTE','IDAT','IEND','tRNS','gAMA','cHRM','sRGB','iCCP','sBIT','pHYs']);
function cleanPng(b:Uint8Array):CleanImage|null{
 const parts=[b.subarray(0,8)];let o=8,width=0,height=0;
 while(o+12<=b.length){
  const len=u32be(b,o),type=ascii(b,o+4,4),end=o+12+len;if(end>b.length)return null;
  if(type==='IHDR'){width=u32be(b,o+8);height=u32be(b,o+12);}
  if(keptPngChunks.has(type))parts.push(b.subarray(o,end));
  if(type==='IEND')return width&&height?{bytes:join(parts),width,height}:null;
  o=end;
 }
 return null;
}

// WebP: keep image, alpha, colour profile and animation chunks; drop EXIF and XMP and clear their flags.
const keptWebpChunks=new Set(['VP8 ','VP8L','VP8X','ALPH','ICCP','ANIM','ANMF']);
function cleanWebp(b:Uint8Array):CleanImage|null{
 const total=Math.min(b.length,8+u32le(b,4));const parts:Uint8Array[]=[];let o=12,width=0,height=0;
 while(o+8<=total){
  const type=ascii(b,o,4),size=u32le(b,o+4),end=o+8+size+(size&1);if(o+8+size>total)return null;
  const d=o+8;
  if(type==='VP8X'){width=1+(b[d+4]|(b[d+5]<<8)|(b[d+6]<<16));height=1+(b[d+7]|(b[d+8]<<8)|(b[d+9]<<16));}
  else if(type==='VP8 '&&!width){if(b[d+3]!==0x9d||b[d+4]!==0x01||b[d+5]!==0x2a)return null;width=(b[d+6]|(b[d+7]<<8))&0x3fff;height=(b[d+8]|(b[d+9]<<8))&0x3fff;}
  else if(type==='VP8L'&&!width){if(b[d]!==0x2f)return null;const bits=u32le(b,d+1);width=(bits&0x3fff)+1;height=((bits>>>14)&0x3fff)+1;}
  if(keptWebpChunks.has(type)){
   const chunk=b.slice(o,Math.min(end,total));
   if(type==='VP8X')chunk[8]&=~0x0c; // Clear the EXIF (0x08) and XMP (0x04) flags.
   parts.push(chunk);
  }
  o=end;
 }
 if(!width||!height||!parts.length)return null;
 const body=join(parts),header=new Uint8Array(12);header.set(b.subarray(0,4));header.set(b.subarray(8,12),8);
 new DataView(header.buffer).setUint32(4,4+body.length,true);
 return {bytes:join([header,body]),width,height};
}

export function cleanImage(bytes:Uint8Array,mime:string):CleanImage|null{
 try{return mime==='image/jpeg'?cleanJpeg(bytes):mime==='image/png'?cleanPng(bytes):mime==='image/webp'?cleanWebp(bytes):null}
 catch{return null}
}
