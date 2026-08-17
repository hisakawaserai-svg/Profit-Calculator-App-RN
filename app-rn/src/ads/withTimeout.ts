// 「返ってこないかもしれない待ち」に上限を付けるだけの部品。
//
// UMP の同意取得（AdsConsent.gatherConsent）は端末とネットワークの状態次第で
// **いつまでも解決しない**ことがある（シミュレータで再現）。同意フローは広告 SDK の
// 初期化の前段なので、そこで止まると広告リクエストが一度も発行されないまま
// アプリが動き続ける ── 待ちが失敗として表に出ないのが厄介なところ。
//
// ここを consent.ts から切り出してあるのは、時間に依存する処理を偽タイマーで
// 確かめられるようにするため（withTimeout.test.ts）。

/** 待ち時間の上限に達したときに投げる。呼び出し側は普通の失敗と同じ扱いでよい */
export class TimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`${timeoutMs}ms 以内に終わりませんでした`);
    this.name = 'TimeoutError';
  }
}

/**
 * `work` が `timeoutMs` 以内に解決しなければ {@link TimeoutError} で失敗させる。
 *
 * **`work` そのものは止めない**（Promise は外から中断できない）。打ち切るのは待つ側だけで、
 * 裏で走り続けた `work` が後から解決しても、その結果は捨てられる。同意フォームの場合は
 * これで都合がよい ── 遅れて届いた同意情報は UMP が端末に持ち、次の起動で使われる。
 */
export function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(timeoutMs)), timeoutMs);
    // 先に解決したほうが勝つ。タイマーは**どちらで決着しても**必ず落とす
    // （放置すると、その時間ぶんだけ JS のタイマーが生き残る）
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
