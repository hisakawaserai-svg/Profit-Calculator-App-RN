// drizzle-kit generate が出力する migrations.js（型なし）の手書き宣言。
// generate をやり直してもこのファイルはそのまま使える。
declare const migrations: {
  journal: {
    entries: { idx: number; when: number; tag: string; breakpoints: boolean }[];
  };
  migrations: Record<string, string>;
};
export default migrations;
