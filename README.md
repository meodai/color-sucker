np# Color Sucker

Color Sucker is a Node.js script that extracts color palettes from images in a specified folder. It supports multiple image formats, including `.jpg`, `.jpeg`, `.png`, and `.gif`. For `.gif` files, it extracts frames, combines them into a single image, and extracts the palette from the combined image.

## Features
- Extracts color palettes from images.
- Supports `.jpg`, `.jpeg`, `.png`, and `.gif` formats.
- Combines frames from `.gif` files into a single image for palette extraction.
- Configurable via `sucker.config.js`.
- Parallel processing with configurable thread limits.

## Installation
1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd color-sucker
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

## Configuration
Edit the `sucker.config.js` file to customize the script:
- `imagesFolder`: Path to the folder containing images.
- `paletteSize`: Number of colors to extract from each image.
- `outputJson`: Path to the output JSON file.
- `maxGifFrames`: Maximum number of frames to extract from GIFs (set to `null` for all frames).
- `maxThreads`: Maximum number of threads for parallel processing.

## Usage
Run the script using npm:
```bash
npm start
```

## Dependencies
- **[Google Art Palette](https://github.com/google/art-palette)**: Used for palette extraction.
- **[p-queue](https://www.npmjs.com/package/p-queue)**: Manages parallel processing with a thread pool.
- **[gif-frames](https://www.npmjs.com/package/gif-frames)**: Extracts frames from GIF files.
- **[canvas](https://www.npmjs.com/package/canvas)**: Combines GIF frames into a single image.

## Output
The extracted palettes are saved in the JSON file specified in `sucker.config.js` (default: `output/palettes.json`). Each entry includes the image name and its extracted colors.

## License
This project is licensed under the MIT License.
