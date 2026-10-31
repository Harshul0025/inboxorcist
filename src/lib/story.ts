import { strings } from '../strings';
import type { StoryLine } from '../app/story';

type Random = () => number;

function pick<T>(items: readonly T[], random: Random): T {
  return items[Math.floor(random() * items.length) % items.length] as T;
}

/** Story lines for every moment of a run. All functions take an injectable random source. */
export const storyLines = {
  /** Opening line with the real unread count. */
  runStart(unread: number, random: Random = Math.random): StoryLine {
    return { speaker: strings.story.narrator, emoji: '📜', text: pick(strings.story.runStart, random)(unread) };
  },
  /** A ghost wave begins. */
  waveStart(random: Random = Math.random): StoryLine {
    return { speaker: strings.story.narrator, emoji: '🌫️', text: pick(strings.story.waveStart, random) };
  },
  /** The trapped-souls wave begins. */
  soulsStart(random: Random = Math.random): StoryLine {
    return { speaker: strings.story.narrator, emoji: '🕯️', text: pick(strings.story.soulsStart, random) };
  },
  /** The boss is at half health and begs. */
  bossPlea(bossName: string, plea: string): StoryLine {
    return { speaker: bossName, emoji: '😰', text: `“${plea}”`, sensitive: true };
  },
  /** The boss has been defeated. */
  bossDefeated(epitaph: string): StoryLine {
    return { speaker: strings.story.narrator, emoji: '⚰️', text: epitaph, sensitive: true };
  },
  /** The combo multiplier went up. */
  combo(multiplier: number, random: Random = Math.random): StoryLine {
    return { speaker: strings.story.crowd, emoji: '📣', text: pick(strings.story.combo, random)(multiplier) };
  },
  /** A ghost decision: timeouts always talk; ordinary decisions sometimes do. */
  decision(action: 'banish' | 'keep', sender: string, timedOut: boolean, random: Random = Math.random): StoryLine {
    if (timedOut) return { speaker: strings.story.ghost, emoji: '👻', text: pick(strings.story.ghostTimeout, random) };
    if (action === 'banish') {
      return {
        speaker: strings.story.narrator,
        emoji: '💨',
        text: pick(strings.story.banish, random)(sender),
        sensitive: true,
      };
    }
    return { speaker: strings.story.narrator, emoji: '🤝', text: pick(strings.story.keep, random)() };
  },
  /** An important email was rescued. */
  rescue(name: string, random: Random = Math.random): StoryLine {
    return {
      speaker: strings.story.narrator,
      emoji: '🛟',
      text: pick(strings.story.rescue, random)(name),
      sensitive: true,
    };
  },
  /** A sender was sealed forever. */
  sealed(bossName: string, random: Random = Math.random): StoryLine {
    return {
      speaker: strings.story.narrator,
      emoji: '🔒',
      text: pick(strings.story.sealed, random)(bossName),
      sensitive: true,
    };
  },
};
