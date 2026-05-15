// 11ty config — 11ty 3.x still expects CommonJS for the config file even
// in an ESM package. The build-index.mjs above is ESM; this config is CJS.
module.exports = function (eleventyConfig) {
  // Pass through the JSON so it ends up at /_site/searchIndex.json too,
  // alongside the data-file copy that's available inside templates.
  eleventyConfig.addPassthroughCopy({ 'src/_data/searchIndex.json': 'searchIndex.json' });

  return {
    dir: { input: 'src', output: '_site' },
    templateFormats: ['njk', 'html'],
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: 'njk',
  };
};
