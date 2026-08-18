/**
 * The blog's table of contents, in one place.
 *
 * A registry rather than a CMS: at this size a post is a page in the repo,
 * reviewed like any code, and the index cannot drift from reality because
 * this list is what renders it. The guides written before the blog existed
 * are listed here too; a reader does not care which folder wisdom lives in.
 */

export type BlogPost = {
  slug: string;
  /** Full path, because early guides live outside /blog. */
  href: string;
  title: string;
  description: string;
  /** ISO date, shown and used for ordering. */
  published: string;
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "live-in-vs-live-out-nanny-dubai",
    href: "/blog/live-in-vs-live-out-nanny-dubai",
    title: "Live-in or live-out nanny in Dubai: how to choose",
    description:
      "Costs, space, privacy and the law: the honest trade-offs, with real salary expectations from live profiles.",
    published: "2026-08-18",
  },
  {
    slug: "nanny-interview-questions",
    href: "/blog/nanny-interview-questions",
    title: "12 questions that actually matter in a nanny interview",
    description:
      "Get past rehearsed answers: what to ask, and what you are really listening for.",
    published: "2026-08-18",
  },
  {
    slug: "nanny-salary-dubai-2026",
    href: "/blog/nanny-salary-dubai-2026",
    title: "Nanny salaries in Dubai and the UAE, 2026: real numbers",
    description:
      "What nannies actually ask for, from live profiles on NaNanny: medians, ranges, and what moves the number.",
    published: "2026-08-18",
  },
  {
    slug: "hire-a-nanny-in-dubai-without-an-agency",
    href: "/guides/hire-a-nanny-in-dubai-without-an-agency",
    title: "How to hire a nanny in Dubai without an agency",
    description:
      "The direct route: where to look, what to check, and what you save when nobody stands in the middle.",
    published: "2026-08-14",
  },
];
