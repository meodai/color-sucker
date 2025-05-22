import { parentPort } from 'worker_threads';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas, Image } from 'canvas';
import PaletteExtractor from './libs/art-palette/palette-extraction/src/palette_extractor.js';

// Get directory name correctly in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Process messages from the main thread
parentPort.on('message', async (data) => {
  try {
    // Check if we received an image path or buffer
    let imgBuffer;

    if (typeof data.imagePath === 'string') {
      // Load image from path
      imgBuffer = fs.readFileSync(data.imagePath);
    } else if (data.imageBuffer) {
      // Use provided image buffer
      imgBuffer = data.imageBuffer;
    } else {
      throw new Error('No image data provided');
    }

    // Create an image and process it
    const img = new Image();

    // Wait for the image to load
    const imageLoadPromise = new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (err) => reject(new Error('Failed to load image'));
      img.src = imgBuffer;
    });

    await imageLoadPromise;

    // Now we can safely use the image dimensions
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');

    // Draw the image to canvas
    ctx.drawImage(img, 0, 0);

    // Get image data
    const imageData = ctx.getImageData(0, 0, img.width, img.height);

    // Extract palette using the palette extractor
    const paletteSize = data.paletteSize || 5;
    const extractor = new PaletteExtractor();
    const palette = extractor.processImageData(imageData.data, paletteSize);

    // Send result back to main thread
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

// Notify that the worker is ready
parentPort.postMessage({ ready: true });
