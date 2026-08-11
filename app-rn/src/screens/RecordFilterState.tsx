// 記録タブの「絞り込みに関わる state」を、一覧と絞り込みページの両方から触れるようにする器。
//
// 絞り込みが**下から出るシート**だった間は、この state は RecordListScreen のローカルで足りた
// （シートは同じ画面の中に出るので）。案 33c で**push する 1 枚のページ**に変えたため、
// 別ルートの画面が同じ値を読み書きする必要が出た。
//
// **決定 §9-9（画面ローカルの state のまま・永続化しない）は変えていない。**
// 置き場所を「記録タブの Stack」に上げただけで、
//   - 永続化しない（AsyncStorage にも DB にも書かない）
//   - データタブとは共有しない（あちらは自分の Stack に自分の state を持つ）
//   - アプリを立ち上げ直せば初期値に戻る
// は元のまま。Provider を Stack の外（タブ全体）に置くとデータタブと共有になってしまうので、
// **必ず記録タブの _layout.tsx の中に置く**こと。
//
// ここが持つのは「一覧と絞り込みページの両方が見る値」だけ。並び替え・検索・シートの開閉など、
// 一覧だけが使う state は RecordListScreen に残す（上げると、どちらが持つ値か読めなくなる）。
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { EMPTY_RECORD_FILTER, type RecordFilterDraft } from '@/logic/recordFilter';

type RecordFilterState = {
  /** 3 条件の下書き（§4.2）。選んだ瞬間から効く */
  filter: RecordFilterDraft;
  setFilter: (next: RecordFilterDraft) => void;
  /** true = 売れた記録 / false = 出品中（§4.1 のセグメント） */
  isSoldMode: boolean;
  /** 販売サイトの退避・復元まで面倒を見る（§4.2）。素の setter は出さない */
  changeSoldMode: (nextIsSold: boolean) => void;
  /** 表示中の月キー "YYYY-MM"。null = 全期間 */
  monthKey: string | null;
  setMonthKey: (next: string | null) => void;
  /** 3 条件だけを初期値へ戻す（期間・検索・並び替えは動かさない。§4.2 / §4.3 / §4.8） */
  clearFilter: () => void;
};

const RecordFilterContext = createContext<RecordFilterState | null>(null);

export function RecordFilterProvider({
  currentMonthKey,
  children,
}: {
  /** 初期表示は今月（§5-14）。「今日」は画面の外で 1 回だけ決める */
  currentMonthKey: string;
  children: ReactNode;
}) {
  const [filter, setFilter] = useState<RecordFilterDraft>(EMPTY_RECORD_FILTER);
  const [isSoldMode, setIsSoldMode] = useState(true);
  const [monthKey, setMonthKey] = useState<string | null>(currentMonthKey);
  /**
   * 出品中に切り替える直前の販売サイトの指定（§4.2）。売れた記録に戻したときに復元する。
   * **この Stack が生きている間だけ**保つ（決定 §9-9）。
   */
  const [lastSiteName, setLastSiteName] = useState<string | null>(null);

  /**
   * 状態の切り替え（§4.2）。出品中では販売サイトの指定を退避して外し、戻すときに復元する。
   *
   * 条件そのものは effectiveFilter / buildWhere の側でも落ちるが、ここで state からも外すのは、
   * 節が消えている間に「すべて解除」の活性や条件の本数が販売サイトを数えたままに
   * ならないようにするため。
   */
  const changeSoldMode = useCallback(
    (nextIsSold: boolean) => {
      setIsSoldMode(nextIsSold);
      if (nextIsSold) {
        // 退避した指定は 1 回だけ書き戻す。残しておくと、あとで自分で外した指定が
        // 状態を往復しただけで復活する
        if (lastSiteName != null) {
          setFilter({ ...filter, siteName: lastSiteName });
          setLastSiteName(null);
        }
        return;
      }
      setLastSiteName(filter.siteName);
      setFilter({ ...filter, siteName: null });
    },
    [filter, lastSiteName],
  );

  const clearFilter = useCallback(() => {
    setFilter(EMPTY_RECORD_FILTER);
    setLastSiteName(null);
  }, []);

  const value = useMemo(
    () => ({
      filter,
      setFilter,
      isSoldMode,
      changeSoldMode,
      monthKey,
      setMonthKey,
      clearFilter,
    }),
    [filter, isSoldMode, changeSoldMode, monthKey, clearFilter],
  );

  return <RecordFilterContext.Provider value={value}>{children}</RecordFilterContext.Provider>;
}

/** Provider の外で呼ぶのは配線の間違いなので、null を黙って通さず落とす */
export function useRecordFilterState(): RecordFilterState {
  const value = useContext(RecordFilterContext);
  if (value == null) {
    throw new Error('useRecordFilterState は RecordFilterProvider の中でのみ使えます');
  }
  return value;
}
