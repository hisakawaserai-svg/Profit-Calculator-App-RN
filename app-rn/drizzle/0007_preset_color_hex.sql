-- 手で書いたマイグレーション（drizzle-kit の生成物ではない）。
-- SPEC-V7 §2.1: プリセットのアイコン色を**色キーから hex へ**移す。自由色（カラーピッカー）と
-- 同じ形で 1 つの列に収めるため。値はライトテーマの地色そのもので、
-- resolvePresetTone がこの hex を「固定色の識別子」として拾い、明暗の出し分けは従来どおり続く。
--
-- **タグ（tags.color_key）は触らない。** 自由色を足したのはプリセットだけで、
-- タグは今もキーで読む（logic/preset.presetColorKeyOf が両方を受ける）。
--
-- 見た目は変わらない: 変換表はライトの presetTones の背景色そのもの。
-- 想定外の値（手で書き換えられた行）は既定色の青へ倒す ── 元々 normalizePresetColor が
-- 読み出しのたびに青へ倒していたので、保存値をそれに合わせるだけで表示は同じ。
UPDATE `presets` SET `color_key` = CASE `color_key`
  WHEN 'red' THEN '#FF3B30'
  WHEN 'orange' THEN '#F07800'
  WHEN 'yellow' THEN '#FFCC00'
  WHEN 'green' THEN '#2E9E4F'
  WHEN 'teal' THEN '#1E93AE'
  WHEN 'blue' THEN '#007AFF'
  WHEN 'indigo' THEN '#5856D6'
  WHEN 'purple' THEN '#9A3FCB'
  WHEN 'pink' THEN '#FF2D55'
  WHEN 'brown' THEN '#8E6B4A'
  WHEN 'gray' THEN '#6E6E73'
  ELSE '#007AFF'
END
WHERE `color_key` NOT LIKE '#%';
