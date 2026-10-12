import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// The CMS can write unused optional fields as null or ''; treat those as absent
// so a stray empty field never fails the build.
const dropEmpty = (v: unknown) =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null && x !== ''))
    : v;

// One markdown file per page. Nested folders become nested URLs
// (how-to-help/churches.md -> /how-to-help/churches/).
const section = z.preprocess(dropEmpty, z.discriminatedUnion('_template', [
  z.object({
    _template: z.literal('callout'),
    heading: z.string(),
    text: z.string().optional(),
    button_label: z.string().optional(),
    button_url: z.string().optional(),
  }),
  z.object({
    _template: z.literal('text'),
    body: z.string().optional(),
    center: z.boolean().optional(),
    anchor: z.string().optional(),
    background_image: z.string().optional(),
    columns: z.number().optional(),
    button_label: z.string().optional(),
    button_url: z.string().optional(),
  }),
  z.object({
    _template: z.literal('two_column'),
    style: z.string().optional(),
    left: z.string().optional(),
    left_image: z.string().optional(),
    left_image_alt: z.string().optional(),
    right: z.string().optional(),
    right_image: z.string().optional(),
    right_image_alt: z.string().optional(),
    button_label: z.string().optional(),
    button_url: z.string().optional(),
  }),
  z.object({
    _template: z.literal('help_columns'),
    items: z.array(z.preprocess(dropEmpty, z.object({
      title: z.string(),
      icon: z.string().optional(),
      link_label: z.string().optional(),
      link_url: z.string().optional(),
    }))),
  }),
  z.object({
    _template: z.literal('contact_form'),
    intro: z.string().optional(),
    button_label: z.string().optional(),
    button_url: z.string().optional(),
  }),
]));

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    heading: z.string().optional(),
    description: z.string().optional(),
    order: z.number().optional(),
    sections: z.array(section).default([]),
  }),
});

const singles = defineCollection({
  loader: glob({ pattern: '*.yml', base: './src/content/singles' }),
  schema: z.any(),
});

export const collections = { pages, singles };
