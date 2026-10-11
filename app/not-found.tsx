import Link from 'next/link';
export const metadata={title:'Page not found | PROJECT STUDIO'};
export default function NotFound(){return <main className="signin-gate"><span className="eyebrow">PROJECT STUDIO</span><h1>This scene is missing.</h1><p>The template may be unavailable, or the link has changed.</p><Link className="button primary" href="/explore">Explore templates</Link></main>}
