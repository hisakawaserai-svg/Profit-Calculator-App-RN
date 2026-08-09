import { create } from 'zustand';

// SPEC.md §4.1 SaleRecordViewModel 相当の状態。
// 注意: 一覧画面と月別詳細画面で状態は共有しない（決定 §7-1）ため、
// 実装時は画面ごとに独立したインスタンス（または vanilla store）にする。
// TODO: SortTypeMonthly（8 種）と filteredAndGrouped 相当のセレクタを実装する。

type RecordListState = {
  searchText: string;
  /** 月フィルタ。null = 全期間。月初日 0:00 に正規化した ISO 文字列で保持する */
  selectedMonth: string | null;
  setSearchText: (text: string) => void;
  setSelectedMonth: (month: string | null) => void;
};

export const useRecordListStore = create<RecordListState>((set) => ({
  searchText: '',
  selectedMonth: null,
  setSearchText: (searchText) => set({ searchText }),
  setSelectedMonth: (selectedMonth) => set({ selectedMonth }),
}));
