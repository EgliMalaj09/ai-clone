// NgaZero loader: glossy rounded cards in rainbow colours chasing round a circle.
// Rendered in Blender (scripts/blender/loader-cards.py, rebuilt with `node scripts/render-loader.mjs`)
// and played as a transparent looping WebP, so it looks the same on every device and needs no 3D code.
// Viewers who turn off motion get a still frame.
type Props={size?:number;className?:string;eager?:boolean};

export function CardLoader({size=110,className,eager}:Props){
 return <span className={'card-loader'+(className?' '+className:'')} aria-hidden="true"><picture>
  <source srcSet="/media/loader-cards.png" media="(prefers-reduced-motion: reduce)"/>
  <img src="/media/loader-cards.webp" width={size} height={size} alt="" decoding="async" loading={eager?'eager':'lazy'} style={{width:size,height:size}}/>
  </picture></span>;
}
