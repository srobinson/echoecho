/** @type {import('expo/config').ExpoConfig} */
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins?.filter(
      (p) => !(Array.isArray(p) && p[0] === '@rnmapbox/maps')
    ) ?? []),
    [
      '@rnmapbox/maps',
      {
        RNMapboxMapsDownloadToken: process.env.MAPBOX_DOWNLOADS_TOKEN ?? '',
      },
    ],
  ],
});
