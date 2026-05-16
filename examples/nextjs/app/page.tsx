import Search from './Search';

export default function Page() {
  return (
    <main>
      <h1>PDF Search — Next.js example</h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        Next.js 15 (App Router) loading <code>/searchIndex.json</code> on the client and running
        Fuse over it.
      </p>
      <Search />
    </main>
  );
}
