// プリセット（SPEC-V3 §1）のデータアクセス。sale_records 側の repository.ts と同じ作法で、
// UI からは必ずここを経由し、直接クエリを書かない。
//
// - db を注入する構成も repository.ts と同じ（アプリ本体の expo-sqlite と
//   テストの better-sqlite3 で同じコードを動かすため）
// - 記録はプリセットの id を参照しない（§1.5）ので、外部キーも削除時の後始末もない
// - 並び順は sortOrder の昇順で固定。手動並べ替えは持たない（決定 §8-4）

import { and, asc, eq, sql } from 'drizzle-orm';

import {
  DEFAULT_PRESET_CALC_METHOD,
  type PresetCalcMethod,
} from '@/logic/preset';

import type { Database } from './repository';
import { presets, type Preset, type PresetType } from './schema';

/**
 * 追加・更新で受け取る入力（§3.3 の編集シート）。
 * 値の検証は logic/preset.ts（純粋関数）が済ませている前提で、ここは書き込むだけ。
 * sortOrder は採番の規則（§3.4）が repository の責務なので受け取らない。
 */
export type PresetInput = {
  type: PresetType;
  /** 前後の空白を落とした 1〜20 文字（§1.4） */
  name: string;
  /**
   * バッジの色（SPEC-V7 §2.1）。**hex（`#RRGGBB`）で保存する** ── 固定色も自由色も
   * 同じ形。固定色かどうかは値そのもので決まる（logic/preset.presetColorKeyOf）。
   * 不正値の防御は読み出し側の resolvePresetTone。
   */
  colorKey: string;
  /** 0〜2 文字。空 = 表示時に name から導出する（§1.2） */
  initial: string;
  /** site = 手数料率(%) / それ以外 = 金額(円)（§2.1） */
  value: number;
  /**
   * まとめ買いの割る数（§2.6.4 / SPEC-V10 §1.2）。0 = 1 個ずつ（販売サイト・送料は常に 0）。
   * 個数方式では入数、使用回数方式では想定使用回数。
   * value（1 回あたり）は保存時に確定済みで、この 2 つは買い足しのときの再計算用の控え。
   */
  packQuantity: number;
  /** まとめ買いの購入価格（円）。同上 */
  packPrice: number;
  /**
   * 専用資材の代金（円。SPEC-V6 §1）。**送料以外では常に 0。**
   * まとめ買いで登録した送料プリセットでは、packQuantity / packPrice から出た単価が入る。
   */
  materialCost: number;
  /**
   * 単価の計算方式（SPEC-V10 §1.1）。**省略 = `'individual'`（既存方式）。**
   *
   * 省略できるようにしてあるのは、既存方式の下書きに対して validatePreset が
   * 従来と同じ形の結果を返すため（logic/preset.ts）── 既定へ倒すのはこのファイルの責務で、
   * 列そのものは create / update のどちらでも必ず書く。
   */
  calcMethod?: PresetCalcMethod;
  /** 面積方式の購入サイズ（cm。SPEC-V10 §1.2）。省略・0 = 未設定 */
  packHeight?: number;
  packWidth?: number;
  /** 面積方式の平均使用サイズ（cm）。省略・0 = 未入力（登録額は ¥/㎡ のまま。§1.3） */
  useHeight?: number;
  useWidth?: number;
};

/**
 * 省略された計算方式の列を既定へ倒す（SPEC-V10 §1.2）。
 * **create と update で同じ 1 本を通す** ── 片方だけが既定を持つと、
 * 「面積方式から個数方式へ戻して保存したのにサイズが残る」不整合な行ができる。
 */
function calcColumns(input: PresetInput) {
  return {
    calcMethod: input.calcMethod ?? DEFAULT_PRESET_CALC_METHOD,
    packHeight: input.packHeight ?? 0,
    packWidth: input.packWidth ?? 0,
    useHeight: input.useHeight ?? 0,
    useWidth: input.useWidth ?? 0,
  };
}

export function createPresetRepository(
  db: Database,
  deps: { generateId: () => string },
) {
  const { generateId } = deps;

  /**
   * 追加は末尾（max(sortOrder) + 1。§3.4）。10 刻みにしないのは、
   * 間に挿し込む操作（手動並べ替え）を持たないため。
   */
  function nextSortOrder(type: PresetType): number {
    const row = db
      .select({ max: sql<number | null>`max(${presets.sortOrder})` })
      .from(presets)
      .where(eq(presets.type, type))
      .get();
    return (row?.max ?? 0) + 1;
  }

  return {
    /** ある種類を並び順で全件（§3.2 の一覧・§4.3 の選択シート。インデックスはこの 1 本のため） */
    listByType(type: PresetType): Preset[] {
      return db
        .select()
        .from(presets)
        .where(eq(presets.type, type))
        .orderBy(asc(presets.sortOrder))
        .all();
    },

    /** 設定タブの各行の右に出す登録件数（§3.1） */
    countByType(type: PresetType): number {
      const row = db
        .select({ count: sql<number>`count(*)` })
        .from(presets)
        .where(eq(presets.type, type))
        .get();
      return row?.count ?? 0;
    },

    getById(id: string): Preset | undefined {
      return db.select().from(presets).where(eq(presets.id, id)).get();
    },

    create(input: PresetInput): Preset {
      const row = {
        id: generateId(),
        ...input,
        // 省略された計算方式の列を既定で埋める（SPEC-V10 §1.2）。
        // 返り値がそのまま Preset になるので、ここで埋めておかないと呼び出し側の型が欠ける
        ...calcColumns(input),
        sortOrder: nextSortOrder(input.type),
      };
      db.insert(presets).values(row).run();
      return row;
    },

    /**
     * 編集シートからの更新（§3.3）。type と sortOrder は動かさない ──
     * 種類をまたぐ付け替えの経路はなく（画面が種類ごとに開かれる）、
     * 並び順は追加時に決まったまま固定だから（§3.4）。
     */
    update(id: string, input: PresetInput): void {
      db.update(presets)
        .set({
          name: input.name,
          colorKey: input.colorKey,
          initial: input.initial,
          value: input.value,
          // 「1 個ずつ」に戻したときは 0 が渡ってくる（決定 §2.6.8-3）。
          // 書かずに残すと、モードを packQuantity > 0 で判定する決定と食い違う
          packQuantity: input.packQuantity,
          packPrice: input.packPrice,
          // 資材費も同じ理由で必ず書く（送料以外は 0 が渡る）
          materialCost: input.materialCost,
          // 計算方式とサイズも必ず書く（SPEC-V10 §1.2）── 面積方式から個数方式へ
          // 戻したときにサイズが残ると、isPackBuy が見る列と calc_method が食い違う
          ...calcColumns(input),
        })
        .where(and(eq(presets.id, id), eq(presets.type, input.type)))
        .run();
    },

    /** 物理削除（§1.1）。記録が id を参照しないので、消えても壊れる先がない */
    remove(id: string): void {
      db.delete(presets).where(eq(presets.id, id)).run();
    },

    /**
     * 削除の取り消し（§3.2 の UndoBar）。**消した行をそのまま書き戻す。**
     *
     * create で作り直さないのは、id と sortOrder が新しくなるため ── 取り消しは
     * 「消す前に戻す」ことなので、一覧の中の位置も元どおりでなければ戻したことにならない。
     */
    restore(preset: Preset): void {
      db.insert(presets).values(preset).run();
    },
  };
}

export type PresetRepository = ReturnType<typeof createPresetRepository>;
