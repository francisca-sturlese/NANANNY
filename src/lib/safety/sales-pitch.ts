/**
 * Recognising a cold sales pitch sent through the contact form.
 *
 * A contact form on a public website receives these forever. There is no
 * version of the product where they stop arriving, so the thing worth changing
 * is not whether they arrive but whether they cost anybody attention: the one
 * that prompted this was sitting under "Needs a reply" with a badge on the
 * navigation, next to messages from families who actually need something.
 *
 * Filed rather than deleted, and never blocked at the form. Two reasons, and
 * the second is the important one.
 *
 * A false positive here is a real person whose message we hid, and the only way
 * that gets noticed is if the message is still somewhere to be found. So this
 * only ever moves a request into its own tab.
 *
 * And refusing it at the form would tell whoever is sending them exactly which
 * words to avoid, which turns a permanent nuisance into an arms race. Letting
 * it through and filing it costs us nothing and teaches them nothing.
 *
 * No model anywhere near this. It is a word list, it is wrong sometimes, and
 * both of those are on purpose: a person can read it, predict it, and correct
 * it, which is worth more than being right slightly more often.
 */

/**
 * Words that only appear in this kind of message.
 *
 * One of these is enough. Nobody writing to a nanny marketplace about their
 * account mentions backlinks.
 */
const UNMISTAKABLE = [
  "seo",
  "backlink",
  "link building",
  "guest post",
  "domain authority",
  "google ranking",
  "search engine ranking",
  "digital marketing agency",
  "lead generation",
  "cold email",
  "we are a software",
  "our development team",
];

/**
 * Words that are ordinary on their own and telling together.
 *
 * Two of these. A family might ask about a price list; a family asking about a
 * price list and increasing traffic and online visibility is not a family.
 */
const TOGETHER = [
  "increase traffic",
  "grow your online",
  "online visibility",
  "rank higher",
  "price list",
  "send you a quote",
  "we help businesses",
  "our services",
  "web design",
  "wordpress",
  "shopify",
  "wix",
  "squarespace",
  "collaborate with you",
  "partnership opportunity",
  "boost your",
];

/**
 * Whether a message reads as an unsolicited pitch.
 *
 * Subject and body together: the subject alone carries too little, and a body
 * alone misses "Re: Increase traffic to your website" on top of two polite
 * paragraphs.
 */
export function looksLikeSalesPitch(subject: string, message: string): boolean {
  const text = `${subject}\n${message}`.toLowerCase();

  if (UNMISTAKABLE.some((word) => text.includes(word))) return true;

  const hits = TOGETHER.filter((word) => text.includes(word));
  return hits.length >= 2;
}
