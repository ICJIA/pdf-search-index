'use client';

import { useEffect, useMemo, useState } from 'react';
import Fuse, { type FuseResult } from 'fuse.js';
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';
import type { IndexedPdf } from '@icjia/pdf-search-index';

export default function Search() {
  const [rows, setRows] = useState<IndexedPdf[]>([]);
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/searchIndex.json')
      .then((r) => r.json())
      .then((j: IndexedPdf[]) => {
        setRows(j);
        setLoaded(true);
      });
  }, []);

  const fuse = useMemo(
    () =>
      new Fuse(rows, {
        keys: ['title', 'text'],
        threshold: 0.2,
        ignoreLocation: true,
        minMatchCharLength: 2,
        includeMatches: true,
      }),
    [rows],
  );

  const results: FuseResult<IndexedPdf>[] = useMemo(
    () => (query.trim() ? fuse.search(query) : []),
    [query, fuse],
  );

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the PDF corpus…"
        style={{
          width: '100%',
          padding: '0.6rem 0.75rem',
          fontSize: '1rem',
          border: '2px solid #0d4474',
          borderRadius: 4,
        }}
      />
      <p style={{ color: '#555' }}>
        {!loaded
          ? 'Loading…'
          : !query.trim()
            ? `${rows.length} PDF(s) indexed. Try "stigma", "methamphetamine", "juvenile".`
            : results.length === 0
              ? `No matches for "${query}".`
              : `${results.length} match(es).`}
      </p>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {results.slice(0, 50).map((r) => (
          <li
            key={r.item.id}
            style={{
              margin: '0.5rem 0',
              padding: '0.75rem 1rem',
              border: '1px solid #ddd',
              borderRadius: 4,
            }}
          >
            <a
              href={r.item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#0d4474', textDecoration: 'none', fontWeight: 600 }}
            >
              {r.item.title}
            </a>
            <p
              style={{ color: '#555', fontSize: '0.9rem', marginTop: '0.4rem' }}
              dangerouslySetInnerHTML={{ __html: snippetHTMLFor(r) }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
