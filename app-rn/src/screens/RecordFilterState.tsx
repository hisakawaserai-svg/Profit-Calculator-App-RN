// 「絞り込みに関わる state」を、一覧（またはグラフ）と絞り込みページの両方から触れるようにする器。
// **記録タブとデータタブがそれぞれ 1 つずつ持つ**（SPEC-V4 §6 / 決定 §9-9）。
//
// 絞り込みが**下から出るシート**だった間は、この state は RecordListScreen のローカルで足りた
// （シートは同じ画面の中に出るので）。案 33c で**push する 1 枚のページ**に変えたため、
// 別ルートの画面が同じ値を読み書きする必要が出た。
//
// **決定 §9-9（画面ローカルの state のまま・永続化しない）は変えていない。**
// 置き場所を「タブの Stack」に上げただけで、
//   - 永続化しない（AsyncStorage にも DB にも書かない）
//   - **記録タブとデータタブで共有しない**
//   - アプリを立ち上げ直せば初期値に戻る
// は元のまま。**共有しないことを構造で守っているのがこの Provider の置き場所**:
// 各タブの _layout.tsx の中に 1 つずつ置くので、2 つの Stack は別々の値を持つ
// （同じ Context を使っていても、React の木の上で兄弟なので混ざらない）。
// タブ全体（(tabs)/_layout.tsx）へ上げると 1 つになってしまうので、**絶対に上げないこと**。
// レコード詳細を両タブに置いたのと同じ考え方（UI-SPEC §6-9「入口だけを増やす」）。
//
// ここが持つのは「一覧／グラフと絞り込みページの両方が見る値」だけ。並び替え・検索・シートの開閉など、
// 片方だけが使う state は各画面に残す（上げると、どちらが持つ値か読めなくなる）。
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import {
  EMPTY_RECORD_FILTER,
  type FilterScope,
  type RecordFilterDraft,
} from '@/logic/recordFilter';

type RecordFilterState = {
  /** どのタブの絞り込みか（§6）。件数を数える集合が変わる */
  scope: FilterScope;
  /** 3 条件の下書き（§4.2）。選んだ瞬間から効く */
  filter: RecordFilterDraft;
  setFilter: (next: RecordFilterDraft) => void;
  /**
   * true = 売れた記録 / false = 出品中（§4.1 のセグメント）。
   * **データタブでは常に true**（isSold = true 固定。SPEC §6.2）── あちらに状態の切替はなく、
   * そのぶん販売サイトの節を消す分岐も起きない（§6）。
   */
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
  scope,
  currentMonthKey,
  children,
}: {
  /** 'records' = 記録タブの Stack / 'data' = データタブの Stack（§6） */
  scope: FilterScope;
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
      scope,
      filter,
      setFilter,
      // データタブに状態の切替はないので、ここで固定して下流に分岐を持ち込ませない（§6）
      isSoldMode: scope === 'data' ? true : isSoldMode,
      changeSoldMode,
      monthKey,
      setMonthKey,
      clearFilter,
    }),
    [scope, filter, isSoldMode, changeSoldMode, monthKey, clearFilter],
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
