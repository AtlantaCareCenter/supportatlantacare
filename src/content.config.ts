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
    _template: z.literal('events_list'),
    heading: z.string().optional(),
    empty_text: z.string().optional(),
    show_past: z.boolean().optional(),
    past_heading: z.string().optional(),
  }),
  z.object({
    _template: z.literal('contact_details'),
    intro: z.string().optional(),
    note: z.string().optional(),
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

// The editor writes dates unquoted (2026-10-12), which YAML reads as a Date; keep them as YYYY-MM-DD text.
const dateStr = z.preprocess((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v), z.string());

// One markdown file per event; the body is the description.
const events = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/events' }),
  schema: z.preprocess(dropEmpty, z.object({
    title: z.string(),
    status: z.enum(['draft', 'published', 'archived']).default('published'),
    publish_on: dateStr.optional(),
    remove_after: dateStr.optional(),
    dates: z.array(z.preprocess(dropEmpty, z.object({
      date: dateStr,
      start_time: z.string().optional(),
      end_time: z.string().optional(),
    }))).default([]),
    repeat: z.preprocess(dropEmpty, z.object({
      rule: z.string().optional(),
      every: z.number().optional(),
      until: dateStr.optional(),
      summary: z.string().optional(),
    })).optional(),
    location: z.string().optional(),
    summary: z.string().optional(),
    link_label: z.string().optional(),
    link_url: z.string().optional(),
    image: z.string().optional(),
    image_alt: z.string().optional(),
  })),
});

const singles = defineCollection({
  loader: glob({ pattern: '*.yml', base: './src/content/singles' }),
  schema: z.any(),
});

export const collections = { pages, events, singles };
