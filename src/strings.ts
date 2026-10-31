import type { ChoreAction } from '../shared/types';
import { formatCount } from './lib/scoring';

/** Every user-facing string in one place. */
export const strings = {
  appName: 'Inboxorcist',
  tagline: 'Play a game. Your inbox actually gets cleaned.',
  skipToContent: 'Skip to main content',

  settings: {
    streamer: 'Streamer mode',
    streamerHint: 'Blurs senders and subjects for projectors and screen shares.',
    sound: 'Sound',
  },

  home: {
    heading: 'Your inbox is haunted.',
    intro:
      'Every unread email is a ghost. Gemini turns your biggest senders into bosses: every hit you land really marks their mail read and archives it. Nothing is ever deleted, and one click undoes the whole run.',
    demoTitle: 'Play the demo',
    demoBody: 'A haunted inbox of 2,000 emails. No sign-in needed.',
    demoCta: 'Play demo',
    gmailTitle: 'Clean my Gmail',
    gmailBody: 'Connect Gmail and exorcise your real inbox. The access token stays in your browser.',
    gmailCta: 'Connect Gmail',
    gmailUnavailable: 'Gmail sign-in is not configured on this deployment.',
    connecting: 'Opening Google sign-in…',
    connectFailed: 'Google sign-in was cancelled or failed. Please try again.',
    raidTitle: 'Raid night',
    raidBody: 'Everyone in the room joins from their phone and cleans one inbox together.',
    raidDemoCta: 'Host a demo raid',
    raidGmailCta: 'Host a Gmail raid',
    raidUnavailable: 'Raid mode needs Firebase, which is not configured on this deployment.',
    joinTitle: 'Join a raid',
    joinLabel: 'Room code',
    joinCta: 'Join',
    safety:
      'Safety: nothing is trashed. Banished mail is archived with a run label, important mail can only be rescued, and Resurrect restores everything.',
  },

  scan: {
    scanning: 'Summoning your inbox…',
    progress: (done: number, total: number) => `Reading ${done} of ${total} recent emails`,
    consulting: 'The game master (Gemini) is studying your ghosts…',
    failed: 'Could not read the inbox.',
    retry: 'Try again',
  },

  briefing: {
    heading: 'The haunting',
    unread: (count: number) => `${formatCount(count)} unread emails are haunting this inbox.`,
    bosses: 'Bosses',
    hp: (hp: number) => `~${formatCount(hp)} HP`,
    waves: (count: number) => `${count} ghost ${count === 1 ? 'wave' : 'waves'} of uncertain mail`,
    souls: (count: number) => `${count} trapped ${count === 1 ? 'soul' : 'souls'} (important mail) to rescue`,
    source: (source: 'gemini' | 'fallback') =>
      source === 'gemini' ? 'Verdicts by Gemini' : 'Verdicts by the offline rulebook (Gemini unavailable)',
    drafts: 'Draft replies for rescued emails with Gemini',
    draftsHint: 'Asks for permission to create Gmail drafts the first time.',
    draftsFailed: 'Draft permission was not granted, so replies will not be drafted.',
    start: 'Start exorcism',
    back: 'Back',
    nothing: 'This inbox is already clean. No ghosts here.',
  },

  hud: {
    score: 'Score',
    combo: 'Combo',
    unread: 'Unread',
    encounter: (index: number, total: number) => `Encounter ${index} of ${total}`,
    quit: 'End run',
  },

  boss: {
    loading: 'The boss is materialising…',
    hp: 'Boss health',
    hpValue: (hp: number, max: number) => `${formatCount(hp)} of ${formatCount(max)} emails left`,
    strike: (key: string) => `Strike the weak spot (or press ${key})`,
    instructions: 'Click or tap the glowing weak spot, or press the arrow key it shows. Every hit archives real email.',
    cleared: (count: number) => `${formatCount(count)} emails exorcised`,
    defeated: (name: string) => `${name} has been exorcised!`,
    error: 'The boss resisted (a request failed). Your progress is safe.',
    retry: 'Retry',
    empty: 'This boss already fled. No unread mail left from this sender.',
    continue: 'Continue',
  },

  seal: {
    heading: 'Seal it forever?',
    body: 'Create a Gmail filter so future mail from this sender skips your inbox, and unsubscribe if the sender supports one-click unsubscribe.',
    confirm: 'Seal forever',
    skip: 'Not now',
    working: 'Sealing…',
    done: (unsubscribed: boolean) =>
      unsubscribed
        ? 'Sealed: future mail skips your inbox and you are unsubscribed.'
        : 'Sealed: future mail skips your inbox.',
    failed: 'Could not seal this sender. Nothing was changed.',
  },

  ghosts: {
    heading: 'Ghost wave',
    soulsHeading: 'Trapped souls',
    soulsIntro: 'These look important. They can only be rescued or left alone, never banished.',
    of: (index: number, total: number) => `Ghost ${index} of ${total}`,
    suggestion: (action: ChoreAction, confidence: number) =>
      `Gemini suggests: ${actionLabel(action)} (${Math.round(confidence * 100)}% sure)`,
    timeLeft: (seconds: number) => `${seconds}s left`,
    banish: 'Banish',
    keep: 'Keep',
    rescue: 'Rescue',
    banishDisabled: 'Important mail cannot be banished',
    timeout: 'Too slow! The ghost was kept.',
    failed: 'That action failed and will not be counted.',
    drafted: 'Reply draft saved.',
    decided: (action: ChoreAction) => (action === 'banish' ? 'Banished.' : action === 'rescue' ? 'Rescued.' : 'Kept.'),
  },

  end: {
    heading: 'Exorcism complete',
    cleared: 'Emails exorcised',
    rescued: 'Souls rescued',
    kept: 'Kept',
    sealed: 'Senders sealed',
    bosses: 'Bosses defeated',
    time: 'Time',
    unread: 'Unread',
    unreadChange: (before: number, after: number) => `${formatCount(before)} → ${formatCount(after)}`,
    saved: (minutes: number) => `About ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} of triage saved`,
    bestCombo: 'Best combo',
    score: 'Score',
    roastHeading: 'Gemini’s verdict',
    roastLoading: 'Gemini is preparing a roast…',
    resurrect: 'Resurrect (undo everything)',
    resurrectConfirm: 'Restore every email banished in this run and remove its filters?',
    resurrectYes: 'Yes, resurrect',
    resurrectNo: 'Cancel',
    resurrecting: 'Resurrecting…',
    resurrected: (count: number) => `${formatCount(count)} emails restored to your inbox.`,
    resurrectFailed: 'Undo failed. Your mail is safe under the Inboxorcist label in Gmail; try again.',
    share: 'Copy result',
    copied: 'Result copied!',
    shareText: (cleared: number, time: string) =>
      `I exorcised ${formatCount(cleared)} unread emails in ${time} playing Inboxorcist 👻`,
    home: 'Home',
    again: 'Play again',
    mvp: 'Raid MVPs',
    taps: (taps: number) => `${formatCount(taps)} taps`,
  },

  raid: {
    hostHeading: 'Raid lobby',
    preparing: 'Preparing the raid…',
    joinUrl: 'Scan to join, or open the site and enter the code',
    code: 'Room code',
    qrAlt: (code: string) => `QR code to join raid ${code}`,
    players: (count: number) => `${count} ghost ${count === 1 ? 'hunter' : 'hunters'} joined`,
    noPlayers: 'Waiting for players…',
    start: 'Start the raid',
    hostOffline: 'Connection lost. The raid is paused and will resume when you are back online.',
    playerPaused: 'The host disconnected. The raid is paused…',
    bossPrompt: 'Everyone: tap as fast as you can!',
    tapsToHit: (taps: number, needed: number) => `${taps} / ${needed} taps to the next hit`,
    voteHeading: 'Vote!',
    voteBanish: 'Banish',
    voteKeep: 'Keep',
    voteCountdown: (seconds: number) => `${seconds}s to vote`,
    voted: 'Vote locked in.',
    voteResult: (banish: number, keep: number, winner: 'banish' | 'keep') =>
      `${banish} banish vs ${keep} keep: ${winner === 'banish' ? 'banished!' : 'kept.'}`,
    soulsHost: 'Only the host can rescue trapped souls.',
    joinHeading: 'Join the raid',
    nickname: 'Ghost-hunter nickname',
    join: 'Join raid',
    joining: 'Joining…',
    joinFailed: 'Could not join. Check the code and try again.',
    createFailed: 'Could not create a raid room. Check the Firebase setup and try again.',
    waiting: 'You are in! Waiting for the host to start…',
    tap: 'TAP!',
    tapLabel: 'Tap to attack the boss',
    yourTaps: (taps: number) => `Your taps: ${formatCount(taps)}`,
    ended: 'The raid is over!',
    unavailable: 'Raid mode is not configured on this deployment.',
    leave: 'Leave',
    end: 'End raid',
  },

  story: {
    dismiss: 'Dismiss',
    regionLabel: 'Story',
    narrator: 'Narrator',
    crowd: 'The crowd',
    ghost: 'A ghost',
    runStart: [
      (n: number) =>
        `Chapter 1: ${formatCount(n)} unread ghosts have been living rent-free in your inbox. Tonight, they get evicted.`,
      (n: number) =>
        `It was a dark and stormy night. ${formatCount(n)} unread emails whispered "open me"… you did not.`,
      (n: number) =>
        `Breaking: local inbox found with ${formatCount(n)} unread emails. Exorcist dispatched. That's you.`,
    ],
    waveStart: [
      'A wave of mysterious ghosts approaches. Gemini isn’t sure about these. Neither are we.',
      'Uncertain spirits incoming. Trust your gut, not their subject lines.',
      'These ghosts refused to be classified. Respect the chaos.',
    ],
    soulsStart: [
      'Wait… these ones are real people. Handle with care, and maybe reply this year.',
      'Trapped souls detected: bills, deadlines and humans. No banishing allowed.',
    ],
    combo: [
      (m: number) => `Combo x${m}! Your inbox has never felt this seen.`,
      (m: number) => `x${m} combo! Somewhere, an Inbox Zero influencer just shed a tear.`,
      (m: number) => `x${m}! Gmail's servers are sweating.`,
    ],
    ghostTimeout: [
      'Too slow! I’m moving into your Promotions tab. Permanently.',
      'Hesitation detected. The ghost has been kept… and it’s smug about it.',
      'You blinked. The ghost now has squatter’s rights.',
    ],
    banish: [
      (sender: string) => `${sender} has been yeeted into the archive.`,
      () => 'One less notification. Your dopamine receptors are confused.',
      (sender: string) => `${sender} tried to say "Last chance!". It was, in fact, the last chance.`,
    ],
    keep: [
      () => 'Kept. Even ghosts deserve a second chance.',
      () => 'Spared. The ghost promises to behave. (It won’t.)',
    ],
    rescue: [
      (name: string) => `${name} has been rescued from the void. Reply before they haunt you too.`,
      (name: string) => `Soul saved: ${name}. Your future self says thanks.`,
      (name: string) => `${name} is safe! Starred, labelled, and slightly judging your response time.`,
    ],
    sealed: [
      (boss: string) => `${boss} has been sealed forever. Future emails will bounce off the force field.`,
      (boss: string) => `${boss} is now banned from your inbox. It will haunt your spam folder instead.`,
    ],
  },

  errors: {
    generic: 'Something went wrong.',
    reload: 'Reload',
    boundaryHeading: 'A ghost crashed the game',
    offline: 'You are offline. Actions will fail until you reconnect.',
  },
} as const;

/**
 * Human-readable label for a chore action.
 * @param action Chore action.
 */
export function actionLabel(action: ChoreAction): string {
  if (action === 'banish') return 'Banish';
  if (action === 'rescue') return 'Rescue';
  return 'Keep';
}
