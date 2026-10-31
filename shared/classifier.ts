import { BOSS_NAME_MAX, EPITAPH_MAX, PLEA_MAX, RAID_SUMMARY_MAX, TAUNT_MAX } from './constants.js';
import { hashString, truncate } from './text.js';
import type { ChoreAction, Proposal, SenderGroup, SenderVerdict } from './types.js';

interface Rule {
  category: string;
  pattern: RegExp;
  action: ChoreAction;
  confidence: number;
  isImportant: boolean;
  summary: string;
}

/**
 * Ordered rules: the first match wins, so protective rules (money, deadlines,
 * security) come before promotional ones.
 */
const RULES: readonly Rule[] = [
  {
    category: 'Bills & banking',
    pattern:
      /\b(bank|statement|invoice|bill|payment due|emi|credit card|rent|receipt|tax|refund)\b|hdfc|icici|sbi|axis/i,
    action: 'rescue',
    confidence: 0.75,
    isImportant: true,
    summary: 'Bills, payments and bank mail',
  },
  {
    category: 'Deadlines',
    pattern:
      /\b(deadline|due|interview|exam|assignment|submission|urgent|offer letter|appointment|documents required)\b/i,
    action: 'rescue',
    confidence: 0.7,
    isImportant: true,
    summary: 'Deadlines and time-sensitive requests',
  },
  {
    category: 'Security',
    pattern: /\b(otp|verification code|password|security alert|new sign-in|login attempt)\b/i,
    action: 'keep',
    confidence: 0.6,
    isImportant: false,
    summary: 'Security and sign-in alerts',
  },
  {
    category: 'Food delivery',
    pattern: /swiggy|zomato|zepto|blinkit|domino|uber ?eats|instamart|\bfood\b/i,
    action: 'banish',
    confidence: 0.92,
    isImportant: false,
    summary: 'Food delivery promotions',
  },
  {
    category: 'Shopping',
    pattern: /amazon|flipkart|myntra|ajio|meesho|nykaa|\bsale\b|\boffer|\bdeal|% off|coupon/i,
    action: 'banish',
    confidence: 0.88,
    isImportant: false,
    summary: 'Shopping promotions',
  },
  {
    category: 'Job alerts',
    pattern: /naukri|unstop|internshala|indeed|glassdoor|foundit|job alert|jobs for you/i,
    action: 'banish',
    confidence: 0.78,
    isImportant: false,
    summary: 'Job portal alerts',
  },
  {
    category: 'Social',
    pattern: /linkedin|instagram|facebook|twitter|quora|reddit|pinterest|snapchat|\bx\.com/i,
    action: 'banish',
    confidence: 0.86,
    isImportant: false,
    summary: 'Social network notifications',
  },
  {
    category: 'Newsletters',
    pattern: /newsletter|digest|weekly|substack|medium|coursera|udemy|webinar|spotify|bookmyshow/i,
    action: 'banish',
    confidence: 0.8,
    isImportant: false,
    summary: 'Newsletters and promotional digests',
  },
];

const PERSONAL_DOMAINS = /@(gmail|outlook|hotmail|yahoo|icloud|proton(mail)?)\.|\.edu\b|\.ac\.in\b/i;

const MONSTERS: Readonly<Record<string, string>> = {
  a: 'Apparition',
  b: 'Banshee',
  c: 'Crypt Keeper',
  d: 'Demon',
  g: 'Ghoul',
  h: 'Haunt',
  l: 'Lich',
  m: 'Mummy',
  n: 'Necromancer',
  p: 'Phantom',
  r: 'Revenant',
  s: 'Specter',
  u: 'Undead',
  v: 'Vampire',
  w: 'Wraith',
  z: 'Zombie',
};
const FALLBACK_MONSTERS = ['Poltergeist', 'Spirit', 'Shade', 'Goblin'] as const;

/**
 * Picks a spooky, alliterative boss name for a sender, e.g. "The Swiggy Specter".
 * @param senderName Display name of the sender.
 */
export function bossNameFor(senderName: string): string {
  const name = senderName.trim() || 'Nameless';
  const first = name[0]?.toLowerCase() ?? '';
  const monster = MONSTERS[first] ?? FALLBACK_MONSTERS[hashString(name) % FALLBACK_MONSTERS.length];
  return truncate(`The ${name} ${monster}`, BOSS_NAME_MAX);
}

/**
 * Builds a deterministic taunt that references the sender's real mail.
 * @param group Sampled mail from one sender.
 */
export function tauntFor(group: SenderGroup): string {
  const subject = group.samples[0]?.subject;
  const emails = group.count === 1 ? 'an email' : `${group.count} emails`;
  const line = subject
    ? `I sent you ${emails} like "${truncate(subject, 50)}" and you never opened ${group.count === 1 ? 'it' : 'one'}. Fight me.`
    : `${group.count === 1 ? 'One unread email' : `${group.count} unread emails`} and you still haven't looked. Fight me.`;
  return truncate(line, TAUNT_MAX);
}

const PLEAS = [
  'Wait! I can give you 70% off if you let me live!',
  'Please! I only emailed you {count} times… this week.',
  "I can change! I'll only email you twice a day. Maybe thrice.",
  'Noooo! Who will remind you about offers you never wanted?',
  "Spare me and I'll unsubscribe myself. (I won't.)",
] as const;

const EPITAPHS = [
  'Here lies {name}. It sent {count} emails and got zero replies.',
  '{name} has left the chat. Your inbox can finally breathe.',
  '{name} has been exorcised. {count} fewer emails to feel guilty about.',
  'RIP {name}. Gone, but its unsubscribe link lives on.',
  '{name} has been archived into the shadow realm. Nobody will check on it.',
] as const;

function fill(template: string, group: SenderGroup): string {
  return template.replace('{name}', group.senderName.trim() || 'The ghost').replace('{count}', String(group.count));
}

/**
 * Funny line a boss begs with at half health.
 * @param group Sampled mail from one sender.
 */
export function pleaFor(group: SenderGroup): string {
  return truncate(fill(PLEAS[hashString(group.sender) % PLEAS.length] ?? PLEAS[0], group), PLEA_MAX);
}

/**
 * Funny one-liner shown when a boss is defeated.
 * @param group Sampled mail from one sender.
 */
export function epitaphFor(group: SenderGroup): string {
  return truncate(fill(EPITAPHS[hashString(group.senderName) % EPITAPHS.length] ?? EPITAPHS[0], group), EPITAPH_MAX);
}

/**
 * Classifies one sender with keyword rules. This is the offline fallback used
 * when Gemini is unavailable, so the game never breaks.
 * @param group Sampled mail from one sender.
 */
export function classifySender(group: SenderGroup): SenderVerdict {
  const haystack = [
    group.sender,
    group.senderName,
    ...group.samples.map((sample) => `${sample.subject} ${sample.snippet}`),
  ].join(' ');
  const rule = RULES.find((candidate) => candidate.pattern.test(haystack));
  const base = {
    sender: group.sender,
    bossName: bossNameFor(group.senderName),
    taunt: tauntFor(group),
    plea: pleaFor(group),
    epitaph: epitaphFor(group),
  };

  if (rule) {
    return {
      ...base,
      category: rule.category,
      action: rule.action,
      confidence: rule.confidence,
      isImportant: rule.isImportant,
      summary: truncate(rule.summary, RAID_SUMMARY_MAX),
    };
  }
  if (PERSONAL_DOMAINS.test(group.sender)) {
    return {
      ...base,
      category: 'Personal',
      action: 'rescue',
      confidence: 0.6,
      isImportant: true,
      summary: 'A personal email from a real person',
    };
  }
  return {
    ...base,
    category: 'Uncategorised',
    action: 'keep',
    confidence: 0.4,
    isImportant: false,
    summary: 'Mail that needs a human decision',
  };
}

/**
 * Builds a full proposal with the rule-based classifier.
 * @param groups Sender groups from the scan.
 */
export function fallbackProposal(groups: readonly SenderGroup[]): Proposal {
  const verdicts = groups.map(classifySender);
  const importantSenders = new Set(verdicts.filter((v) => v.isImportant).map((v) => v.sender));
  const importantIds = groups
    .filter((group) => importantSenders.has(group.sender))
    .flatMap((group) => group.samples.map((sample) => sample.id));
  return { verdicts, importantIds, source: 'fallback' };
}
