// babel-plugin-inline-import が .sql を文字列として import できるようにしている
// （babel.config.js / metro.config.js 参照）。その TypeScript 側の型宣言。
declare module '*.sql' {
  const content: string;
  export default content;
}
