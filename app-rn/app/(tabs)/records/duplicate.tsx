// 「過去の記録から複製」の複製元を選ぶルート（記録タブの Stack に積む）。
//
// 記録タブの＋のメニューから push する。データタブからは開かない ── 複製は
// 「記録を作る」操作なので、＋のある記録タブの中で閉じる（詳細画面と同じ扱いで、
// タブをまたぐ push はしない）。画面の中身は src/screens に置く（他のルートと同じ形）。
import { DuplicateSourceScreen } from '@/screens/DuplicateSourceScreen';

export default function DuplicateRoute() {
  return <DuplicateSourceScreen />;
}
