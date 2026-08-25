// ストア掲載用スクリーンショットのテストデータ（__DEV__ 専用）の「中身」を組み立てる純粋関数。
//
// **testData.ts（開発用シード）とは別物で、目的が違う。**
//
//   testData.ts      … 開発中に画面を壊さないための材料。**乱数**で毎回違う値を出し、
//                      赤字・収支 0 円・長い商品名・タグ無しといった**端の場合**をわざと混ぜる
//   storeShotData.ts … Google Play の掲載画像に写す材料。**全件を手で書いた固定値**で、
//                      「ふつうに使っている人の画面」に見えることだけを狙う
//
// 乱数を使わないのは、撮り直しのたびに数字が変わると同じ画面をもう一度撮れないため。
// 端の場合を混ぜないのも同じ理由で、掲載画像に写ってよいのは普通の記録だけ。
//
// **このファイルは DB を触らない。** 受け取るのは投入先の材料（タグの id・販売サイト名・
// 書き込み済みの写真のファイル名）だけで、返すのは repository.create にそのまま渡せる
// SaveRecordInput の配列（testData.ts と同じ分け方）。
//
// 本番ビルドには入らない（app/(tabs)/settings/index.tsx の require 参照）。
//
// ## 商品名に実在のブランドを入れない
//
// 開発用シードの商品名は「ダイソン 掃除機 V8 スリム」のように実在の商標を含んでいる ──
// 手元で画面を確かめるぶんには問題ないが、**掲載画像に写すと他社の商標を使った宣伝物になる。**
// ここでは「ワンピース Mサイズ」「マグカップ 2個セット」のように、
// 品物の種類・サイズ・個数だけで書く。商品写真を絵で描いてあるのも同じ理由
// （design/photos/gen_store_photos.py）。

import type { RecordKind } from '@/db/schema';
import type { SaveRecordInput } from '@/db/repository';
// 言語は `@/settings` ではなく `@/settings/language` から取る ── あちらは
// expo-localization / kv-store を読むので、DB も端末も触らないこのファイル
// （と Node のテスト）から import できない。language.ts は I/O を持たない側
import type { Locale } from '@/settings/language';

import type { StoreShotPhotoName } from './storeShotPhotos';

/**
 * 投入した行の目印。記録・タグ・プリセットの id の先頭に付ける。
 * **開発用シード（`devseed-`）とは別の接頭辞**にしてあるので、
 * どちらか一方だけを消せる（両方入れたまま撮ることもできる）。
 */
export const STORE_SHOT_ID_PREFIX = 'storeshot-';

/**
 * 撮影の基準日。**「今日」ではなく固定値**にしてある ── 実行した日で数字が動くと、
 * 撮り直したときに同じ画面が出ない。
 *
 * この日付で決まるのは 2 つ:
 *   - 記録が並ぶ 3 か月（この月とその前 2 か月）
 *   - 出品中の記録の「出品中 N 日目」（出品日をこの日から逆算する）
 *
 * **撮影日がここから大きくずれると「出品中 N 日目」が伸びる。** 別の月に撮り直すときは、
 * この定数を撮影日に合わせて動かすこと（記録の日付は月内の日で持っているので、
 * ここを動かせば全体がそのまま移動する）。
 */
export const STORE_SHOT_TODAY = new Date(2026, 7, 22);

/**
 * タグ（5 種）。**言語ごとに持つ** ── タグは DB の行なので、投入したあとに
 * 表示言語を変えても訳されない（マイグレーション 0011 が初期プリセットを消した理由と同じ）。
 * 英語の掲載画像を撮るときは、英語表示にしてから投入する。
 *
 * 並びは固定で、下の `tags` はこの添字を指す。
 * SPEC-V4 §1.3 の規則内（12 文字以内・「・」を含まない）。
 */
export const STORE_SHOT_TAG_NAMES: Record<Locale, readonly string[]> = {
  ja: ['衣類', '食器', '本', '雑貨', 'ハンドメイド'],
  en: ['Clothing', 'Tableware', 'Books', 'Goods', 'Handmade'],
};

/**
 * 一緒に作るプリセット。**マイグレーション 0011 でプリセットは空から始まる**ので、
 * 用意しないと計算タブにも記録フォームにもプリセットの行が 1 つも出ない
 * （＝掲載画像がいちばん寂しい状態になる）。
 *
 * 金額は下の記録が使っているものと揃えてある。名前は配送サービスの商標を使わず、
 * サイズと形状で表す（0002 の初期プリセットと同じ考え方）。
 */
export const STORE_SHOT_PRESETS: Record<
  Locale,
  {
    shipping: readonly { name: string; value: number }[];
    packaging: readonly { name: string; value: number }[];
    site: readonly { name: string; value: number }[];
  }
> = {
  ja: {
    shipping: [
      { name: 'A4・厚さ3cm以内', value: 210 },
      { name: '宅配便（小）', value: 450 },
      { name: '宅配便（中）', value: 750 },
    ],
    packaging: [
      { name: 'クッション封筒', value: 38 },
      { name: '段ボール（小）', value: 50 },
    ],
    site: [{ name: 'フリマアプリ', value: 10 }],
  },
  en: {
    shipping: [
      { name: 'A4, under 3cm', value: 210 },
      { name: 'Parcel (small)', value: 450 },
      { name: 'Parcel (medium)', value: 750 },
    ],
    packaging: [
      { name: 'Padded envelope', value: 38 },
      { name: 'Small box', value: 50 },
    ],
    site: [{ name: 'Marketplace', value: 10 }],
  },
};

/** 販売手数料（%）。全件この率で通す ── 1 つのフリマアプリだけを使っている人の形 */
export const STORE_SHOT_COMMISSION = 10;

/**
 * 記録 1 件ぶんの定義。**金額はすべてここに書いた固定値がそのまま入る**
 * （testData.ts のような逆算・押し上げをしない）。
 */
type Row = {
  /** 基準日の月（6〜8）。販売済みなら販売日、出品中なら出品日の月 */
  month: number;
  /** 基準日の日 */
  day: number;
  /** 基準日の時刻（時）。同じ日に 2 件あるときの並び順もここで決まる */
  hour: number;
  name: { ja: string; en: string };
  /** STORE_SHOT_TAG_NAMES の添字 */
  tags: readonly number[];
  kind: RecordKind;
  salesPrice: number;
  /** 仕入品のみ。不用品では 0（repository が正規化するが、書かない方を既定にする） */
  purchasePrice?: number;
  postage: number;
  envelopeCost: number;
  othersCost?: number;
  /** 販売済み（false = 出品中） */
  sold: boolean;
  /**
   * 出品日を基準日の何日前にするか。
   * 販売済みなら「売れるまでにかかった日数」、出品中なら「出品中 N 日目」になる。
   */
  listedDaysBefore: number;
  /** 添える商品写真（storeShotPhotos.ts のキー）。8 月の 4 件だけが持つ */
  photo?: StoreShotPhotoName;
  /** 目標利益（SPEC-V9 §1）。**大半の記録は持たない**のが標準（§1.3） */
  targetProfit?: number;
  memo?: { ja: string; en: string };
};

/**
 * 投入する 42 件。**販売価格はフリマで実際に付く値（980 / 1,800 / 2,350 …）で、
 * 収支はどれもキリのいい数字にならない。**
 *
 * 揃った数字（ちょうど 1,000 円・500 円）が並ぶと作り物に見えるうえ、
 * このアプリが売っている「手数料と送料を引くと手取りは違う」という話とも噛み合わない ──
 * 端数が出ていることそのものが画面の説得力になる。storeShotData.test.ts が
 * 全件の収支を見て、50 円で割り切れるものが 1 件も無いことを検査している。
 *
 * 並びは基準日の昇順（6 月 → 8 月）。
 */
const ROWS: readonly Row[] = [
  // ── 2026 年 6 月（12 件・すべて販売済み）──
  {
    month: 6, day: 2, hour: 11,
    name: { ja: 'Tシャツ 白 Mサイズ', en: 'White T-shirt, size M' },
    tags: [0], kind: 'used', salesPrice: 980, postage: 210, envelopeCost: 38,
    sold: true, listedDaysBefore: 9,
  },
  {
    month: 6, day: 4, hour: 15,
    name: { ja: 'マグカップ 2個セット', en: 'Mugs, set of 2' },
    tags: [1], kind: 'used', salesPrice: 1850, postage: 450, envelopeCost: 50,
    sold: true, listedDaysBefore: 6,
  },
  {
    month: 6, day: 6, hour: 20,
    name: { ja: '文庫本 5冊まとめて', en: 'Paperbacks, 5 books' },
    tags: [2], kind: 'used', salesPrice: 1200, postage: 210, envelopeCost: 38,
    sold: true, listedDaysBefore: 12,
  },
  {
    month: 6, day: 8, hour: 10,
    name: { ja: 'ガラス小鉢 3個', en: 'Glass bowls, 3 pieces' },
    tags: [1], kind: 'used', salesPrice: 1580, postage: 450, envelopeCost: 50,
    sold: true, listedDaysBefore: 18,
  },
  {
    month: 6, day: 11, hour: 13,
    name: { ja: 'デニムパンツ Lサイズ', en: 'Denim pants, size L' },
    tags: [0], kind: 'sourced', salesPrice: 2350, purchasePrice: 800,
    postage: 450, envelopeCost: 50, sold: true, listedDaysBefore: 7,
  },
  {
    month: 6, day: 13, hour: 19,
    name: { ja: '木製トレー', en: 'Wooden tray' },
    tags: [3], kind: 'sourced', salesPrice: 3200, purchasePrice: 1200,
    postage: 750, envelopeCost: 50, sold: true, listedDaysBefore: 15,
  },
  {
    month: 6, day: 16, hour: 12,
    name: { ja: 'ハンドメイド ピアス', en: 'Handmade earrings' },
    tags: [4], kind: 'sourced', salesPrice: 1280, purchasePrice: 350,
    postage: 210, envelopeCost: 38, sold: true, listedDaysBefore: 4,
  },
  {
    month: 6, day: 18, hour: 9,
    name: { ja: '折りたたみ傘', en: 'Folding umbrella' },
    tags: [3], kind: 'used', salesPrice: 890, postage: 210, envelopeCost: 38,
    sold: true, listedDaysBefore: 21,
  },
  {
    month: 6, day: 20, hour: 16,
    name: { ja: 'ニット セーター', en: 'Knit sweater' },
    tags: [0], kind: 'used', salesPrice: 2200, postage: 450, envelopeCost: 50,
    sold: true, listedDaysBefore: 11,
    memo: { ja: '毛玉なし', en: 'No pilling' },
  },
  {
    month: 6, day: 23, hour: 18,
    name: { ja: '絵本 3冊セット', en: "Picture books, set of 3" },
    tags: [2], kind: 'used', salesPrice: 750, postage: 210, envelopeCost: 38,
    sold: true, listedDaysBefore: 26,
  },
  {
    month: 6, day: 26, hour: 14,
    name: { ja: 'ぬいぐるみ 中サイズ', en: 'Plush toy, medium' },
    tags: [3], kind: 'used', salesPrice: 1650, postage: 450, envelopeCost: 50,
    othersCost: 120, sold: true, listedDaysBefore: 8,
  },
  {
    month: 6, day: 29, hour: 21,
    name: { ja: '陶器の花瓶', en: 'Ceramic vase' },
    tags: [1], kind: 'sourced', salesPrice: 2980, purchasePrice: 900,
    postage: 750, envelopeCost: 50, sold: true, listedDaysBefore: 13,
  },

  // ── 2026 年 7 月（14 件販売済み ＋ 出品中 1 件）──
  {
    month: 7, day: 1, hour: 12,
    name: { ja: 'ワンピース Mサイズ', en: 'Dress, size M' },
    tags: [0], kind: 'used', salesPrice: 2480, postage: 450, envelopeCost: 50,
    sold: true, listedDaysBefore: 5,
  },
  {
    month: 7, day: 3, hour: 17,
    name: { ja: '文庫本 5冊まとめて', en: 'Paperbacks, 5 books' },
    tags: [2], kind: 'used', salesPrice: 1100, postage: 210, envelopeCost: 38,
    sold: true, listedDaysBefore: 10,
  },
  {
    month: 7, day: 5, hour: 10,
    name: { ja: 'ステンレスボトル 500ml', en: 'Steel bottle, 500ml' },
    tags: [3], kind: 'used', salesPrice: 1380, postage: 450, envelopeCost: 38,
    sold: true, listedDaysBefore: 16,
  },
  {
    month: 7, day: 8, hour: 20,
    name: { ja: 'ハンドメイド ブローチ', en: 'Handmade brooch' },
    tags: [4], kind: 'sourced', salesPrice: 1580, purchasePrice: 400,
    postage: 210, envelopeCost: 38, sold: true, listedDaysBefore: 6,
  },
  {
    month: 7, day: 10, hour: 13,
    name: { ja: 'マグカップ 2個セット', en: 'Mugs, set of 2' },
    tags: [1], kind: 'sourced', salesPrice: 2350, purchasePrice: 700,
    postage: 450, envelopeCost: 50, sold: true, listedDaysBefore: 9,
  },
  {
    month: 7, day: 12, hour: 15,
    name: { ja: 'リネンシャツ', en: 'Linen shirt' },
    tags: [0], kind: 'used', salesPrice: 1980, postage: 450, envelopeCost: 50,
    sold: true, listedDaysBefore: 14,
  },
  {
    month: 7, day: 14, hour: 11,
    name: { ja: '木製トレー', en: 'Wooden tray' },
    tags: [3], kind: 'used', salesPrice: 1450, postage: 450, envelopeCost: 50,
    sold: true, listedDaysBefore: 20,
  },
  {
    month: 7, day: 17, hour: 19,
    name: { ja: '料理本 2冊', en: 'Cookbooks, 2 books' },
    tags: [2], kind: 'used', salesPrice: 880, postage: 210, envelopeCost: 38,
    sold: true, listedDaysBefore: 24,
  },
  {
    month: 7, day: 19, hour: 16,
    name: { ja: 'ニット セーター', en: 'Knit sweater' },
    tags: [0], kind: 'sourced', salesPrice: 4580, purchasePrice: 1500,
    postage: 750, envelopeCost: 50, sold: true, listedDaysBefore: 12,
    memo: { ja: 'まとめ買いから1点', en: 'One from a bulk buy' },
  },
  {
    month: 7, day: 21, hour: 9,
    name: { ja: 'ガラスのピッチャー', en: 'Glass pitcher' },
    tags: [1], kind: 'used', salesPrice: 1280, postage: 750, envelopeCost: 50,
    sold: true, listedDaysBefore: 17,
  },
  {
    month: 7, day: 23, hour: 14,
    name: { ja: 'ハンドメイド がま口ポーチ', en: 'Handmade clasp pouch' },
    tags: [4, 3], kind: 'sourced', salesPrice: 2200, purchasePrice: 600,
    postage: 210, envelopeCost: 38, sold: true, listedDaysBefore: 3,
  },
  {
    month: 7, day: 26, hour: 18,
    name: { ja: '帆布トートバッグ', en: 'Canvas tote bag' },
    tags: [3, 0], kind: 'used', salesPrice: 1750, postage: 450, envelopeCost: 50,
    sold: true, listedDaysBefore: 22,
  },
  {
    month: 7, day: 28, hour: 12,
    name: { ja: '折りたたみ傘', en: 'Folding umbrella' },
    tags: [3], kind: 'used', salesPrice: 620, postage: 750, envelopeCost: 50,
    sold: true, listedDaysBefore: 28,
    memo: { ja: '送料の見積りを間違えた', en: 'Misjudged the shipping' },
  },
  {
    month: 7, day: 30, hour: 20,
    name: { ja: '陶器のプレート 4枚', en: 'Ceramic plates, 4 pieces' },
    tags: [1], kind: 'sourced', salesPrice: 3780, purchasePrice: 1100,
    postage: 750, envelopeCost: 50, othersCost: 150, sold: true, listedDaysBefore: 19,
  },

  // ── 2026 年 8 月（11 件販売済み ＋ 出品中 4 件）──
  {
    month: 8, day: 3, hour: 11,
    name: { ja: '児童書 6冊まとめて', en: "Children's books, 6 books" },
    tags: [2], kind: 'used', salesPrice: 1580, postage: 750, envelopeCost: 50,
    sold: true, listedDaysBefore: 15,
  },
  {
    month: 8, day: 5, hour: 16,
    name: { ja: 'デニムパンツ Mサイズ', en: 'Denim pants, size M' },
    tags: [0], kind: 'used', salesPrice: 2100, postage: 450, envelopeCost: 50,
    sold: true, listedDaysBefore: 8,
  },
  {
    month: 8, day: 7, hour: 13,
    name: { ja: 'ガラス小鉢 3個', en: 'Glass bowls, 3 pieces' },
    tags: [1], kind: 'used', salesPrice: 1250, postage: 450, envelopeCost: 50,
    sold: true, listedDaysBefore: 23,
  },
  {
    month: 8, day: 9, hour: 19,
    name: { ja: 'ぬいぐるみ 大サイズ', en: 'Plush toy, large' },
    tags: [3], kind: 'sourced', salesPrice: 3500, purchasePrice: 1800,
    postage: 750, envelopeCost: 50, othersCost: 220, sold: true, listedDaysBefore: 11,
  },
  {
    month: 8, day: 11, hour: 10,
    name: { ja: '木製トレー', en: 'Wooden tray' },
    tags: [3], kind: 'used', salesPrice: 1880, postage: 450, envelopeCost: 50,
    sold: true, listedDaysBefore: 7,
  },
  {
    month: 8, day: 13, hour: 15,
    name: { ja: 'ハンドメイド ピアス', en: 'Handmade earrings' },
    tags: [4], kind: 'sourced', salesPrice: 1480, purchasePrice: 380,
    postage: 210, envelopeCost: 38, sold: true, listedDaysBefore: 5,
  },
  {
    month: 8, day: 15, hour: 18,
    name: { ja: '文庫本 5冊まとめて', en: 'Paperbacks, 5 books' },
    tags: [2], kind: 'used', salesPrice: 1350, postage: 210, envelopeCost: 38,
    sold: true, listedDaysBefore: 9, photo: 'books',
  },
  {
    month: 8, day: 16, hour: 12,
    name: { ja: 'リネンシャツ', en: 'Linen shirt' },
    tags: [0], kind: 'used', salesPrice: 1680, postage: 450, envelopeCost: 38,
    sold: true, listedDaysBefore: 13,
  },
  {
    month: 8, day: 18, hour: 14,
    name: { ja: 'マグカップ 2個セット', en: 'Mugs, set of 2' },
    tags: [1], kind: 'sourced', salesPrice: 2650, purchasePrice: 850,
    postage: 450, envelopeCost: 50, sold: true, listedDaysBefore: 6, photo: 'mugs',
  },
  {
    month: 8, day: 19, hour: 20,
    name: { ja: '折りたたみ傘', en: 'Folding umbrella' },
    tags: [3], kind: 'used', salesPrice: 1050, postage: 210, envelopeCost: 38,
    sold: true, listedDaysBefore: 10,
  },
  {
    month: 8, day: 20, hour: 17,
    name: { ja: 'ワンピース Mサイズ', en: 'Dress, size M' },
    tags: [0], kind: 'used', salesPrice: 2980, postage: 450, envelopeCost: 50,
    sold: true, listedDaysBefore: 4, photo: 'dress', targetProfit: 2000,
    memo: { ja: '一度も着ていない', en: 'Never worn' },
  },

  // 出品中（値下げシミュレータの撮影用）。**出品日は基準日そのもの**なので、
  // `listedDaysBefore` は STORE_SHOT_TODAY から数えた「出品中 N 日目」になる
  {
    month: 7, day: 28, hour: 11,
    name: { ja: '帆布トートバッグ', en: 'Canvas tote bag' },
    tags: [3], kind: 'used', salesPrice: 2400, postage: 450, envelopeCost: 50,
    sold: false, listedDaysBefore: 25,
  },
  {
    month: 8, day: 2, hour: 13,
    name: { ja: '陶器のプレート 4枚', en: 'Ceramic plates, 4 pieces' },
    tags: [1], kind: 'sourced', salesPrice: 3600, purchasePrice: 1150,
    postage: 750, envelopeCost: 50, sold: false, listedDaysBefore: 20,
  },
  {
    month: 8, day: 9, hour: 15,
    name: { ja: 'ハンドメイド がま口ポーチ', en: 'Handmade clasp pouch' },
    tags: [4], kind: 'sourced', salesPrice: 1900, purchasePrice: 650,
    postage: 210, envelopeCost: 38, sold: false, listedDaysBefore: 13,
    targetProfit: 600,
  },
  {
    month: 8, day: 14, hour: 10,
    name: { ja: '木製トレー', en: 'Wooden tray' },
    tags: [3], kind: 'sourced', salesPrice: 2800, purchasePrice: 1200,
    postage: 750, envelopeCost: 50, sold: false, listedDaysBefore: 8,
  },
  {
    month: 8, day: 18, hour: 19,
    name: { ja: 'ニット セーター Mサイズ', en: 'Knit sweater, size M' },
    tags: [0], kind: 'used', salesPrice: 3200, postage: 450, envelopeCost: 50,
    sold: false, listedDaysBefore: 4, photo: 'sweater', targetProfit: 2000,
  },
];

/**
 * 投入先の材料。**プリセットは「値の写し」で参照する**（SPEC-V3 §1.5）ので、
 * 金額は上の表が持っており、ここで受け取るのは金額以外だけ。
 */
export type StoreShotSources = {
  /** 商品名・メモ・タグの言語。投入した時点の表示言語で固まる */
  locale: Locale;
  /** タグの id。STORE_SHOT_TAG_NAMES と同じ並び */
  tagIds: readonly string[];
  /** 販売サイト名（販売済みの記録に写る） */
  siteName: string;
  /**
   * 書き込み済みの商品写真のファイル名。**投入の前に写真置き場へ書いてから渡す** ──
   * 記録が持つのは名前だけで、実体はファイル（SPEC-V5 §1.3）。
   */
  photoFileNames: Partial<Record<StoreShotPhotoName, string>>;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 月と日から基準日を作る。年は撮影の基準日から取る */
function dateOf(row: Row): Date {
  return new Date(STORE_SHOT_TODAY.getFullYear(), row.month - 1, row.day, row.hour, 0);
}

function daysBefore(date: Date, days: number): Date {
  return new Date(date.getTime() - days * MS_PER_DAY);
}

function buildRecord(row: Row, sources: StoreShotSources): SaveRecordInput {
  const basisDate = dateOf(row);
  // 販売済みは「出品日 → 販売日」、出品中は基準日そのものが出品日
  const saleStartDate = row.sold ? daysBefore(basisDate, row.listedDaysBefore) : basisDate;

  return {
    itemName: row.name[sources.locale],
    kind: row.kind,
    salesPrice: row.salesPrice,
    purchasePrice: row.purchasePrice ?? 0,
    postage: row.postage,
    envelopeCost: row.envelopeCost,
    othersCost: row.othersCost ?? 0,
    commission: STORE_SHOT_COMMISSION,
    isSold: row.sold,
    saleStartDate,
    saleDate: row.sold ? basisDate : null,
    memo: row.memo?.[sources.locale] ?? '',
    // 出品中は販売サイトを写さない（repository.buildWhere が前提にしている。SPEC-V4 §4.2）
    siteName: row.sold ? sources.siteName : '',
    photoFileName: (row.photo != null ? sources.photoFileNames[row.photo] : null) ?? null,
    // 専用資材の要る配送方法は使っていない（SPEC-V6 §3）ので、控えもトグルも既定のまま
    shippingMaterialCost: 0,
    excludesShippingMaterial: false,
    targetProfit: row.targetProfit ?? null,
    tagIds: row.tags.map((index) => sources.tagIds[index]).filter((id) => id != null),
  };
}

/**
 * 撮影用の 42 件を組み立てる。**DB は触らない**ので、そのまま repository.create へ渡す。
 *
 * 出品中の記録は**出品日を STORE_SHOT_TODAY から逆算する**ので、
 * 「出品中 4 日目」から「25 日目」までが並ぶ（値下げシミュレータの撮影用）。
 */
export function buildStoreShotRecords(sources: StoreShotSources): SaveRecordInput[] {
  return ROWS.map((row) => buildRecord(row, sources));
}

/** テストと画面の要約表示が参照する、投入する件数の内訳 */
export const STORE_SHOT_COUNTS = {
  records: ROWS.length,
  sold: ROWS.filter((row) => row.sold).length,
  listing: ROWS.filter((row) => !row.sold).length,
  used: ROWS.filter((row) => row.kind === 'used').length,
  sourced: ROWS.filter((row) => row.kind === 'sourced').length,
  photos: ROWS.filter((row) => row.photo != null).length,
  tags: STORE_SHOT_TAG_NAMES.ja.length,
} as const;

/** 月ごとの件数（テストが参照する）。基準日の月で数える */
export const STORE_SHOT_MONTH_COUNTS: Readonly<Record<number, number>> = ROWS.reduce<
  Record<number, number>
>((counts, row) => ({ ...counts, [row.month]: (counts[row.month] ?? 0) + 1 }), {});
