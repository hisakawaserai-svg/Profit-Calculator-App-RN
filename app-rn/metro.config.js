const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// drizzle の .sql マイグレーションファイルをモジュールとして解決させる
config.resolver.sourceExts.push('sql');

module.exports = config;
