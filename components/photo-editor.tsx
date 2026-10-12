'use client';
import {useEffect,useRef,useState} from 'react';
import {RotateCw,ZoomIn} from 'lucide-react';
import {useI18n} from './i18n';
import {MIN_PHOTO_SIDE} from '@/lib/prepare-photo';

// Photo editing before upload (V19): rotate, zoom and drag so the face (or product) is centred, with a live preview of
// exactly what will be sent. The crop is a 4:5 portrait frame; "Use the whole photo" skips it.
const FRAME_W=280,FRAME_H=350,MAX_OUT=1600;

type View={zoom:number;rotation:number;x:number;y:number};
function draw(ctx:CanvasRenderingContext2D,img:HTMLImageElement,v:View,w:number,h:number){
 const turned=v.rotation%180!==0,iw=turned?img.naturalHeight:img.naturalWidth,ih=turned?img.naturalWidth:img.naturalHeight;
 const cover=Math.max(w/iw,h/ih)*v.zoom,k=w/FRAME_W;
 ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.save();ctx.translate(w/2+v.x*k,h/2+v.y*k);ctx.rotate(v.rotation*Math.PI/180);ctx.scale(cover,cover);
 ctx.drawImage(img,-img.naturalWidth/2,-img.naturalHeight/2);ctx.restore();
 return {sourceWidth:Math.round(w/cover)};
}

export function PhotoEditor({file,onDone,onCancel}:{file:File;onDone:(f:File)=>void;onCancel:()=>void}){
 const {t}=useI18n();const canvas=useRef<HTMLCanvasElement>(null);const [img,setImg]=useState<HTMLImageElement|null>(null);
 const [v,setV]=useState<View>({zoom:1,rotation:0,x:0,y:0});const drag=useRef<{x:number;y:number;ox:number;oy:number}|null>(null);const [busy,setBusy]=useState(false);
 useEffect(()=>{const url=URL.createObjectURL(file);const i=new Image();i.onload=()=>setImg(i);i.src=url;return()=>URL.revokeObjectURL(url)},[file]);
 useEffect(()=>{const c=canvas.current;if(!c||!img)return;const ctx=c.getContext('2d');if(ctx)draw(ctx,img,v,FRAME_W,FRAME_H)},[img,v]);
 // Detail left in the crop, in source pixels: too much zoom would send a photo below the minimum size.
 const sourceWidth=img?(()=>{const turned=v.rotation%180!==0,iw=turned?img.naturalHeight:img.naturalWidth,ih=turned?img.naturalWidth:img.naturalHeight;return Math.round(FRAME_W/(Math.max(FRAME_W/iw,FRAME_H/ih)*v.zoom))})():0;
 // A slightly smaller crop is enlarged to the minimum; much smaller would look blurry.
 const tooSmall=!!img&&sourceWidth<MIN_PHOTO_SIDE*0.75;
 async function useCrop(){if(!img)return;setBusy(true);const w=Math.min(MAX_OUT,Math.max(MIN_PHOTO_SIDE,sourceWidth)),h=Math.round(w*FRAME_H/FRAME_W);const out=document.createElement('canvas');out.width=w;out.height=h;const ctx=out.getContext('2d');if(!ctx){onDone(file);return}draw(ctx,img,v,w,h);
  const blob=await new Promise<Blob|null>(r=>out.toBlob(r,'image/jpeg',0.9));setBusy(false);onDone(blob?new File([blob],file.name.replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg'}):file);}
 return <div className="report-modal-overlay" role="dialog" aria-modal="true" aria-label={t('Adjust your photo')}><div className="report-modal photo-editor"><h2>{t('Adjust your photo')}</h2><p>{t('Drag to move, zoom and rotate so the face is in the middle of the frame. This is exactly what will be used.')}</p>
  <canvas ref={canvas} width={FRAME_W} height={FRAME_H} className="photo-editor-canvas" aria-label={t('Preview of the photo that will be used')}
   onPointerDown={e=>{(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,ox:v.x,oy:v.y}}}
   onPointerMove={e=>{const d=drag.current;if(d)setV(s=>({...s,x:d.ox+e.clientX-d.x,y:d.oy+e.clientY-d.y}))}} onPointerUp={()=>{drag.current=null}}
   onKeyDown={e=>{const step=10;if(e.key==='ArrowLeft')setV(s=>({...s,x:s.x-step}));if(e.key==='ArrowRight')setV(s=>({...s,x:s.x+step}));if(e.key==='ArrowUp')setV(s=>({...s,y:s.y-step}));if(e.key==='ArrowDown')setV(s=>({...s,y:s.y+step}))}} tabIndex={0}/>
  <div className="photo-editor-controls"><label><ZoomIn size={16}/><span className="sr-only">{t('Zoom')}</span><input type="range" min={1} max={3} step={0.05} value={v.zoom} onChange={e=>setV(s=>({...s,zoom:Number(e.target.value)}))} aria-label={t('Zoom')}/></label><button type="button" className="button secondary small" onClick={()=>setV(s=>({...s,rotation:(s.rotation+90)%360,x:0,y:0}))}><RotateCw size={15}/>{t('Rotate')}</button></div>
  {tooSmall&&<p className="error-text">{t('Zoomed in too far: the photo would be too small. Zoom out a little.')}</p>}
  <div className="modal-actions"><button type="button" className="text-button" onClick={onCancel}>{t('Cancel')}</button><button type="button" className="button secondary" onClick={()=>onDone(file)}>{t('Use the whole photo')}</button><button type="button" className="button primary" disabled={!img||tooSmall||busy} onClick={useCrop}>{t('Use this photo')}</button></div>
 </div></div>;
}
