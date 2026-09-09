"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="message-page"><h1>The library is unavailable</h1><p>Check that the library database is set up and the server can access it.</p><button className="tv-button button-primary button-normal" onClick={reset}>Try again</button><a href="/">Back to movies</a></main>; }
