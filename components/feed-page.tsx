import {useState} from 'react';
import {ArrowUpRight,Heart,Sparkles} from 'lucide-react';
import {toast} from 'sonner';
import {api,useAPI,ErrorBox,Loading} from './shared';
import {Pager} from './admin-operations';
import {useI18n} from './i18n';
import type {FeedItem,Pagination} from '@/lib/api-types';
import {isStaff,type StudioUser} from '@/lib/contracts';

/** One public video with its like button (V40); used by the feed and the template gallery. */
export function FeedCard({item,user,onChange}:{item:FeedItem;user:StudioUser|null;onChange?:()=>void}){
 const {t}=useI18n();const [state,setState]=useState({liked:item.liked,likes:item.likes});
 async function like(){if(!user){window.location.assign('/login?next=/feed');return}try{const r=await api<{liked:boolean;likes:number}>('generations/'+item.id+'/like','POST',{});setState(r)}catch(e){toast.error(t((e as Error).message))}}
 return <article className="feed-card"><video src={item.video} poster={item.thumbnail} controls playsInline loop muted preload="none"/><div className="feed-meta"><a href={'/template/'+item.templateSlug}><strong>{item.templateName}</strong><small>{t('Make your own')} <ArrowUpRight size={12}/></small></a><button className={'like-button'+(state.liked?' liked':'')} aria-pressed={state.liked} aria-label={t(state.liked?'Unlike':'Like')} onClick={like}><Heart size={16} fill={state.liked?'currentColor':'none'}/>{state.likes}</button></div>{isStaff(user?.role)&&<button className="text-button" onClick={async()=>{await api('admin/feed/'+item.id+'/hide','POST',{});toast.success('Hidden from the gallery and feed');onChange?.()}}>Hide (staff)</button>}</article>;
}
export function FeedPage({user}:{user:StudioUser|null}){
 const {t}=useI18n();const [sort,setSort]=useState('new'),[page,setPage]=useState(1);
 const {data,error,loading,refresh}=useAPI<{items:FeedItem[];pagination:Pagination}>('feed?sort='+sort+'&page='+page);
 return <div className="feed-page"><div className="page-heading"><div><span className="eyebrow">{t('COMMUNITY')}</span><h1>{t('Made by our community')}</h1><p>{t('Videos customers chose to share. Like your favourites, or make your own with the same template.')}</p></div><div className="segmented"><button className={sort==='new'?'active':''} onClick={()=>{setSort('new');setPage(1)}}>{t('Newest')}</button><button className={sort==='popular'?'active':''} onClick={()=>{setSort('popular');setPage(1)}}>{t('Most liked')}</button></div></div>
  {loading?<Loading/>:error||!data?<ErrorBox message={error} retry={refresh}/>:!data.items.length?<div className="empty-state"><Sparkles/><h3>{t('Nothing here yet.')}</h3><p>{t('Share one of your videos to the community from My creations.')}</p><a className="button primary" href="/explore">{t('Explore templates')}</a></div>:<div className="feed-grid">{data.items.map(i=><FeedCard key={i.id} item={i} user={user} onChange={refresh}/>)}</div>}
  <Pager pagination={data?.pagination} onPage={setPage}/></div>;
}
