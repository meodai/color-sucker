import { parentPort } from 'worker_threads';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas, Image } from 'canvas';
import PaletteExtractor from './libs/art-palette/palette-extraction/src/palette_extractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

parentPort.on('message', async (data) => {
  try {
    let imgBuffer;

    if (typeof data.imagePath === 'string') {
      imgBuffer = fs.readFileSync(data.imagePath);
    } else if (data.imageBuffer) {
      imgBuffer = data.imageBuffer;
    } else {
      throw new Error('No image data provided');
    }

    const img = new Image();

    const imageLoadPromise = new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (err) => reject(new Error('Failed to load image'));
      img.src = imgBuffer;
    });

    await imageLoadPromise;

    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, img.width, img.height);

    const paletteSize = data.paletteSize || 5;
    const extractor = new PaletteExtractor();
    const palette = extractor.processImageData(imageData.data, paletteSize);

    parentPort.postMessage({
      success: true,
      palette: palette,
      imageSize: {
        width: img.width,
        height: img.height
      }
    });
  } catch (err) {
    parentPort.postMessage({ 
      success: false, 
      error: err.message || 'Unknown error occurred'
    });
  }
});

parentPort.postMessage({ ready: true });
