// Shrinks studio preview images (thumbnails and example images) in the browser before upload, so every visitor
// downloads a small file instead of the original camera photo (X1.6). Long side capped at 1080 px, saved as WebP;
// the original is kept when it is already small enough or the browser can't encode WebP.

const MAX_SIDE=1080,QUALITY=0.82;

export async function preparePreviewImage(file:File):Promise<File>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))return file;
 let bitmap:ImageBitmap;
 try{bitmap=await createImageBitmap(file,{imageOrientation:'from-image'})}catch{return file}
 const {width,height}=bitmap,scale=Math.min(1,MAX_SIDE/Math.max(width,height));
 const canvas=document.createElement('canvas');canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
 const context=canvas.getContext('2d');if(!context){bitmap.close();return file}
 context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',QUALITY));
 // Browsers without WebP encoding return PNG instead; keep the original then.
 if(!blob||blob.type!=='image/webp'||(scale===1&&blob.size>=file.size))return file;
 return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.webp',{type:'image/webp'});
}
