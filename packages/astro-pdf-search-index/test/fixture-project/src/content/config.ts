import { defineCollection, z } from 'astro:content';

export const collections = {
  resources: defineCollection({
    schema: z.object({ title: z.string() }),
  }),
};
