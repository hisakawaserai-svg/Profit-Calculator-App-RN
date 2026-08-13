-- 手で書いたマイグレーション（drizzle-kit の生成物ではない）。
-- SPEC-V7 §2.1: **タグの色もプリセットと同じ hex に揃える**（自由色を両方で選べるようにしたため）。
-- 変換表は 0007（プリセット）と同じ ── 同じパレットを共有しているので、同じ hex に落ちる。
-- 見た目は変わらない: resolvePresetTone がこの hex を固定色の識別子として拾い、
-- 明暗の出し分けは従来どおり続く。想定外の値は既定色の青へ倒す（読み出し時と同じ扱い）。
UPDATE `tags` SET `color_key` = CASE `color_key`
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
