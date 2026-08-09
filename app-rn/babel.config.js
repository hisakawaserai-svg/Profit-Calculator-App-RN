module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // drizzle の .sql マイグレーションファイルを文字列として import するため
      ['inline-import', { extensions: ['.sql'] }],
    ],
  };
};
