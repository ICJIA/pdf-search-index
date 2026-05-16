import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Drop-in `fetch` replacement that resolves `file://` URLs to local files,
 * delegating everything else to the global fetch. Lets the build step index
 * local PDF fixtures without spinning up an HTTP server.
 */
export const localFetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.startsWith('file://')) {
    const buf = await readFile(fileURLToPath(url));
    return new Response(buf, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(buf.byteLength),
      },
    });
  }
  return fetch(input, init);
};
