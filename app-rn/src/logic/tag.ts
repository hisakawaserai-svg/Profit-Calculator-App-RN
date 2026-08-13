// SPEC-V4 §1.2（色の自動割り当て）・§1.3（検証規則）・§1.5（並び）の純粋関数。
//
// 画面はここで決まった結果を出すだけで、文字数を数えたり色を選んだりしない。
// 表示に出る文言は labels.ts が持つので、ここが返すのは理由コードまで
// （logic/preset.ts の PresetInvalidReason → presetBlockedNote と同じ分担）。
//
// 色のパレットは preset.ts のものをそのまま使う（§1.1）。名前に "preset" が入るが、
// 実体は「明暗どちらでも読める色の見本帳」なので改名しない。

import {
  presetColorKeyOf,
  presetColorValue,
  PRESET_COLOR_HEXES,
  presetGraphemes,
  PRESET_COLOR_KEYS,
} from './preset';

/**
 * 名前の上限（§1.3。書記素単位で数える）。
 * プリセットの 20 文字より短いのは、タグが**横に並ぶチップ**として出るため
 * （フォームのタグ行・絞り込みシート・解除バー）。プリセットは 1 行に 1 つしか出ない。
 */
export const TAG_NAME_MAX_LENGTH = 12;

/**
 * タグ名に使えない 1 文字（§1.3 / §5.2）。CSV の 1 セルに「洋服・春夏物」と並べるので、
 * 区切り文字が名前に入ると往復で意味が壊れる。書き出し時にエスケープを設計するより、
 * 入力の側で 1 文字を予約する方が説明も実装も短い。
 */
export const TAG_NAME_SEPARATOR = '・';

/**
 * 追加時の色（§1.2 / 決定 §9-8）。**使用済みの色を避けて、パレットの並び順で最初の 1 つ。**
 * すべて使われていたら先頭から一巡する（重複を許す）── 名前が本体で色は補助なので、
 * 色が被っても「◯洋服」「◯食器」は読み分けられる。パレットを増やす方向は採らない。
 *
 * 保存値が未知の色でも既定色（blue）として「使用済み」に数える ── 正規化した後の
 * 見た目が被らないようにするのが目的なので、生の文字列ではなく表示される色で判定する。
 */
export function nextTagColor(existing: readonly { colorKey: string }[]): string {
  // 自由色（SPEC-V7 §3）は「使用済み」に数えない ── 固定色を一巡させるための関数で、
  // 自由色は固定色のどれとも重ならないため
  const used = new Set(existing.map((tag) => presetColorKeyOf(tag.colorKey)));
  const key = PRESET_COLOR_KEYS.find((candidate) => !used.has(candidate)) ?? PRESET_COLOR_KEYS[0];
  return PRESET_COLOR_HEXES[key];
}

/**
 * 保存が無効な理由（§1.3）。文言は labels.tagBlockedNote が持つ。
 *
 * プリセット（SPEC-V3 §1.4）と違い **`name-duplicated` がある** ── タグは絞り込みの
 * 意味そのものなので、同名が 2 つあると解除バーの「『洋服』で絞り込み中」が
 * どちらのことか言えなくなる。
 */
export type TagInvalidReason =
  | 'name-required'
  | 'name-too-long'
  | 'name-has-separator'
  | 'name-duplicated';

/** 編集シート（§2.3）が持つ入力そのまま。色は丸から選んだ hex（SPEC-V7 §2.1） */
export type TagDraft = {
  name: string;
  colorKey: string;
};

export type TagValidation =
  | {
      valid: true;
      /** 前後の空白を落とした保存値 */
      name: string;
      /** hex（SPEC-V7 §2.1）。固定色も自由色も同じ形 */
      colorKey: string;
    }
  | { valid: false; reason: TagInvalidReason };

/**
 * 編集シートの保存ボタンの活性を決める（§1.3）。
 *
 * **上限を超えても入力そのものは切らない**（SPEC-V3 §1.2 の共通規則）── 日本語入力の
 * 変換前のひらがなまで数えてしまい、上限の近くで漢字に変換できなくなる。
 * 超えたら保存を止めて理由を出すだけにして、確定して縮めば有効に戻るようにする。
 *
 * `others` には**自分以外の**既存タグを渡す（編集では自分を除く）。名前を変えずに
 * 色だけ変える編集が「同じ名前のタグがあります」で止まらないようにするため。
 */
export function validateTag(draft: TagDraft, others: readonly { name: string }[]): TagValidation {
  const name = draft.name.trim();
  if (name.length === 0) return { valid: false, reason: 'name-required' };
  if (presetGraphemes(name).length > TAG_NAME_MAX_LENGTH) {
    return { valid: false, reason: 'name-too-long' };
  }
  if (name.includes(TAG_NAME_SEPARATOR)) {
    return { valid: false, reason: 'name-has-separator' };
  }
  // 前後の空白を落として完全一致で比較する（保存されるのは trim 後の名前なので、
  // 「洋服 」を許すと DB には同じ「洋服」が 2 行できる）
  if (others.some((other) => other.name.trim() === name)) {
    return { valid: false, reason: 'name-duplicated' };
  }

  // 固定色は hex に寄せ、自由色はそのまま。読めない値は既定色へ倒す（SPEC-V7 §2.1）
  return { valid: true, name, colorKey: presetColorValue(draft.colorKey) };
}

/**
 * 記録に付いたタグを、チップとして並べる順に解決する（§1.5）。
 *
 * 中間テーブルは順序を持たない ── 付けた順を保つと、同じ 2 つのタグが記録ごとに
 * 違う並びで出る。`tags` は sortOrder 昇順で渡ってくる（tagRepository.listAll）ので、
 * その並びのままフィルタするだけでよい。
 *
 * 存在しない id（別画面で消されたタグ）は黙って落ちる。
 */
export function selectedTags<T extends { id: string }>(
  tags: readonly T[],
  tagIds: readonly string[],
): T[] {
  const ids = new Set(tagIds);
  return tags.filter((tag) => ids.has(tag.id));
}

/**
 * 検索欄で一覧を絞る（§4.2.2 / 案 35f）。**含む一致**で、`tags` の並びは変えない。
 *
 * 前方一致にしないのは、タグ名が「こども服」「洋服」のように**後ろに意味の中心が来る**ため
 * （「服」で両方に届かないと探せない）。記録フォーム側の選択シート（§3.2）と同じ感覚。
 *
 * 前後の空白は落とす ── 鍵盤の変換確定で末尾に空白が入ることがあり、
 * 「洋服 」で 0 件になると、打った文字は合っているのに見つからない状態になる。
 * 空文字（＝空白だけを含む）なら**全件をそのまま返す**（絞っていない状態）。
 *
 * **この関数の結果は絞り込みの条件に一切効かない。** 変えるのは一覧の見え方だけで、
 * 下部の件数も選択中の tagIds も動かさない（§4.6 と同じ理屈）。
 */
export function searchTags<T extends { name: string }>(
  tags: readonly T[],
  keyword: string,
): T[] {
  const trimmed = keyword.trim();
  return trimmed === '' ? [...tags] : tags.filter((tag) => tag.name.includes(trimmed));
}

/**
 * 選択中の id のうち、生きているタグだけに絞る（§4.7 / §3.1）。
 *
 * 別画面（設定タブ）でタグを消すと、フォームや絞り込みの state に存在しない id が残り得る。
 * SQL は存在しない id を単に無視するが、**解除バーの文言と件数が実体と合わなくなる**ので
 * state の側で落とす。順序も `tags` の並び（sortOrder 昇順）に揃える。
 */
export function liveTagIds(tags: readonly { id: string }[], tagIds: readonly string[]): string[] {
  return selectedTags(tags, tagIds).map((tag) => tag.id);
}
