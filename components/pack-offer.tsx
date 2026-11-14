'use client';
import {ArrowRight,Gift,Sparkles} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {money,percentOff} from '@/lib/contracts';
import type {CreditPackage,PackOffer} from '@/lib/api-types';
import {useAPI,Busy} from './shared';
import {useI18n} from './i18n';

/** Price of a pack after the special offer (when the offer is for this pack). */
export const offerAmount=(p:CreditPackage,offer:PackOffer|null|undefined,currency:string)=>{const full=p.prices[currency];return offer&&offer.packageId===p.id&&full?percentOff(full,offer.percent,currency):full;};

/** Animated "% off" badge for the pack on offer. */
export function OfferRibbon({percent}:{percent:number}){
 const {t:tr}=useI18n();
 return <span className="offer-ribbon"><Sparkles size={13}/>{tr('Special offer −{n}%',{n:percent})}</span>;
}

/**
 * Shown when someone is about to buy one video without a pack: the pack on offer (or the best-value pack) next to the
 * single-video price, so the pack is clearly the better deal. "No thanks" goes on to buy the single video.
 */
export function SingleVideoOffer({open,onOpenChange,cost,currency,singleAmount,next,busy,onSingle}:{open:boolean;onOpenChange:(v:boolean)=>void;cost:number;currency:string;singleAmount:number;next:string;busy:boolean;onSingle:()=>void}){
 const {t:tr}=useI18n();
 const data=useAPI<{packages:CreditPackage[];offer:PackOffer|null}>(open?'credit-packages':null);
 const packs=(data.data?.packages||[]).filter(p=>p.prices[currency]&&p.totalCredits>=cost);
 const offer=data.data?.offer;
 // The pack on offer when it covers this video, else the pack with the cheapest credits.
 const pack=packs.find(p=>offer?.packageId===p.id)||packs.slice().sort((a,b)=>a.prices[currency]/a.totalCredits-b.prices[currency]/b.totalCredits)[0];
 const onOffer=!!pack&&offer?.packageId===pack.id;
 const amount=pack?offerAmount(pack,offer,currency):0,videos=pack?Math.floor(pack.totalCredits/cost):0,perVideo=videos?Math.round(amount/videos):0;
 const href='/credits?pack='+(pack?.id||'')+'&next='+encodeURIComponent(next);
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="offer-dialog">
  <div className="offer-burst" aria-hidden="true">{Array.from({length:10},(_,i)=><i key={i} style={{'--i':i} as React.CSSProperties}/>)}</div>
  {data.loading||!data.data?<div className="offer-loading"><Busy/></div>:!pack?<>
   <DialogTitle>{tr('Buy just this video')}</DialogTitle><DialogDescription>{tr('One video for {price}.',{price:money(singleAmount,currency)})}</DialogDescription>
   <button className="button primary full" disabled={busy} onClick={onSingle}>{busy?<Busy>{tr('Starting checkout...')}</Busy>:<>{tr('Buy this video — {price}',{price:money(singleAmount,currency)})}<ArrowRight size={17}/></>}</button>
  </>:<>
   <span className="offer-icon"><Gift size={30}/></span>
   {onOffer&&<OfferRibbon percent={offer!.percent}/>}
   <DialogTitle className="offer-title">{tr(onOffer?'Wait — a special offer for you':'Better value with a pack')}</DialogTitle>
   <DialogDescription>{tr('Get {n} videos like this one with {name}, instead of paying for one.',{n:videos,name:pack.name})}</DialogDescription>
   <div className="offer-compare">
    <div className="offer-pack"><span>{pack.name} · {tr('{n} videos',{n:videos})}</span><strong>{money(amount,currency)}</strong>{amount<pack.prices[currency]&&<s>{money(pack.prices[currency],currency)}</s>}<small>{tr('{price} per video',{price:money(perVideo,currency)})}</small></div>
    <div className="offer-single"><span>{tr('Just this video')}</span><strong>{money(singleAmount,currency)}</strong><small>{tr('1 video')}</small></div>
   </div>
   <a className="button primary full offer-cta" href={href}><Sparkles size={18}/>{tr(onOffer?'Get the offer':'Choose {name}',{name:pack.name})}<ArrowRight size={18}/></a>
   <button type="button" className="text-button offer-skip" disabled={busy} onClick={onSingle}>{busy?<Busy>{tr('Starting checkout...')}</Busy>:tr('No thanks, buy just this video — {price}',{price:money(singleAmount,currency)})}</button>
  </>}
 </DialogContent></Dialog>;
}
