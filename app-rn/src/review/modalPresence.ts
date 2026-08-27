// いま画面の上にモーダルが出ているか、をアプリ全体で 1 つだけ持つ。
//
// 用途は 1 つだけ ── アプリ内レビュー依頼を出す直前に「いま出しても割り込みにならないか」を
// 確かめること（docs/DESIGN-REVIEW-PROMPT.md）。レビュー画面は保存操作の 5.5 秒後に出るので、
// その間に利用者が実績の詳細を開いていたり、次の記録を打ち始めていたりしうる。
// そこへ被せると、OS の割り当て（iOS は 365 日で 3 回）を**見てもらえないまま 1 回消費する**。
//
// **数え方は「マウントされている RN の Modal の数」。** アプリの Modal は 5 か所しかなく
// （SheetModal / RecordFormSheet / AchievementDetailModal / PhotoViewer / OnboardingOverlay）、
// そのうち SheetModal は 18 のシートの共通の器なので、この 5 か所が `useModalPresence` を
// 呼べば全部のモーダルを漏れなく数えられる。**Modal を新しく足すときはここにも足すこと。**
//
// zustand ではなくモジュール変数なのは、購読する相手が居ないため ── 読むのは
// requestReview.ts のタイマーの中で 1 回だけで、変化を画面に映す必要がない。
// ストアにすると、開閉のたびに購読者ゼロの再描画の口を作ることになる。
import { useEffect } from 'react';

/** いま開いているモーダルの数。閉じ切ったところまでを「開いている」に含める */
let openCount = 0;

/**
 * モーダルが開いている間だけ数に入れる。**Modal を持つコンポーネントが、
 * その Modal の `visible` をそのまま渡す。**
 *
 * 閉じるアニメーションの間も数に入れておきたいので、渡す値は
 * 「利用者から見えているか」ではなく「Modal が実際にマウントされているか」でよい
 * （SheetModal なら下り切るまで true になる `rendered`）── iOS は表示中のモーダルの上に
 * 別のものを出せないので、見えていなくても出ている間は避ける必要がある。
 */
export function useModalPresence(visible: boolean): void {
  useEffect(() => {
    if (!visible) return;

    openCount += 1;
    return () => {
      openCount -= 1;
    };
  }, [visible]);
}

/** いずれかのモーダルが開いているか。読むのは requestReview.ts だけ */
export function isAnyModalOpen(): boolean {
  return openCount > 0;
}
