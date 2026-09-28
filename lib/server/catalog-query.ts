import {all,getPublicTemplate,HttpError,must,one,publicTemplate} from './data';
import {pageQuery} from './http';

export async function queryCatalog(url:URL,slug?:string){
 if(slug){const template=await getPublicTemplate(slug);if(!template)throw new HttpError(404,'Template unavailable.');return {template};}
 const {page,limit,offset}=pageQuery(url);
 const query=(url.searchParams.get('q')||'').trim().slice(0,150);
 const category=url.searchParams.get('category')||'all',tag=url.searchParams.get('tag')||'all',sort=url.searchParams.get('sort')||'featured';
 const flags:Record<string,string>={trending:'trending',new:'is_new',popular:'popular'};
 const sorting:Record<string,string>={featured:'featured DESC,trending DESC,created_at DESC',newest:'created_at DESC','price-low':'currency,price ASC','price-high':'currency,price DESC'};
 must(tag==='all'||Object.hasOwn(flags,tag),'Unknown discovery filter.');must(Object.hasOwn(sorting,sort),'Unknown sort order.');
 const where=['active=1'],args:unknown[]=[];
 if(query){const pattern='%'+query.replace(/[\\%_]/g,'\\$&')+'%';where.push("(name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')");args.push(pattern,pattern);}
 if(category!=='all'&&category!=='All templates'){where.push('category=?');args.push(category.slice(0,50));}
 if(tag!=='all')where.push(flags[tag]+'=1');
 const condition=' WHERE '+where.join(' AND ');
 const count=await one('SELECT COUNT(*) AS total FROM templates'+condition,...args);
 const templates=await all('SELECT * FROM templates'+condition+' ORDER BY '+sorting[sort]+',id LIMIT ? OFFSET ?',...args,limit,offset);
 const categories=await all('SELECT DISTINCT category FROM templates WHERE active=1 ORDER BY category');
 return {templates:templates.map(publicTemplate),categories:categories.map(c=>c.category),pagination:{page,limit,total:count?.total||0,pages:Math.max(1,Math.ceil((count?.total||0)/limit))}};
}
