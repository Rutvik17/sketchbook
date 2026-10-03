/** A fully static site: `npm run build` writes it into `out/`. */
module.exports = {
  output: 'export',
  reactStrictMode: true,
  trailingSlash: true,
  images: { unoptimized: true },
};
