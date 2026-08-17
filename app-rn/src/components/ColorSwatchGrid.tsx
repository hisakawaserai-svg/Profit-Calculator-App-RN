// 色の選択（SPEC-V7 §3）。**色を使用状況で 2 群に分ける**（設計案 50c）。
//
// | 上の群 | まだ使っていない色。44pt の丸を 4 列に並べる（行数は残り数で決まる）。自由色は常に最後 |
// | 下の群 | 使用中。28pt に落とし、使っている名前を添えて折り返す。**押せば選べる**（禁止しない） |
//
// **固定 11 色を使い切ったときだけ、この 2 群の主役を入れ替える**（設計案 51b。下記 allUsed）。
//
// 群に分けたので、49c の「使用済みの丸に点を添える」は要らなくなった（廃止）──
// 点は「この色は誰かが使っている」を 1 個ずつ言うものだったが、群に分ければ
// 位置そのものがそれを言い、しかも**誰が使っているのか**まで読める。
//
// **プリセットの編集画面とタグの編集画面が同じものを使う。** 2 つは同じパレットを共有していて
// （SPEC-V4 §2.3）、片方だけ自由色が選べる・片方だけ並びが違う、という状態を作らない。
//
// 12 個目（自由色）だけが「押すと決める」口で、他の 11 個は押した時点で決まる ──
// 連続量を合わせる操作はシートの中でやる（ColorPickerSheet）。
//
// **列数は幅で決めない**（設計案 49c）。以前は flexWrap の自然な折り返しに任せていたが、
// 1 個 46pt ＋ gap 12pt では 6 個並べるのに 336pt 要り、カードの中がそれを下回る端末
// （iPhone SE / 15 / 16 など画面幅 400pt 未満）では黙って 5 + 5 + 2 の 3 段に割れていた。
// 同じ画面が端末ごとに違う段組みで出るのを避けるため、1 個の幅を 25% にして 4 列に固定する。
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ColorPickerSheet } from '@/components/ColorPickerSheet';
import {
  colorRemainingLabel,
  colorUserLabel,
  COLOR_ALL_USED_SUBTITLE,
  COLOR_SELECTABLE_SECTION_LABEL,
  COLOR_UNUSED_SECTION_LABEL,
  COLOR_USED_PICK_SECTION_LABEL,
  COLOR_USED_SECTION_LABEL,
  CUSTOM_COLOR_CHANGE_LABEL,
  CUSTOM_COLOR_CREATE_LABEL,
  CUSTOM_COLOR_LABEL,
  otherUsedSectionLabel,
  ownColorLabel,
  presetColorLabel,
  sameColorNote,
} from '@/logic/labels';
import {
  PRESET_COLOR_HEXES,
  PRESET_COLOR_KEYS,
  presetColorKeyOf,
  type PresetColorKey,
} from '@/logic/preset';
import { useThemeColors } from '@/theme';

/**
 * 上の群の丸の直径（§3.3-6）。4 列に固定したぶん 1 個あたりの持ち幅が増えたので 36 → 44 に上げた。
 * iPhone SE（375pt）でもカードの中は 311pt あり、1 列 77.75pt に対して器は 54pt で収まる。
 */
export const SWATCH_SIZE = 44;

/**
 * 下の群の丸の直径（設計案 50c）。**選ぶ対象ではなく「もう使われている」の一覧**なので、
 * 上の群より小さくして名前を横に置く。名前が本体で、色はその印。
 *
 * ただし固定色を使い切ったときは下の群が唯一の選び先になるので、
 * そこでは上の群と同じ `SWATCH_SIZE` に戻す（設計案 51b）。
 */
const USED_SWATCH_SIZE = 28;

/** 使い切ったときの「新しい色を作る」の行（設計案 51b）。幅いっぱい・56pt */
const CREATE_ROW_HEIGHT = 56;

/** その行の左に置く丸の直径。行の高さ（56pt）に器（枠 2pt ＋ 余白 3pt）ごと収まる大きさ */
const CREATE_ICON_SIZE = 36;

/** ある色を使っている 1 件。呼び出し側が組み立てて渡す */
export type ColorUsage = {
  /** 保存値そのまま（hex / 旧形式のキー）。正規化はこの部品が行う */
  colorKey: string;
  /** その色を使っている行の名前（タグ名 / プリセット名） */
  name: string;
};

type Props = {
  /** いま選ばれている色（hex）。固定色かどうかは値そのもので決まる */
  value: string;
  onChange: (hex: string) => void;
  /**
   * **他の行が使っている色と、その名前**（設計案 50c）。
   *
   * 呼び出し側が組み立てるのは、「使用中」の数え方が呼び出し側の都合だから ──
   * **タグは全タグの中で、プリセットは同じ種類の中だけ**で数える（送料で赤が使われていても、
   * 梱包材の編集画面では赤はまだ使っていない色）。この部品が DB を引くと、
   * どちらの数え方に合わせても片方が必ず間違う。
   *
   * **編集中の自分自身は必ず除いて渡すこと**（自分の色は `ownColor` の側で扱う）。
   * 同じ色を複数が使っていることはあるので、色ごとに 1 件とは限らない。
   */
  usedBy?: readonly ColorUsage[];
  /**
   * **編集中の行が保存している色**（追加のときは省略）。この色だけは使用中でも
   * **上の群の先頭に残す**（設計案 50c）── 自分の色が「使用中」に落ちていると、
   * いま何色なのかを下の群から探すことになり、変えろと言われているようにも読める。
   *
   * `value`（いま選ばれている色）ではなく**保存値**を渡すこと ── `value` を見ると、
   * 使用中の色を押した瞬間にその色が上の群へ移動してしまう。
   */
  ownColor?: string;
  /**
   * 見出しに入れる名詞（「タグ」「送料」「梱包材」…）。
   * 「ほかの**タグ**が使用中」「オレンジ（この**タグ**の色）」の穴埋めに使う。
   */
  entityLabel: string;
};

export function ColorSwatchGrid({ value, onChange, usedBy, ownColor, entityLabel }: Props) {
  const colors = useThemeColors();
  const [pickerOpen, setPickerOpen] = useState(false);
  /** 固定 11 色のどれでもない ＝ 自由色 */
  const isCustom = presetColorKeyOf(value) == null;
  const selectedKey = presetColorKeyOf(value);
  /** 自分の色が固定色ならそのキー。追加のとき・自由色のときは null（先頭に残す丸が無い） */
  const ownKey = ownColor == null ? null : presetColorKeyOf(ownColor);
  const isEditing = ownColor != null;

  // 色キー -> 使っている名前。**自分の色ぶんも入れる** ── 下の群には出さない（下記）が、
  // 「自分と同じ色を他も使っている」を注記で言えるようにするため。
  // 自由色（キーに落ちない値）は入れない ── 固定色の丸を振り分けるための表で、
  // 自由色は固定色のどれとも重ならない（tag.ts の nextTagColor と同じ方針）
  const namesByKey = new Map<PresetColorKey, string[]>();
  for (const usage of usedBy ?? []) {
    const key = presetColorKeyOf(usage.colorKey);
    if (key == null) continue;
    const names = namesByKey.get(key);
    if (names) names.push(usage.name);
    else namesByKey.set(key, [usage.name]);
  }

  /** 上の群に出す固定色。自分の色を先頭に置き、残りはパレットの並び順 */
  const selectable = PRESET_COLOR_KEYS.filter((key) => key !== ownKey && !namesByKey.has(key));
  const unusedKeys = ownKey == null ? selectable : [ownKey, ...selectable];
  /**
   * 下の群に出す固定色。並びはパレットの順（押すたびに位置が動かない）。
   * **自分の色は他も使っていても外す** ── 上の群の先頭に出ているものを、
   * 同じカードの中にもう一度並べない（重なっていることは注記が言う）。
   */
  const usedKeys = PRESET_COLOR_KEYS.filter((key) => key !== ownKey && namesByKey.has(key));

  /**
   * **固定色が 1 つも残っていない**（設計案 51b）。この 1 個の真偽で 2 群の主役が入れ替わる ──
   * 上は「新しい色を作る」の 1 行だけ、下は 44pt に戻した「使用中の色から選ぶ」。
   * 分岐をこの 1 か所に集めておくのは、通常時と使い切った状態が**同じ 2 群の別の姿**で、
   * 条件が散ると片方だけ直したときに姿が半分ずつ混ざるため。
   *
   * 編集のときは自分の色が上の群の先頭に残る（`unusedKeys`）ので、**自分の色が固定色なら
   * ここには入らない** ── 入るのは「自分は自由色 ＋ 固定 11 色を他が使い切っている」ときだけ。
   */
  const allUsed = unusedKeys.length === 0;

  /** いま選んでいる色を使っている他の行（設計案 50c の注記）。自分の色を選び直しても出ない */
  const collidingNames = selectedKey == null ? undefined : namesByKey.get(selectedKey);

  return (
    <>
      {allUsed ? (
        /* 上の群（設計案 51b）。**見出しを持たない** ── 「まだ使っていない色 0色」と書くのは、
           無いものを 1 行使って言うことになる。使い切ったことは行の副文言が 1 回だけ言う。
           4 列のグリッドも使わない（1 個だけ埋まった段は、空いた 3 枠のほうが目に入る） */
        <Pressable
          onPress={() => setPickerOpen(true)}
          accessibilityRole="button"
          accessibilityState={{ selected: isCustom }}
          accessibilityLabel={`${isCustom ? CUSTOM_COLOR_CHANGE_LABEL : CUSTOM_COLOR_CREATE_LABEL} ${COLOR_ALL_USED_SUBTITLE}`}
          style={({ pressed }) => [
            styles.createRow,
            { backgroundColor: colors.disabledBackground, opacity: pressed ? 0.6 : 1 },
          ]}>
          <View
            style={[
              styles.createSlot,
              // 選択中のリングは上の群の丸と同じ作法。自由色を選んでいる間だけ付く
              { borderColor: isCustom ? colors.label : 'transparent' },
            ]}>
            {isCustom ? (
              <View
                style={[
                  styles.createSwatch,
                  styles.createSwatchOutline,
                  { backgroundColor: value, borderColor: colors.separator },
                ]}
              />
            ) : (
              <PaletteDisc />
            )}
          </View>
          <View style={styles.createText}>
            <Text style={[styles.createTitle, { color: colors.blue }]} numberOfLines={1}>
              {isCustom ? CUSTOM_COLOR_CHANGE_LABEL : CUSTOM_COLOR_CREATE_LABEL}
            </Text>
            <Text style={[styles.createNote, { color: colors.secondaryLabel }]} numberOfLines={1}>
              {COLOR_ALL_USED_SUBTITLE}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.secondaryLabel} />
        </Pressable>
      ) : (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionLabel, { color: colors.secondaryLabel }]}>
              {isEditing ? COLOR_SELECTABLE_SECTION_LABEL : COLOR_UNUSED_SECTION_LABEL}
            </Text>
            {/* 右は「あと何色あるか」。編集のときは代わりに自分の色を名指しする ──
                先頭の丸が自分の色であることは、丸を見ただけでは分からない */}
            <Text style={[styles.sectionValue, { color: colors.secondaryLabel }]}>
              {isEditing
                ? ownColorLabel(ownColor, entityLabel)
                : colorRemainingLabel(unusedKeys.length)}
            </Text>
          </View>

          <View style={styles.swatches}>
            {unusedKeys.map((key) => {
              const selected = selectedKey === key;
              return (
                <View key={key} style={styles.cell}>
                  <Pressable
                    onPress={() => onChange(PRESET_COLOR_HEXES[key])}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={presetColorLabel(PRESET_COLOR_HEXES[key])}
                    style={({ pressed }) => [
                      styles.slot,
                      {
                        // 選択中は外周にリング（§3.3-6）。丸の外側に間を空けて二重丸にするので、
                        // 枠は丸そのものではなくこの器が持つ（丸の中に線が食い込まない）
                        borderColor: selected ? colors.label : 'transparent',
                        opacity: pressed ? 0.5 : 1,
                      },
                    ]}>
                    <View
                      style={[
                        styles.swatch,
                        { backgroundColor: colors.presetTones[key].background },
                      ]}
                    />
                  </Pressable>
                </View>
              );
            })}

            {/* 12 個目 ＝ 自由色（§3）。**常に上の群の最後**（設計案 50c）── 使用状況で
                位置が動かない唯一の丸なので、いつも同じ場所で見つかる。
                **選んでいる間はその色そのものを映す** ── 「押すと開く」ことはパレットの
                アイコンで示し、選択中は他の丸と同じリングが付く */}
            <View style={styles.cell}>
              <Pressable
                onPress={() => setPickerOpen(true)}
                accessibilityRole="button"
                accessibilityState={{ selected: isCustom }}
                accessibilityLabel={CUSTOM_COLOR_LABEL}
                style={({ pressed }) => [
                  styles.slot,
                  {
                    borderColor: isCustom ? colors.label : 'transparent',
                    opacity: pressed ? 0.5 : 1,
                  },
                ]}>
                <View
                  style={[
                    styles.swatch,
                    styles.customSwatch,
                    {
                      backgroundColor: isCustom ? value : colors.secondaryBackground,
                      borderColor: colors.separator,
                    },
                  ]}>
                  {!isCustom && (
                    <Ionicons name="color-palette-outline" size={24} color={colors.blue} />
                  )}
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* 下の群（設計案 50c）。**押せば選べる** ── 同じ色を 2 つに付けるのが誤りだとは
          限らないので、禁止はせず「そうなると分かった上で選ぶ」形にする。
          重なったときは下の 1 行（注記）が言う。

          **使い切ったときはここが主役になる**（設計案 51b）── 固定色を選べる場所が
          ここしかないので、丸を上の群と同じ 44pt に戻し、淡くするのもやめる。
          並べ方（折り返す一覧）は変えない ── 名前の長さがまちまちなので、
          短い名前は 3 つ、長い名前は 2 つと自然に折り返るほうが空きが出ない */}
      {usedKeys.length > 0 && (
        <View style={styles.section}>
          <View style={[styles.divider, { backgroundColor: colors.separator }]} />
          <Text style={[styles.sectionLabel, { color: colors.secondaryLabel }]}>
            {allUsed
              ? COLOR_USED_PICK_SECTION_LABEL
              : isEditing
                ? otherUsedSectionLabel(entityLabel)
                : COLOR_USED_SECTION_LABEL}
          </Text>
          <View style={styles.usedList}>
            {usedKeys.map((key) => {
              const names = namesByKey.get(key) ?? [];
              const selected = selectedKey === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => onChange(PRESET_COLOR_HEXES[key])}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${presetColorLabel(PRESET_COLOR_HEXES[key])} ${colorUserLabel(names)}`}
                  style={({ pressed }) => [styles.usedItem, { opacity: pressed ? 0.5 : 1 }]}>
                  <View
                    style={[
                      allUsed ? styles.slot : styles.usedSlot,
                      { borderColor: selected ? colors.label : 'transparent' },
                    ]}>
                    <View
                      style={[
                        allUsed ? styles.swatch : styles.usedSwatch,
                        {
                          backgroundColor: colors.presetTones[key].background,
                          // **選んでいない間は淡く**（設計案 50c）── もう使われている側なので、
                          // 上の群と同じ濃さで並ぶと「こちらも候補」として同じ重さに見える。
                          // 選んだ瞬間だけ本来の濃さに戻し、いま何を選んでいるかを見失わせない。
                          // 使い切ったときはこちらが候補そのものなので、落とさない（51b）
                          opacity: allUsed || selected ? 1 : 0.5,
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.usedName,
                      allUsed && styles.usedNameLarge,
                      { color: allUsed ? colors.label : colors.secondaryLabel },
                    ]}
                    numberOfLines={1}>
                    {colorUserLabel(names)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* 重なったときの 1 行（設計案 50c）。**Alert では止めない** ── 選び終えた後に
          割り込んで「はい」を押させるほどのことではなく、直すかどうかは本人が決める */}
      {collidingNames != null && collidingNames.length > 0 && (
        <Text style={[styles.note, { color: colors.secondaryLabel }]} accessibilityRole="alert">
          {sameColorNote(collidingNames)}
        </Text>
      )}

      {pickerOpen && (
        <ColorPickerSheet
          visible={pickerOpen}
          value={value}
          onSelect={onChange}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}

/**
 * 「新しい色を作る」の左に置く虹色の丸（設計案 51b）。**色は作らない** ──
 * 円周を 11 等分し、既にある固定パレット（`presetTones`）をその順で敷いているだけで、
 * 色相を計算して増やしてはいない（候補色を計算で作らない、という §3.1 の制約と同じ線）。
 * テーマに追従するので、暗い地の上でも各色が沈まない。
 */
function PaletteDisc() {
  const colors = useThemeColors();
  const r = CREATE_ICON_SIZE / 2;
  const step = 360 / PRESET_COLOR_KEYS.length;

  /** 中心 →（弧の始点）→ 弧 → 中心、で扇形 1 枚。12 時から時計回りに置く */
  const wedge = (index: number): string => {
    const point = (deg: number) => {
      const rad = ((deg - 90) * Math.PI) / 180;
      // 端は 0.5pt だけ外へ出す（隣と重ねて、継ぎ目に地色の筋が出るのを防ぐ）
      const reach = r + 0.5;
      return `${(r + reach * Math.cos(rad)).toFixed(3)},${(r + reach * Math.sin(rad)).toFixed(3)}`;
    };
    // 1 枚が 360/11 ≒ 32.7° なので、大きい弧の指定（large-arc-flag）は常に 0
    return `M${r},${r} L${point(index * step)} A${r + 0.5},${r + 0.5} 0 0 1 ${point((index + 1) * step)} Z`;
  };

  return (
    <Svg width={CREATE_ICON_SIZE} height={CREATE_ICON_SIZE} style={styles.disc}>
      {PRESET_COLOR_KEYS.map((key, index) => (
        <Path key={key} d={wedge(index)} fill={colors.presetTones[key].background} />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
  },
  // 見出しの行。左が群の名前、右が残り数（または自分の色）
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12,
  },
  sectionValue: {
    flexShrink: 1,
    fontSize: 12,
  },
  // 2 群を仕切る線。カードを 2 枚に割らないのは、どちらも「色を選ぶ」1 つの操作だから
  divider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  // 横の間は列の幅（25%）が持つので gap を使わない。段の間だけ rowGap で空ける
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 12,
  },
  // 1 個ぶんの持ち幅。**必ず 4 列**（残り数で行数だけが変わる）
  cell: {
    width: '25%',
    alignItems: 'center',
  },
  slot: {
    padding: 3,
    borderWidth: 2,
    borderRadius: SWATCH_SIZE / 2 + 5,
  },
  swatch: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: SWATCH_SIZE / 2,
  },
  // 自由色の丸。まだ選んでいないときは空の器に見せる（中のアイコンが「開く」を言う）
  customSwatch: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  // 下の群は列を固定しない ── 名前の長さがまちまちで、等幅に割ると短い名前の周りが空く
  usedList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
    columnGap: 14,
  },
  usedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    // 名前が長くても 1 件で行を占め切らないところで頭打ちにする（1〜2 行に収める）
    maxWidth: '46%',
  },
  usedSlot: {
    padding: 2,
    borderWidth: 1.5,
    borderRadius: USED_SWATCH_SIZE / 2 + 3.5,
  },
  usedSwatch: {
    width: USED_SWATCH_SIZE,
    height: USED_SWATCH_SIZE,
    borderRadius: USED_SWATCH_SIZE / 2,
  },
  usedName: {
    flexShrink: 1,
    fontSize: 13,
  },
  // 使い切ったときは名前も選択肢の名前になるので、丸（44pt）に釣り合う大きさへ戻す（51b）
  usedNameLarge: {
    fontSize: 15,
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
  },

  // ---- 設計案 51b: 固定 11 色を使い切ったときの「新しい色を作る」の 1 行 ----
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: CREATE_ROW_HEIGHT,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  // 上の群の丸と同じ二重丸。枠は丸ではなくこの器が持つ（丸の中に線が食い込まない）
  createSlot: {
    padding: 3,
    borderWidth: 2,
    borderRadius: CREATE_ICON_SIZE / 2 + 5,
  },
  createSwatch: {
    width: CREATE_ICON_SIZE,
    height: CREATE_ICON_SIZE,
    borderRadius: CREATE_ICON_SIZE / 2,
  },
  // 選んでいる自由色は下地に近い色もあり得るので、枠を回して形を残す（§4 と同じ理由）
  createSwatchOutline: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  disc: {
    borderRadius: CREATE_ICON_SIZE / 2,
  },
  // 主文言と副文言。残りの幅を全部取って、シェブロンを右端に押しやる
  createText: {
    flex: 1,
    gap: 2,
  },
  createTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  createNote: {
    fontSize: 12,
  },
});
