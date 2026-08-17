// 設定タブ「チュートリアルをもう一度見る」→ OnboardingOverlay（app/_layout.tsx に常駐）をつなぐ、
// achievementToastBus.ts と同じ形のモジュール内 1 対 1 の購読。
//
// オーバーレイは初回判定（settings の tutorialSeen）とは別の理由でも開く必要がある ──
// 一度見終えたあと（tutorialSeen === true）でも、設定タブから「もう一度見る」を押せば開ける。
// その「今だけ開いて」という一時的な要求を、常駐する 1 つの受け手（RootLayout）に投げる形にする。
// 購読者は RootLayout だけの想定（複数箇所から registerOnboardingRequestListener を呼ばない）。

type Listener = () => void;

let listener: Listener | null = null;

/** RootLayout がマウント中だけ登録する。アンマウント時は null に戻すこと */
export function registerOnboardingRequestListener(fn: Listener | null): void {
  listener = fn;
}

/** 設定タブ「チュートリアルをもう一度見る」から呼ぶ */
export function requestOnboarding(): void {
  listener?.();
}
