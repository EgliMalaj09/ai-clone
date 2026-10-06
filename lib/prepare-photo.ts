// Prepares a customer's photo in the browser before upload: turns it upright, converts iPhone HEIC where the browser
// can read it, and shrinks large photos to 2048 px on the long side as a JPEG. Smaller files upload faster, and the
// server then strips any metadata that is left. Small PNG/WebP photos are sent unchanged.

export const MIN_PHOTO_SIDE=512;
const MAX_PHOTO_SIDE=2048;
const SMALL_FILE=1.5*1024*1024;

const isHeic=(file:File)=>/hei[cf]/i.test(file.type)||/\.hei[cf]$/i.test(file.name);

export async function preparePhoto(file:File):Promise<{file:File}|{error:string}>{
 const heic=isHeic(file);
 if(!heic&&!['image/jpeg','image/png','image/webp'].includes(file.type))return {error:'Choose a JPG, PNG, WEBP or iPhone (HEIC) photo.'};
 let bitmap:ImageBitmap;
 try{bitmap=await createImageBitmap(file,{imageOrientation:'from-image'})}
 catch{return {error:heic?'This iPhone photo (HEIC) can’t be opened in this browser. Share it as a JPEG, or on your iPhone choose Settings → Camera → Formats → Most Compatible.':'This photo could not be read. Try another photo.'}}
 const {width,height}=bitmap;
 if(Math.min(width,height)<MIN_PHOTO_SIDE){bitmap.close();return {error:`This photo is too small (${width} × ${height}). Use a photo at least ${MIN_PHOTO_SIDE} × ${MIN_PHOTO_SIDE} pixels.`}}
 // JPEGs are always redrawn: phones store them sideways with a "rotate" note that the server removes with the metadata.
 if(!heic&&file.type!=='image/jpeg'&&file.size<=SMALL_FILE&&Math.max(width,height)<=MAX_PHOTO_SIDE){bitmap.close();return {file}}
 // Shrink to the maximum long side, but never below the minimum short side.
 const scale=Math.min(1,Math.max(MAX_PHOTO_SIDE/Math.max(width,height),MIN_PHOTO_SIDE/Math.min(width,height)));
 const canvas=document.createElement('canvas');canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
 const context=canvas.getContext('2d');if(!context){bitmap.close();return {file}}
 context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height); // Transparent areas become white, not black.
 context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',0.9));
 if(!blob)return {error:'This photo could not be prepared. Try another photo.'};
 return {file:new File([blob],file.name.replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg'})};
}
