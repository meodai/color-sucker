# Color Sucker

Color Sucker is a Node.js script that extracts color palettes from images in a specified folder. It supports multiple image formats, including `.jpg`, `.jpeg`, `.png`, and `.gif`. For `.gif` files, it extracts frames, combines them into a single image, and extracts the palette from the combined image.

## Quick Start

Will extract color palettes from images in the current directory and save them to `./output/palettes.json`:

```bash
npx color-sucker
```

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

There are two main ways to run Color Sucker:

### 1. Using npm (after cloning the repository)

If you have cloned the repository and installed dependencies:

```bash
npm start
```

This method uses the `sucker.config.js` file located within the cloned repository.

### 2. Using npx (recommended for quick use without cloning)

You can run Color Sucker directly in any directory using `npx`:

```bash
npx color-sucker
```

To specify the number of colors to extract, use the `--colors` or `-c` flag:

```bash
npx color-sucker --colors 10
# or
npx color-sucker -c 3
```

This will override the `paletteSize` defined in any `sucker.config.js` or the default value.

**Behavior with `npx`:**

- **With `sucker.config.js`:** If a `sucker.config.js` file is present in the directory where you run `npx color-sucker`, that configuration will be used (unless overridden by CLI flags like `--colors`).
- **Without `sucker.config.js`:** If no `sucker.config.js` is found in the current directory:
  - The script will look for images in the current directory (`.` or `process.cwd()`).
  - The output JSON file (`palettes.json`) will be saved to an `output` folder created within the current directory (`./output/palettes.json`).
  - Default values for `paletteSize`, `maxGifFrames`, and `maxThreads` from the script's internal default configuration will be used.

This makes it easy to quickly extract palettes from images in any folder without needing to clone the repository or manage a global installation.

## Dependencies

- **[Google Art Palette](https://github.com/google/art-palette)**: Used for palette extraction.
- **[p-queue](https://www.npmjs.com/package/p-queue)**: Manages parallel processing with a thread pool.
- **[gif-frames](https://www.npmjs.com/package/gif-frames)**: Extracts frames from GIF files.
- **[canvas](https://www.npmjs.com/package/canvas)**: Combines GIF frames into a single image.

## Output

The extracted palettes are saved in the JSON file specified in `sucker.config.js` (default: `output/palettes.json`). Each entry includes the image name and its extracted colors.

## License

This project is licensed under the MIT License.
