// Configuration file for the color sucker script

export default {
  // Path to the folder containing images (relative to the project root)
  imagesFolder: "./images_examples",

  // Number of colors to extract from each image
  paletteSize: 5,

  // Path to the output JSON file (relative to the project root)
  outputJson: "./output/palettes.json",

  // Maximum number of frames to extract from GIFs (set to null for all frames)
  maxGifFrames: 10,

  // Maximum number of threads to use for parallel processing
  maxThreads: 5,
};
