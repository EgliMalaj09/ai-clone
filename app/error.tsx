'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="signin-gate"><span className="eyebrow">PROJECT STUDIO</span><h1>A quick intermission.</h1><p>The studio couldn’t load this page. Your saved work is safe.</p><button className="button primary" onClick={reset}>Try again</button><a href="/">Back to studio</a></main>}
