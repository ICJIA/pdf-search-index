import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

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
