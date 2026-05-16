// @nuxt/content v3 collection configuration.
// We extend the default page schema with `rawbody` so the server helper
// (`extractPdfsFromContentDoc`) can read the raw markdown string instead
// of the parsed AST that the default `body` field carries.
import { defineCollection, defineContentConfig, z } from '@nuxt/content';

export default defineContentConfig({
  collections: {
    content: defineCollection({
      type: 'page',
      source: '**/*',
      schema: z.object({
        rawbody: z.string(),
      }),
    }),
  },
});
