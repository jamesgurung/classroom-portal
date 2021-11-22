const eleventyPluginFilesMinifier = require("@sherby/eleventy-plugin-files-minifier");
module.exports = function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy('src/*.(png|ico|json|js|txt)');
  eleventyConfig.addPlugin(eleventyPluginFilesMinifier);
};