module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-reanimated/plugin',
      [
        'module-resolver',
        {
          alias: {
            '@echoecho/shared': '../../packages/shared/src/index.ts',
            '@echoecho/ui': '../../packages/ui/src/index.ts',
          },
        },
      ],
    ],
  };
};
