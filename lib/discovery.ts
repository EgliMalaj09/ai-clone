import type {PublicTemplate} from './contracts';

export const ALL_CATEGORIES='All templates';
export const sortOptions=[['featured','Recommended'],['newest','Newest first'],['price-low','Price: low to high'],['price-high','Price: high to low']] as const;
export const tagOptions=[['all','All'],['trending','Trending'],['new','New'],['popular','Popular']] as const;
export type Sort=typeof sortOptions[number][0];
export type Tag=typeof tagOptions[number][0];
export type Filters={category:string;search:string;tag:Tag;sort:Sort};

const isSort=(v:unknown):v is Sort=>sortOptions.some(([key])=>key===v);
const isTag=(v:unknown):v is Tag=>tagOptions.some(([key])=>key===v);
/** Read filters from the page URL, falling back to defaults for missing or unknown values. */
export function filtersFromQuery(query:Record<string,string|undefined>):Filters{
 return {category:query.category||ALL_CATEGORIES,search:query.q||'',tag:isTag(query.tag)?query.tag:'all',sort:isSort(query.sort)?query.sort:'featured'};
}
/** The URL query for the filters, leaving out defaults so a plain catalog keeps a plain link. */
export function filtersToQuery(f:Filters,base:URLSearchParams){
 const q=new URLSearchParams(base);
 const set=(key:string,value:string,fallback:string)=>{if(value&&value!==fallback)q.set(key,value);else q.delete(key)};
 set('category',f.category,ALL_CATEGORIES);set('q',f.search.trim(),'');set('tag',f.tag,'all');set('sort',f.sort,'featured');
 return q;
}

export function matchesTemplate(t:PublicTemplate,f:Pick<Filters,'category'|'search'|'tag'>){
 const text=f.search.trim().toLowerCase();
 return (f.category===ALL_CATEGORIES||t.category===f.category)
  &&(!text||(t.name+' '+t.description+' '+t.category).toLowerCase().includes(text))
  &&(f.tag==='all'||f.tag==='trending'&&t.trending||f.tag==='new'&&t.isNew||f.tag==='popular'&&t.popular);
}
// Mirrors the server catalog order (lib/server/catalog-query.ts). Prices are compared within a currency only.
const comparators:Record<Sort,(a:PublicTemplate,b:PublicTemplate)=>number>={
 featured:(a,b)=>Number(b.featured)-Number(a.featured)||Number(b.trending)-Number(a.trending)||b.createdAt-a.createdAt,
 newest:(a,b)=>b.createdAt-a.createdAt,
 'price-low':(a,b)=>a.currency.localeCompare(b.currency)||a.price-b.price,
 'price-high':(a,b)=>a.currency.localeCompare(b.currency)||b.price-a.price,
};
export const sortTemplates=(list:PublicTemplate[],sort:Sort)=>[...list].sort((a,b)=>comparators[sort](a,b)||a.id.localeCompare(b.id));
/** Up to three posters for the home page: featured templates first, topped up with the rest of the catalog. */
export const heroTemplates=(list:PublicTemplate[])=>sortTemplates(list,'featured').slice(0,3);
