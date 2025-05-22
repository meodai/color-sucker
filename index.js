#!/usr/bin/env node

import { Worker } from 'worker_threads';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import config from './sucker.config.js';
import { readdir, mkdir, writeFile, rm } from 'fs/promises';
import gifFrames from 'gif-frames';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { createCanvas, loadImage } from 'canvas';

const pipelineAsync = promisify(pipeline);

// Get directory name correctly in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Extract color palette from an image using a worker thread
 * @param {Object} options - Options for extraction
 * @param {string} [options.imagePath] - Path to the image file
 * @param {Buffer} [options.imageBuffer] - Image buffer (alternative to imagePath)
 * @param {number} [options.paletteSize=5] - Number of colors to extract (default: 5)
 * @returns {Promise<string[]>} - Promise resolving to an array of hex color codes
 */
function extractPalette(options = {}) {
  return new Promise((resolve, reject) => {
    // Validate options
    if (!options.imagePath && !options.imageBuffer) {
      return reject(new Error('Either imagePath or imageBuffer must be provided'));
    }

    // Create a worker with the correct URL format for ES modules
    const workerPath = new URL('./paletteWorker.js', import.meta.url);
    const worker = new Worker(workerPath);
    
    // Listen for messages from the worker
    worker.on('message', (message) => {
      if (message.ready) {
        // Worker is initialized and ready
        return;
      }
      
      if (message.success) {
        // Resolve with the palette
        resolve(message.palette);
      } else {
        // Reject with error
        reject(new Error(message.error || 'Unknown worker error'));
      }
      
      // Terminate the worker after receiving the result
      worker.terminate();
    });
    
    // Handle worker errors
    worker.on('error', (err) => {
      reject(new Error(`Worker error: ${err.message}`));
      worker.terminate();
    });
    
    // Handle worker exit
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
    
    // Send the image data to the worker
    worker.postMessage({
      imagePath: options.imagePath,
      imageBuffer: options.imageBuffer,
      paletteSize: options.paletteSize || 5
    });
  });
}

// Process images from the configured folder, extract palettes, and save to JSON
async function processImages() {
  try {
    const imagesFolder = path.join(__dirname, config.imagesFolder);
    const outputJsonPath = path.join(__dirname, config.outputJson);

    // Ensure the output directory exists
    const outputDir = path.dirname(outputJsonPath);
    await mkdir(outputDir, { recursive: true });

    // Read all image files from the folder
    const files = await readdir(imagesFolder);
    // Filter image files and exclude any PNG files that appear to be extracted gif frames
    const imageFiles = files.filter(file => {
      // Skip any PNG files with names that suggest they're from GIF frames
      if (file.match(/_frame\d*\.png$/i)) {
        return false;
      }
      // Include all other image files
      return file.match(/\.(jpg|jpeg|png|gif)$/i);
    });

    const processedGifs = new Set(); // Keep track of processed GIFs
    const results = [];

    for (const imageFile of imageFiles) {
      const imagePath = path.join(imagesFolder, imageFile);
      console.log(`Processing image: ${imageFile}`);

      try {
        // Skip this iteration if we've already processed this GIF
        if (imageFile.toLowerCase().endsWith('.gif') && processedGifs.has(imageFile)) {
          console.log(`Skipping already processed GIF: ${imageFile}`);
          continue;
        }

        let processedImagePath = imagePath;

        // Handle .gif files by extracting frames
        if (imageFile.toLowerCase().endsWith('.gif')) {
          processedGifs.add(imageFile); // Mark this GIF as processed

          const tempFramesDir = path.join(__dirname, 'output/temp_frames');
          await mkdir(tempFramesDir, { recursive: true });

          const frames = await gifFrames({
            url: imagePath,
            frames: config.maxGifFrames ? Array.from({ length: config.maxGifFrames }, (_, i) => i) : 'all',
            outputType: 'png'
          });

          const framePaths = [];
          for (let i = 0; i < frames.length; i++) {
            const framePath = path.join(tempFramesDir, `${path.basename(imageFile, '.gif')}_frame_${i}.png`);
            const writeStream = fs.createWriteStream(framePath);
            await pipelineAsync(frames[i].getImage(), writeStream);
            framePaths.push(framePath);
          }

          // Combine frames into a single image
          const images = await Promise.all(framePaths.map(frame => loadImage(frame)));
          const canvas = createCanvas(images[0].width * images.length, images[0].height);
          const ctx = canvas.getContext('2d');

          images.forEach((img, index) => {
            ctx.drawImage(img, index * img.width, 0);
          });

          const combinedImagePath = path.join(tempFramesDir, `${path.basename(imageFile, '.gif')}_combined.png`);
          
          // Debugging: Log the number of frames and canvas dimensions
          console.log(`Combining ${images.length} frames into a single image.`);
          console.log(`Canvas dimensions: ${canvas.width}x${canvas.height}`);

          // Ensure the temp_frames directory exists before writing the combined image
          if (!fs.existsSync(tempFramesDir)) {
            await mkdir(tempFramesDir, { recursive: true });
          }

          // Add error handling for the file stream pipeline
          await new Promise((resolve, reject) => {
            const stream = canvas.createPNGStream();
            const out = fs.createWriteStream(combinedImagePath);
            stream.pipe(out);
            out.on('finish', resolve);
            out.on('error', (err) => {
              console.error(`Error writing combined image: ${err.message}`);
              reject(err);
            });
          });

          // Verify the file exists before proceeding
          if (!fs.existsSync(combinedImagePath)) {
            throw new Error(`Failed to create combined image: ${combinedImagePath}`);
          }

          processedImagePath = combinedImagePath;
          
          // Clean up only the individual frame files, keep the combined image for now
          for (const framePath of framePaths) {
            fs.unlinkSync(framePath);
          }
        }

        // Extract the palette
        console.log(`Extracting palette from: ${processedImagePath}`);
        const palette = await extractPalette({
          imagePath: processedImagePath,
          paletteSize: config.paletteSize
        });

        // Display the colors in a more visual way in the terminal
        const colorBlocks = palette.map(color => {
          return `\x1b[48;2;${parseInt(color.slice(1, 3), 16)};${parseInt(color.slice(3, 5), 16)};${parseInt(color.slice(5, 7), 16)}m     \x1b[0m ${color}`;
        });

        console.log('\nExtracted palette:');
        colorBlocks.forEach(block => console.log(block));

        // For the output JSON, use the original filename (especially for GIFs)
        results.push({
          imageName: imageFile, // This is already correct because imageFile still refers to the original file
          colors: palette
        });
        
        // Now it's safe to clean up the temp directory if this was a GIF
        if (imageFile.toLowerCase().endsWith('.gif')) {
          try {
            const tempFramesDir = path.join(__dirname, 'output/temp_frames');
            if (fs.existsSync(tempFramesDir)) {
              await fs.promises.rm(tempFramesDir, { recursive: true, force: true });
              console.log(`Cleaned up temporary directory: ${tempFramesDir}`);
            }
          } catch (cleanupErr) {
            console.error(`Error cleaning up temp directory: ${cleanupErr.message}`);
          }
        }
      } catch (err) {
        console.error(`Failed to process image ${imageFile}:`, err);
      }
    }

    // Write results to the output JSON file
    await writeFile(outputJsonPath, JSON.stringify(results, null, 2));
    console.log(`Palettes saved to ${outputJsonPath}`);
  } catch (err) {
    console.error('Error processing images:', err);
  }
}

// Example usage
async function example() {
  try {
    // From a file path
    const palette = await extractPalette({ 
      imagePath: path.join(__dirname, 'libs/art-palette/palette-extraction/palette_demo_example.jpg'),
      paletteSize: 6 
    });
    console.log('Extracted palette:', palette);
    
    // Alternatively from a buffer
    // const imageBuffer = fs.readFileSync('path/to/image.jpg');
    // const palette = await extractPalette({ imageBuffer, paletteSize: 5 });
  } catch (err) {
    console.error('Failed to extract palette:', err);
  }
}

// Export the function for use in other modules
export { extractPalette };

// In ES modules, the equivalent condition for the main module is:
if (import.meta.url === `file://${process.argv[1]}`) {
  processImages();
}