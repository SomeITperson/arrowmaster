/**
 * Telegram Web App bootstrap. The platform script (loaded in index.html) exposes
 * `window.Telegram.WebApp`. When the game runs inside Telegram we expand to full
 * height, request fullscreen, lock orientation and disable the pull-to-close
 * swipe so the landscape duel isn't interrupted. In a normal browser this is a
 * no-op. See https://core.telegram.org/bots/webapps
 */
interface TelegramWebApp {
  ready(): void;
  expand(): void;
  isExpanded?: boolean;
  requestFullscreen?(): void;
  exitFullscreen?(): void;
  lockOrientation?(): void;
  unlockOrientation?(): void;
  disableVerticalSwipes?(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function initTelegram(): void {
  const tg = window.Telegram?.WebApp;
  if (!tg) return; // running outside Telegram (plain browser)

  try {
    tg.ready();
    tg.expand();
    tg.requestFullscreen?.(); // Bot API 8.0+
    tg.lockOrientation?.(); // lock to the current (landscape) orientation
    tg.disableVerticalSwipes?.();
    tg.setHeaderColor?.('#10141c');
    tg.setBackgroundColor?.('#10141c');
  } catch {
    // Older clients may lack some methods — ignore and run windowed.
  }
}
