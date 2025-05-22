// Configuration file for the color sucker script

export default {
  // Path to the folder containing images (relative to the project root)
  imagesFolder: "./images_examples",

  // Path to the output folder (relative to the project root)
  outputFolder: "./output",

  // Number of colors to extract from each image
  paletteSize: 5,

  // Filename for the output JSON file (will be placed in outputFolder)
  outputJson: "palettes.json",

  // Filename for the HTML report (will be placed in outputFolder, optional)
  // Set to a filename like "report.html" to generate, or null/undefined to skip (unless --report html is used)
  outputHtml: "report.html",

  // Maximum number of frames to extract from GIFs (set to null for all frames)
  maxGifFrames: 10,

  // Maximum number of threads to use for parallel processing
  maxThreads: 5,
};
