// プリセット（SPEC-V3 §1）を画面から触る入口。useRecords.ts と同じ形にしてある。
//
// - drizzle のクエリビルダは import せず、presetRepository の関数しか呼ばない
// - repository は同期 API なので、条件が変わったら useMemo で引き直すだけ
// - 書き込みの後は refresh()、他画面での変更は useFocusEffect（画面復帰時）で拾う

import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { presetRepository, repository } from './client';
import type { PresetInput } from './presets';
import type { Preset, PresetType } from './schema';

export type PresetListData = {
  /** ある種類の全件（sortOrder 昇順。§3.4） */
  presets: Preset[];
  /** 書き込み後に呼んで再取得する */
  refresh: () => void;
};

/**
 * refreshToken を引数に取る理由は useRecords.ts の query() のコメントを参照
 * （React Compiler が useMemo の依存を自前で推論するため、関数の引数にして依存を明示する）。
 */
function queryList(type: PresetType, refreshToken: object): Preset[] {
  void refreshToken;
  return presetRepository.listByType(type);
}

/**
 * 一覧画面（§3.2）と選択シート（§4.3 / §4.5）が使うデータ取得。
 * 種類ごとに 1 画面・1 シートで賄うので、引数も type ひとつでよい。
 */
export function usePresetList(type: PresetType): PresetListData {
  const [refreshToken, setRefreshToken] = useState<object>(() => ({}));
  const refresh = useCallback(() => setRefreshToken({}), []);

  // 設定画面で編集して戻ってきたときに反映する
  useFocusEffect(refresh);

  const presets = useMemo(() => queryList(type, refreshToken), [type, refreshToken]);

  return { presets, refresh };
}

/** 設定タブの各行の右に出す登録件数（§3.1）。refreshToken の理由は queryList と同じ */
function queryCount(type: PresetType, refreshToken: object): number {
  void refreshToken;
  return presetRepository.countByType(type);
}

/**
 * 設定タブ「入力を減らす」の 1 行ぶんの件数（§3.1）。
 * 3 種まとめて返さないのは、行ごとに独立して呼べる方が画面の組み立てが素直なため。
 */
export function usePresetCount(type: PresetType): number {
  const [refreshToken, setRefreshToken] = useState<object>(() => ({}));
  const refresh = useCallback(() => setRefreshToken({}), []);

  useFocusEffect(refresh);

  return useMemo(() => queryCount(type, refreshToken), [type, refreshToken]);
}

/**
 * 編集画面が開く 1 件（§3.3）。id が無ければ「追加」なので null。
 *
 * 他の取得と違って useFocusEffect で引き直さない ── 画面は開いた時点の値を
 * 入力欄の初期値に写すだけで、以降は入力中の state が正になるため。
 * 引き直すと、編集中に戻ってきたときに入力が保存値へ巻き戻る。
 */
export function usePreset(id: string | undefined): Preset | null {
  return useMemo(() => (id == null ? null : (presetRepository.getById(id) ?? null)), [id]);
}

/** 編集シートからの追加（§3.3）。sortOrder は末尾に採番される。呼び出し側で refresh すること */
export function createPreset(input: PresetInput): Preset {
  return presetRepository.create(input);
}

/** 編集シートからの更新（§3.3）。呼び出し側で refresh すること */
export function updatePreset(id: string, input: PresetInput): void {
  presetRepository.update(id, input);
}

/**
 * 削除（§3.2 / 設計案 25a の編集モード）。取り消しは UndoBar が受け持つ。
 * 物理削除で、記録の側は何も参照していない（§1.5）。呼び出し側で refresh すること。
 */
export function removePreset(id: string): void {
  presetRepository.remove(id);
}

/** 削除の取り消し（§3.2）。消した行をそのまま書き戻す。呼び出し側で refresh すること */
export function restorePreset(preset: Preset): void {
  presetRepository.restore(preset);
}

/**
 * 「このプリセットを使った記録が何件あるか」（設計案 25c の削除確認）。
 *
 * **数えられるのは販売サイトだけで、送料・梱包材は null を返す。** 記録はプリセットの
 * id を持たない設計（§1.5）で、名前の写しがあるのは sale_records.site_name の 1 列だけ
 * だから（§1.5.1）。数えられない種類は「0 件」ではなく**不明**なので null にしてある ──
 * 呼び出し側が「未使用だから確認なしで消す」と読み違えないように、値の型で区別する。
 */
export function countPresetUsage(preset: Preset): number | null {
  if (preset.type !== 'site') return null;
  return repository.countBySiteName(preset.name);
}
