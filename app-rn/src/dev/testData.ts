// 開発用テストデータ（__DEV__ 専用）の「中身」を組み立てる純粋関数。
//
// **このファイルは DB を触らない。** 受け取るのは投入先の材料（既存プリセットの値・
// タグの id）だけで、返すのは repository.create にそのまま渡せる SaveRecordInput の配列。
// 分けてあるのは、内訳（件数・赤字の数・タグの配分）を Node のテストから検証できるようにするため
// ── 乱数を使うので、値そのものではなく「毎回満たすべき内訳」を testData.test.ts が見ている。
//
// 本番ビルドには入らない（app/(tabs)/settings/index.tsx の require 参照）。
//
// 投入した行の見分け方は **id の接頭辞**（DEV_SEED_ID_PREFIX）。スキーマは変えていない ──
// id は形式無指定の text PK で、マイグレーション 0002 の初期プリセットも `seed-*` という
// 読める固定 id を使っている（schema.ts §2.4）ので、同じ作法に乗る。
// メモやタグを目印にすると「タグ無しの記録を 15 件残す」等の投入内容そのものと衝突する。

import type { SaveRecordInput } from '@/db/repository';
import type { RecordKind } from '@/db/schema';
import { netProfit } from '@/logic/profit';
import { shippingPresetTotal, type ShippingPresetAmounts } from '@/logic/shippingMaterial';

/**
 * 投入した行の目印。記録・タグ・プリセットの id の先頭に付ける。
 * 削除はこの接頭辞で絞るので、手入力の行（UUID）は巻き込まれない。
 */
export const DEV_SEED_ID_PREFIX = 'devseed-';

/** 期間の左端。これより前の日付は作らない */
export const DEV_SEED_RANGE_START = new Date(2025, 8, 1);

/** 期間の右端（= 「今日」）。販売日も出品日もこの日を越えない */
export const DEV_SEED_RANGE_END = new Date(2026, 7, 13);

/**
 * 投入するタグ（6 種）。SPEC-V4 §1.3 の規則内（12 文字以内・「・」を含まない）。
 * 同名のタグが既にあるときは作らずにそれを使う（devSeed.ts）。
 */
export const DEV_SEED_TAG_NAMES = ['衣類', '本', '家電', 'おもちゃ', '雑貨', 'コスメ'] as const;

/**
 * 月ごとの件数（DEV_SEED_RANGE_START から 12 か月）。合計 50 件。
 * 2026-01 だけ 0 件にしてある ── 「記録が無い月」の表示を確かめるため。
 * 2025 年に 18 件・2026 年に 32 件で、年の切り替えでも中身が変わる。
 */
const MONTH_COUNTS = [4, 5, 3, 6, 0, 5, 4, 6, 3, 5, 4, 5] as const;

/** 出品中にする通し番号（10 件）。月をまたいで散るよう 5 件おきに置く */
const LISTING_SLOTS = new Set([2, 7, 12, 17, 22, 27, 32, 37, 42, 47]);

/** 仕入品にする通し番号（20 件）。うち 4 件（7 / 17 / 32 / 42）は出品中と重なる */
const SOURCED_SLOTS = new Set([
  0, 3, 5, 7, 9, 11, 14, 16, 17, 20, 24, 26, 29, 31, 32, 35, 38, 42, 44, 48,
]);

/** 赤字（仕入値が高すぎる）。すべて仕入品かつ販売済み */
const PURCHASE_LOSS_SLOTS = new Set([3, 11, 26]);

/** 赤字（送料が売上を圧迫する）。すべて不用品かつ販売済み */
const POSTAGE_LOSS_SLOTS = new Set([6, 19, 41]);

/** 収支がちょうど 0 円になる 1 件。手数料 0・不用品にして端数が出ないようにする */
const ZERO_PROFIT_SLOT = 33;

/**
 * 「専用資材を使わない」を立てる通し番号（3 件。SPEC-V6 §3）。
 * どれも販売済み・特別扱いのない枠から選ぶ ── 赤字や 0 円ちょうどの枠と重ねると、
 * 資材費を引いたぶんで狙った収支から外れる。
 * **資材費のあるプリセットが 1 つも無ければ立たない**（既存のプリセットだけで足りている環境）。
 */
const MATERIAL_EXCLUDED_SLOTS = new Set([4, 21, 36]);

/** 1 万円超の高額（6 件）。一覧・グラフで桁の大きい行を確かめるため */
const HIGH_PRICE_SLOTS = new Set([1, 15, 22, 25, 36, 44]);

/** 赤字にしない記録が最低限確保する収支。乱数の巡り合わせで 0 円近辺に落ちないようにする */
const MIN_PROFIT = 300;

/**
 * 商品名とタグ（通し番号 0〜49）。連番の「テスト1」は使わない。
 *
 * `tags` は DEV_SEED_TAG_NAMES の添字。配分は
 * タグ無し 15 件 / 1 個 23 件 / 2 個 8 件 / 3 個 4 件。
 * 組み合わせ（本＋おもちゃ＋雑貨、衣類＋雑貨、雑貨＋コスメ）をわざと重複させてあるのは、
 * 複数選択の OR 絞り込みで件数が**増える**ことを確かめられるようにするため。
 *
 * 30 文字以上の長い名前を 3 件（4 / 23 / 47）入れてある（一覧での省略表示の確認用）。
 */
const ITEMS: readonly { name: string; tags: readonly number[] }[] = [
  { name: 'ユニクロ ダウンジャケット Mサイズ ネイビー', tags: [0] },
  { name: 'ダイソン 掃除機 V8 スリム', tags: [2] },
  { name: 'スヌーピー ぬいぐるみ 特大サイズ', tags: [3] },
  { name: 'コーチ 二つ折り財布 レザー ブラウン', tags: [4] },
  { name: '無印良品 オーク材ローテーブル 幅80cm 折りたたみ式 天然木', tags: [4] },
  { name: 'ナイキ スニーカー エアマックス 27cm', tags: [0, 4] },
  { name: '文庫本 まとめ売り 20冊', tags: [1] },
  { name: 'レゴ クラシック 黄色のアイデアボックス', tags: [3] },
  { name: '資生堂 化粧水 未開封 2本', tags: [5] },
  { name: 'パナソニック ヘアドライヤー ナノケア', tags: [2] },
  { name: 'セラミック マグカップ 2個セット', tags: [] },
  { name: 'バーバリー トレンチコート 38サイズ', tags: [0, 4] },
  { name: 'スターバックス 限定タンブラー 桜デザイン', tags: [4] },
  { name: '折りたたみ傘 自動開閉 軽量', tags: [] },
  { name: '東芝 電子レンジ 単機能 17L', tags: [2] },
  { name: 'キヤノン 一眼レフカメラ EOS Kiss X7', tags: [2] },
  { name: 'GU ワイドパンツ Lサイズ ベージュ', tags: [0] },
  { name: 'ニンテンドー3DS 本体 ブラック', tags: [] },
  { name: '料理本と調理器具 まとめ売り', tags: [1, 2, 4] },
  { name: 'ハンドタオル 5枚セット 未使用', tags: [4] },
  { name: 'デロンギ オイルヒーター 8枚フィン', tags: [] },
  { name: 'ディズニー ぬいぐるみ ミッキー', tags: [3] },
  { name: 'ルイヴィトン ショルダーバッグ モノグラム', tags: [0, 4] },
  { name: 'アイリスオーヤマ 衣類乾燥除湿機 サーキュレーター機能付き ホワイト', tags: [2] },
  { name: '水切りラック ステンレス 2段', tags: [] },
  { name: 'セイコー 腕時計 メカニカル 自動巻き', tags: [4] },
  { name: 'アディダス ジャージ上下 セットアップ', tags: [0] },
  { name: '絵本 まとめ売り 10冊', tags: [1, 3, 4] },
  { name: 'ステンレス 水筒 500ml', tags: [] },
  { name: 'シャープ 空気清浄機 プラズマクラスター', tags: [2] },
  { name: 'コスメ まとめ売り リップ 3本', tags: [4, 5] },
  { name: 'ZARA ニットワンピース Sサイズ', tags: [0] },
  { name: 'トミカ ミニカー 10台セット', tags: [] },
  { name: 'ガラス製 花瓶 北欧デザイン', tags: [] },
  { name: 'ビジネス書 まとめ売り 5冊', tags: [] },
  { name: 'ノースフェイス リュック 30L', tags: [0, 4] },
  { name: 'アップル iPad 第9世代 64GB Wi-Fi', tags: [2] },
  { name: '木製 ジグソーパズル 500ピース', tags: [] },
  { name: 'ちふれ 化粧品 セット 未使用', tags: [4, 5] },
  { name: 'キャンプ用 折りたたみチェア', tags: [] },
  { name: '漫画 全巻セット 1〜15巻', tags: [1, 3, 4] },
  { name: 'コットン ハンカチ 3枚 未使用', tags: [4] },
  { name: 'ヨガマット 厚さ10mm ピンク', tags: [] },
  { name: 'ユニクロ フリースジャケット Lサイズ', tags: [] },
  { name: 'バルミューダ トースター ザ・トースター', tags: [2, 4] },
  { name: '園芸用 プランター 3個セット', tags: [] },
  { name: '資生堂 アネッサ 日焼け止め 2本', tags: [5] },
  { name: 'シャネル ノベルティ コスメポーチ ブラック 未使用 保存袋つき', tags: [4, 5] },
  { name: '電動ドライバー 充電式 ビットセット付き', tags: [] },
  { name: '児童書と知育おもちゃ セット 低学年向け', tags: [1, 3, 4] },
];

/** メモ。3 件に 1 件ほど入れる（空文字 = メモなし） */
const MEMOS = [
  '',
  '',
  '',
  '動作確認済み',
  '小さなキズあり',
  '取扱説明書なし',
  'クリーニング済み',
  '箱・付属品つき',
];

/**
 * 投入先の材料。**プリセットは「値の写し」で参照する**（SPEC-V3 §1.5）ので、
 * ここで受け取るのは id ではなく値そのもの。
 */
export type DevSeedSources = {
  /**
   * 送料プリセット（円）。**送料と専用資材の代金の 2 つ**（SPEC-V6 §1）──
   * 記録に入るのは合計（資材を使わない記録だけ送料のみ）なので、片方だけでは組み立てられない。
   */
  shippings: readonly ShippingPresetAmounts[];
  /** 梱包材プリセットの値（円）。1 件以上 */
  packagingValues: readonly number[];
  /** 販売サイトプリセットの名前と手数料率（%）。1 件以上・率は 0〜50 */
  sites: readonly { name: string; commission: number }[];
  /** タグの id。DEV_SEED_TAG_NAMES と同じ並び */
  tagIds: readonly string[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)];
}

/** 100 円単位に丸める（実在しそうな値段にするため） */
function round100(value: number): number {
  return Math.round(value / 100) * 100;
}

function ceil100(value: number): number {
  return Math.ceil(value / 100) * 100;
}

/** 月の添字（0 = DEV_SEED_RANGE_START の月）→ その月の 1 日 */
function monthStart(monthIndex: number): Date {
  return new Date(DEV_SEED_RANGE_START.getFullYear(), DEV_SEED_RANGE_START.getMonth() + monthIndex, 1);
}

/** その月に置ける最終日。最後の月だけ「今日」で頭打ちにする */
function lastDayOf(monthIndex: number): number {
  const start = monthStart(monthIndex);
  const endOfMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const isLastMonth =
    start.getFullYear() === DEV_SEED_RANGE_END.getFullYear() &&
    start.getMonth() === DEV_SEED_RANGE_END.getMonth();
  return isLastMonth ? Math.min(endOfMonth, DEV_SEED_RANGE_END.getDate()) : endOfMonth;
}

/**
 * 月グループの基準日（販売済み = 販売日 / 出品中 = 出品日）。
 * 先頭の月だけ 4 日以降にするのは、販売日から数日さかのぼった出品日が
 * 期間の左端（2025-09-01）より前に出ないようにするため。
 */
function basisDateIn(monthIndex: number): Date {
  const start = monthStart(monthIndex);
  const day = randInt(monthIndex === 0 ? 4 : 1, lastDayOf(monthIndex));
  return new Date(start.getFullYear(), start.getMonth(), day, randInt(9, 20), randInt(0, 59));
}

/** 販売日から数日〜数週間さかのぼった出品日。期間の左端は越えない */
function listedDateFor(saleDate: Date): Date {
  const maxGap = Math.floor((saleDate.getTime() - DEV_SEED_RANGE_START.getTime()) / MS_PER_DAY);
  const gap = Math.min(randInt(3, 24), Math.max(1, maxGap));
  return new Date(
    saleDate.getFullYear(),
    saleDate.getMonth(),
    saleDate.getDate() - gap,
    randInt(9, 20),
    randInt(0, 59),
  );
}

/** 梱包材は複数選択できる（SPEC-V3 §4.3）ので、3 割ほどは 2 種類ぶんを合算する */
function envelopeCostFrom(values: readonly number[]): number {
  const first = pick(values);
  if (values.length < 2 || Math.random() >= 0.3) return first;
  return first + pick(values);
}

/** その他費用。4 件に 1 件ほど（10 円単位） */
function othersCostSample(): number {
  return Math.random() < 0.25 ? randInt(5, 30) * 10 : 0;
}

type Amounts = {
  salesPrice: number;
  purchasePrice: number;
  postage: number;
  envelopeCost: number;
  othersCost: number;
  /** 送料の内訳の控え（SPEC-V6 §3）。postage には既に含まれている（使わない記録を除く） */
  shippingMaterialCost: number;
  excludesShippingMaterial: boolean;
};

/** 送料 1 件ぶんの決め方（SPEC-V6 §3）。postage・控え・トグルの 3 つは必ず一緒に決まる */
type Shipping = Pick<Amounts, 'postage' | 'shippingMaterialCost' | 'excludesShippingMaterial'>;

/**
 * 送料を 1 つ選ぶ。**「専用資材を使わない」の枠だけは資材費のあるプリセットを当てる** ──
 * 資材費 0 円の記録でトグルを立てても、画面には出ない（showsShippingMaterialToggle）ので
 * 確かめる材料にならない。
 */
function shippingFor(index: number, sources: DevSeedSources, highest = false): Shipping {
  const withMaterial = sources.shippings.filter((preset) => preset.materialCost > 0);
  if (MATERIAL_EXCLUDED_SLOTS.has(index) && withMaterial.length > 0) {
    const preset = pick(withMaterial);
    // 使わないので送料だけ。控えは残す（編集で開いたときにトグルが出る）
    return {
      postage: preset.value,
      shippingMaterialCost: preset.materialCost,
      excludesShippingMaterial: true,
    };
  }

  const preset = highest
    ? sources.shippings.reduce((max, current) =>
        shippingPresetTotal(current) > shippingPresetTotal(max) ? current : max,
      )
    : pick(sources.shippings);
  return {
    postage: shippingPresetTotal(preset),
    shippingMaterialCost: preset.materialCost,
    excludesShippingMaterial: false,
  };
}

function profitOf(amounts: Amounts, commission: number): number {
  return netProfit({ ...amounts, commission });
}

/**
 * 収支がちょうど 0 円の 1 件（ZERO_PROFIT_SLOT）。
 * 手数料 0・不用品（仕入 0）にして、売上 = 送料 + 梱包材 + その他 に揃える ──
 * すべて整数なので、丸めなしの計算でも誤差なく 0 になる。
 * プリセットの値が小さいときはその他費用で 500 円まで押し上げる（売上の下限に合わせる）。
 */
function zeroProfitAmounts(sources: DevSeedSources): Amounts {
  const shipping = shippingFor(ZERO_PROFIT_SLOT, sources, true);
  const envelopeCost = Math.max(...sources.packagingValues);
  const base = shipping.postage + envelopeCost;
  const othersCost = base >= 500 ? 0 : 500 - base;
  return {
    salesPrice: base + othersCost,
    purchasePrice: 0,
    envelopeCost,
    othersCost,
    ...shipping,
  };
}

function baseSalesPrice(index: number): number {
  if (HIGH_PRICE_SLOTS.has(index)) return round100(randInt(12000, 25000));
  if (POSTAGE_LOSS_SLOTS.has(index)) return round100(randInt(500, 900));
  if (PURCHASE_LOSS_SLOTS.has(index)) return round100(randInt(1500, 4000));
  return round100(randInt(500, 9800));
}

function buildAmounts(
  index: number,
  kind: RecordKind,
  commission: number,
  sources: DevSeedSources,
): Amounts {
  if (index === ZERO_PROFIT_SLOT) return zeroProfitAmounts(sources);

  const salesPrice = baseSalesPrice(index);

  if (POSTAGE_LOSS_SLOTS.has(index)) {
    // 送料で赤字にする。いちばん高い送料プリセットを当てる
    const amounts: Amounts = {
      salesPrice,
      purchasePrice: 0,
      envelopeCost: envelopeCostFrom(sources.packagingValues),
      othersCost: 0,
      ...shippingFor(index, sources, true),
    };
    // プリセットの値が小さくて黒字のままなら、確実に赤字になるまでその他費用を足す
    const profit = profitOf(amounts, commission);
    if (profit >= 0) amounts.othersCost = ceil100(profit) + 100;
    return amounts;
  }

  if (PURCHASE_LOSS_SLOTS.has(index)) {
    // 仕入値で赤字にする。売値の 1.2〜1.6 倍で仕入れたことにすれば手数料に関わらず必ず赤字
    return {
      salesPrice,
      purchasePrice: round100(salesPrice * (1.2 + Math.random() * 0.4)),
      envelopeCost: envelopeCostFrom(sources.packagingValues),
      othersCost: othersCostSample(),
      ...shippingFor(index, sources),
    };
  }

  const amounts: Amounts = {
    salesPrice,
    purchasePrice:
      kind === 'sourced' ? Math.max(100, round100(salesPrice * (0.2 + Math.random() * 0.25))) : 0,
    envelopeCost: envelopeCostFrom(sources.packagingValues),
    othersCost: othersCostSample(),
    ...shippingFor(index, sources),
  };

  // 赤字は「混ぜる」と決めた 6 件だけにする（安い品に高い送料が当たると偶然赤字になり得る）。
  // 収支 = 売上 × (1 − 率/100) − 固定費 なので、必要な売上を逆算して押し上げる
  if (profitOf(amounts, commission) < MIN_PROFIT) {
    const fixed = amounts.purchasePrice + amounts.postage + amounts.envelopeCost + amounts.othersCost;
    amounts.salesPrice = ceil100((fixed + MIN_PROFIT) / (1 - commission / 100));
  }
  return amounts;
}

function buildRecord(index: number, monthIndex: number, sources: DevSeedSources): SaveRecordInput {
  const item = ITEMS[index];
  const isSold = !LISTING_SLOTS.has(index);
  const kind: RecordKind = SOURCED_SLOTS.has(index) ? 'sourced' : 'used';

  const basisDate = basisDateIn(monthIndex);
  const saleDate = isSold ? basisDate : null;
  const saleStartDate = isSold ? listedDateFor(basisDate) : basisDate;

  const site = pick(sources.sites);
  // 出品中は販売サイトを写さない（repository.buildWhere が前提にしている。SPEC-V4 §4.2）。
  // 率だけは残す ── 出品中の「見込みの収支」に効くので、手で入れた率という扱いにする
  const commission = index === ZERO_PROFIT_SLOT ? 0 : site.commission;
  const siteName = isSold && index !== ZERO_PROFIT_SLOT ? site.name : '';

  return {
    itemName: item.name,
    kind,
    ...buildAmounts(index, kind, commission, sources),
    commission,
    isSold,
    saleStartDate,
    saleDate,
    memo: pick(MEMOS),
    siteName,
    photoFileName: null,
    // 目標は開発用データでも既定の「決めていない」(SPEC-V9 §1)
    targetProfit: null,
    tagIds: item.tags.map((tagIndex) => sources.tagIds[tagIndex]).filter((id) => id != null),
  };
}

/**
 * 投入する 50 件を組み立てる。**DB は触らない**ので、そのまま repository.create へ渡す。
 *
 * 金額と日付は毎回変わるが、内訳（月ごとの件数・販売済み 40 / 出品中 10・
 * 不用品 30 / 仕入品 20・赤字 6 件・収支 0 円 1 件・タグの配分）は毎回同じ。
 */
export function buildDevSeedRecords(sources: DevSeedSources): SaveRecordInput[] {
  const records: SaveRecordInput[] = [];
  let index = 0;
  for (let monthIndex = 0; monthIndex < MONTH_COUNTS.length; monthIndex += 1) {
    for (let n = 0; n < MONTH_COUNTS[monthIndex]; n += 1) {
      records.push(buildRecord(index, monthIndex, sources));
      index += 1;
    }
  }
  return records;
}

/** テストと devSeed.ts の要約表示が参照する、投入する件数の内訳 */
export const DEV_SEED_COUNTS = {
  records: ITEMS.length,
  sold: ITEMS.length - LISTING_SLOTS.size,
  listing: LISTING_SLOTS.size,
  used: ITEMS.length - SOURCED_SLOTS.size,
  sourced: SOURCED_SLOTS.size,
  loss: PURCHASE_LOSS_SLOTS.size + POSTAGE_LOSS_SLOTS.size,
  tags: DEV_SEED_TAG_NAMES.length,
} as const;

/** 月ごとの件数（テストが参照する） */
export const DEV_SEED_MONTH_COUNTS: readonly number[] = MONTH_COUNTS;
