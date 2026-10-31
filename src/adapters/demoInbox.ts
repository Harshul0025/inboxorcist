import { DEMO_SEED, DEMO_TOTAL_EMAILS, SCAN_SAMPLE_SIZE } from '../../shared/constants';
import type { EmailItem } from '../../shared/types';

interface DemoSender {
  name: string;
  email: string;
  weight: number;
  subjects: readonly string[];
  unsubscribe?: boolean;
}

/** Bulk senders that make up the haunted demo inbox. */
const BULK_SENDERS: readonly [DemoSender, ...DemoSender[]] = [
  {
    name: 'Swiggy',
    email: 'offers@swiggy.in',
    weight: 14,
    unsubscribe: true,
    subjects: ['Flat 60% off on biryani tonight 🍗', 'Your midnight cravings called', 'Free delivery ends in 2 hours'],
  },
  {
    name: 'Zomato',
    email: 'noreply@zomato.com',
    weight: 12,
    unsubscribe: true,
    subjects: ['Gold members: 1+1 on desserts', 'We miss you! ₹125 off inside', 'Rainy day = pakoda day'],
  },
  {
    name: 'LinkedIn',
    email: 'notifications@linkedin.com',
    weight: 13,
    subjects: [
      '47 people viewed your profile',
      'You appeared in 12 searches this week',
      'Congratulate Rahul on a new role',
    ],
  },
  {
    name: 'Myntra',
    email: 'updates@myntra.com',
    weight: 9,
    unsubscribe: true,
    subjects: ['End of Reason Sale is LIVE', 'Items in your cart are selling fast', 'Extra 10% off for you'],
  },
  {
    name: 'Flipkart',
    email: 'promos@flipkart.com',
    weight: 9,
    unsubscribe: true,
    subjects: ['Big Billion Days preview', 'Price drop on items you viewed', 'Your SuperCoins expire soon'],
  },
  {
    name: 'Unstop',
    email: 'hello@unstop.com',
    weight: 8,
    unsubscribe: true,
    subjects: ['23 hackathons closing this week', 'New: case study competition', 'Registrations open for CodeSprint'],
  },
  {
    name: 'Naukri',
    email: 'jobs@naukri.com',
    weight: 7,
    unsubscribe: true,
    subjects: ['Jobs for you: Frontend Intern', '15 recruiters are hiring', 'Update your profile to get noticed'],
  },
  {
    name: 'Instagram',
    email: 'no-reply@mail.instagram.com',
    weight: 7,
    subjects: ['You have 9 new notifications', 'See what your friends posted', 'Someone mentioned you in a comment'],
  },
  {
    name: 'Quora Digest',
    email: 'digest-noreply@quora.com',
    weight: 6,
    unsubscribe: true,
    subjects: ['Why do engineers love chai?', 'What is the hardest DSA question?', 'Top stories for you'],
  },
  {
    name: 'Medium Daily Digest',
    email: 'noreply@medium.com',
    weight: 5,
    unsubscribe: true,
    subjects: ['10 VS Code tricks you missed', 'Stop writing bad React', 'Your daily read'],
  },
  {
    name: 'Zepto',
    email: 'offers@zepto.co',
    weight: 5,
    unsubscribe: true,
    subjects: ['10-minute delivery, 50% off', 'Maggi restocked!', 'Weekend deals inside'],
  },
  {
    name: 'Amazon',
    email: 'store-news@amazon.in',
    weight: 5,
    unsubscribe: true,
    subjects: ['Deals of the day', 'Recommended for you', 'Prime Day early access'],
  },
  {
    name: 'Coursera',
    email: 'no-reply@coursera.org',
    weight: 4,
    unsubscribe: true,
    subjects: ['Continue your course', 'Learners like you also enrolled in', 'New certificate programs'],
  },
  {
    name: 'BookMyShow',
    email: 'offers@bookmyshow.com',
    weight: 3,
    unsubscribe: true,
    subjects: ['Weekend plans sorted', 'New releases near you', 'Flat ₹100 off movie tickets'],
  },
  {
    name: 'Spotify',
    email: 'no-reply@spotify.com',
    weight: 3,
    unsubscribe: true,
    subjects: ['Your Release Radar is here', 'Premium at ₹59 for 3 months', 'New music Friday'],
  },
];

/** Low-volume senders the classifier is unsure about: these become ghosts. */
const UNCERTAIN_SENDERS: readonly DemoSender[] = [
  { name: 'GDG Campus', email: 'gdg@community.dev', weight: 1, subjects: ['Build with AI meetup this Saturday'] },
  { name: 'Student Council', email: 'council@studentmail.org', weight: 1, subjects: ['Fest volunteer list (final)'] },
  {
    name: 'Hostel Office',
    email: 'hostel@campusmail.org',
    weight: 1,
    subjects: ['Water supply maintenance on Sunday'],
  },
  { name: 'GitHub', email: 'noreply@github.com', weight: 1, subjects: ['[inboxorcist] CI run summary'] },
  { name: 'Notion', email: 'team@makenotion.com', weight: 1, subjects: ['What’s new in Notion this month'] },
  { name: 'Library', email: 'library@campusmail.org', weight: 1, subjects: ['Book return reminder'] },
];

/** Important mail from real people, money and deadlines: the trapped souls. */
const IMPORTANT: readonly { name: string; email: string; subject: string; snippet: string }[] = [
  {
    name: 'Riya Sharma',
    email: 'riya.sharma@gmail.com',
    subject: 'Are we still meeting for the project?',
    snippet: 'Let me know by tonight so I can book the room.',
  },
  {
    name: 'Prof. A. Mehta',
    email: 'a.mehta@university.edu',
    subject: 'Assignment 3 deadline moved to Friday',
    snippet: 'Please submit via the portal before 5 PM.',
  },
  {
    name: 'Placement Cell',
    email: 'placements@university.edu',
    subject: 'Interview slot confirmation required',
    snippet: 'Confirm your slot for the on-campus interview.',
  },
  {
    name: 'HDFC Bank',
    email: 'alerts@hdfcbank.net',
    subject: 'Your credit card statement is ready',
    snippet: 'Payment due on the 15th. Minimum amount due…',
  },
  {
    name: 'Electricity Board',
    email: 'billing@power-dept.in',
    subject: 'Electricity bill due in 3 days',
    snippet: 'Pay before the due date to avoid a late fee.',
  },
  {
    name: 'Mom',
    email: 'mom.home@gmail.com',
    subject: 'Call me when you are free',
    snippet: 'Nothing urgent, just want to talk.',
  },
  {
    name: 'Hackathon Team',
    email: 'team.lead@outlook.com',
    subject: 'Submission checklist for today',
    snippet: 'Repo public, Cloud Run link, description…',
  },
  {
    name: 'Scholarship Office',
    email: 'scholarships@university.edu',
    subject: 'Documents required for renewal',
    snippet: 'Upload your marksheet and income certificate.',
  },
  {
    name: 'Landlord',
    email: 'k.verma.rentals@gmail.com',
    subject: 'Rent receipt for October',
    snippet: 'Attached is the receipt for this month.',
  },
  {
    name: 'Visa Centre',
    email: 'appointments@visa-centre.org',
    subject: 'Appointment confirmation',
    snippet: 'Your biometrics appointment is scheduled.',
  },
];

/**
 * Small, fast seeded PRNG (mulberry32) so the demo inbox is identical on
 * every load and in every test.
 * @param seed 32-bit seed.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function demoId(index: number): string {
  return `demo-${String(index).padStart(5, '0')}`;
}

/**
 * Generates the synthetic haunted inbox, newest first.
 * @param total Total number of unread emails.
 * @param seed PRNG seed.
 */
export function generateDemoInbox(total: number = DEMO_TOTAL_EMAILS, seed: number = DEMO_SEED): EmailItem[] {
  const random = mulberry32(seed);
  let index = 0;
  const make = (
    sender: { name: string; email: string },
    subject: string,
    snippet: string,
    unsubscribe = false,
  ): EmailItem => {
    const id = demoId(index);
    index += 1;
    return {
      id,
      threadId: id,
      senderEmail: sender.email,
      senderName: sender.name,
      subject,
      snippet,
      messageIdHeader: `<${id}@demo.inboxorcist>`,
      ...(unsubscribe ? { unsubscribeUrl: `https://unsubscribe.example.com/${encodeURIComponent(sender.email)}` } : {}),
    };
  };

  const special = [
    ...IMPORTANT.map((soul) => make(soul, soul.subject, soul.snippet)),
    ...UNCERTAIN_SENDERS.map((sender) =>
      make(sender, sender.subjects[0] ?? 'Hello', 'Sent to the campus mailing list.'),
    ),
  ];

  const weightSum = BULK_SENDERS.reduce((sum, sender) => sum + sender.weight, 0);
  const pick = (): DemoSender => {
    let roll = random() * weightSum;
    for (const sender of BULK_SENDERS) {
      roll -= sender.weight;
      if (roll <= 0) return sender;
    }
    // Unreachable for random() < 1, but keeps the function total.
    return BULK_SENDERS[0];
  };
  const emails: EmailItem[] = [];
  for (let i = special.length; i < total; i += 1) {
    const sender = pick();
    const subject = sender.subjects[Math.floor(random() * sender.subjects.length)] ?? 'Hello';
    emails.push(
      make(sender, subject, `${sender.name} • Tap to see more. Unsubscribe anytime.`, sender.unsubscribe ?? false),
    );
  }

  // Important and uncertain mail is recent, so it lands inside the scan sample.
  const recentWindow = Math.max(1, Math.min(SCAN_SAMPLE_SIZE, emails.length));
  for (const email of special) emails.splice(Math.floor(random() * recentWindow), 0, email);
  return emails;
}
