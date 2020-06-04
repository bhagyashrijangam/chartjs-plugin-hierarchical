import dts from 'rollup-plugin-dts';

export default {
  input: './.tmp/index.d.ts',
  output: {
    file: 'dist/index.d.ts',
    format: 'es',
  },
  external: ['chart.js'],
  plugins: [
    dts({
      respectExternal: true,
    }),
  ],
};
