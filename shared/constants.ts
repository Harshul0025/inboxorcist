/**
 * Every tunable number in Inboxorcist lives here so gameplay, API usage and
 * safety limits can be reviewed in one place.
 */

// Gmail API limits and scan behaviour
export const GMAIL_LIST_PAGE_SIZE = 500;
export const GMAIL_BATCH_MODIFY_MAX = 1000;
export const SCAN_SAMPLE_SIZE = 300;
export const METADATA_CONCURRENCY = 10;
export const UNREAD_QUERY = 'is:unread in:inbox';

// Network resilience
export const RETRY_MAX_ATTEMPTS = 5;
export const RETRY_BASE_DELAY_MS = 400;
export const RETRY_MAX_DELAY_MS = 8_000;
export const REQUEST_TIMEOUT_MS = 15_000;
/** Calls that wait on Gemini get the server timeout plus headroom. */
export const AI_REQUEST_TIMEOUT_MS = 35_000;
export const COUNTER_REFRESH_DEBOUNCE_MS = 600;

// Labels (nothing is ever trashed; every touched message carries a run label)
export const LABEL_ROOT = 'Inboxorcist';
export const NEEDS_REPLY_LABEL = 'Inboxorcist/Needs-Reply';

// Encounter building
export const BOSS_MIN_EMAILS = 5;
export const MAX_BOSSES = 6;
export const LOW_CONFIDENCE_THRESHOLD = 0.7;
export const GHOSTS_PER_WAVE = 6;
export const MAX_GHOSTS = 18;
export const MAX_SOULS = 10;

// Boss fights
export const BOSS_HITS_TO_KILL = 8;
export const WEAK_SPOT_WINDOW_MS = 1_600;
export const WEAK_SPOT_MIN_WINDOW_MS = 800;
export const WEAK_SPOT_WINDOW_STEP_MS = 60;
export const REDUCED_MOTION_WINDOW_MS = 4_000;

// Ghost waves
export const GHOST_START_TIME_MS = 6_000;
export const GHOST_MIN_TIME_MS = 2_500;
export const GHOST_TIME_STEP_MS = 350;
export const SWIPE_THRESHOLD_PX = 90;

// Scoring
export const POINTS_PER_EMAIL = 10;
export const POINTS_PER_DECISION = 25;
export const COMBO_STEP = 3;
export const MAX_COMBO_MULTIPLIER = 5;
export const SECONDS_SAVED_PER_EMAIL = 5;

// Raid mode
export const RAID_CODE_LENGTH = 4;
export const RAID_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const RAID_NAME_MAX = 20;
export const RAID_TAPS_PER_HIT = 50;
export const RAID_TAP_FLUSH_MS = 300;
export const RAID_MAX_TAPS_PER_FLUSH = 200;
export const RAID_VOTE_MS = 5_000;
export const RAID_VOTE_GRACE_MS = 400;
export const RAID_MAX_VOTES = 5;
export const RAID_CREATE_ATTEMPTS = 5;
export const RAID_SUMMARY_MAX = 120;

// Server API limits
export const GEMINI_TIMEOUT_MS = 30_000;
export const PROPOSE_MAX_GROUPS = 60;
/** Senders per parallel Gemini call. */
export const PROPOSE_BATCH_SIZE = 8;
export const PROPOSE_MAX_SAMPLES = 5;
export const TEXT_FIELD_MAX = 300;
export const BODY_LIMIT = '64kb';
export const CACHE_MAX_ENTRIES = 200;
export const CACHE_TTL_MS = 10 * 60_000;
export const API_RATE_LIMIT_PER_MIN = 60;
export const UNSUBSCRIBE_RATE_LIMIT_PER_MIN = 20;
export const UNSUBSCRIBE_TIMEOUT_MS = 5_000;
export const BOSS_NAME_MAX = 60;
export const TAUNT_MAX = 160;
export const ROAST_LINE_MAX = 160;
export const DRAFT_MAX = 1_200;

// Demo mode
export const DEMO_SEED = 31_10_2026;
export const DEMO_TOTAL_EMAILS = 2_000;
export const DEMO_LATENCY_MS = 120;
