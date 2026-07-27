// Preserve the existing flat URLs (/calculator.html, not /calculator/).
export default {
  eleventyComputed: {
    permalink: (data) => `${data.page.filePathStem}.html`,
  },
};
