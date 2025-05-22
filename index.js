#!/usr/bin/env node

import { Worker } from 'worker_threads';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { readdir, mkdir, writeFile, rm } from 'fs/promises';
import gifFrames from 'gif-frames';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { createCanvas, loadImage } from 'canvas';
import PQueue from 'p-queue';
import { existsSync } from 'fs';

const pipelineAsync = promisify(pipeline);

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
  // Add detailed logs to track execution flow
  console.log('Starting processImages function...');

  console.log('Configuration:', config);

  const absoluteOutputFolder = path.resolve(process.cwd(), config.outputFolder);
  console.log(`Output folder resolved to: ${absoluteOutputFolder}`);

  const absoluteOutputJsonPath = path.join(absoluteOutputFolder, config.outputJson);
  console.log(`Output JSON path resolved to: ${absoluteOutputJsonPath}`);

  if (!fs.existsSync(absoluteOutputFolder)) {
    await mkdir(absoluteOutputFolder, { recursive: true });
    console.log(`Created output directory: ${absoluteOutputFolder}`);
  }

  try {
    const imagesFolder = config.imagesFolder;

    console.log(`Images folder: ${imagesFolder}`);
    console.log(`Output JSON path: ${absoluteOutputJsonPath}`);

    const files = await readdir(imagesFolder);
    const imageFiles = files.filter(file => {
      if (file.match(/_frame\d*\.png$/i)) {
        return false;
      }
      return file.match(/\.(jpg|jpeg|png|gif)$/i);
    });

    console.log(`Images folder: ${imagesFolder}`);
    console.log('Files found in images folder:', files);

    const processedGifs = new Set();
    const results = [];

    const queue = new PQueue({ concurrency: config.maxThreads });

    await Promise.all(imageFiles.map(imageFile => {
      return queue.add(async () => {
        const imagePath = path.join(imagesFolder, imageFile);
        console.log(`Processing image: ${imageFile}`);

        try {
          // Skip this iteration if we've already processed this GIF
          if (imageFile.toLowerCase().endsWith('.gif') && processedGifs.has(imageFile)) {
            console.log(`Skipping already processed GIF: ${imageFile}`);
            return;
          }

          let processedImagePath = imagePath;

          // Handle .gif files by extracting frames
          if (imageFile.toLowerCase().endsWith('.gif')) {
            processedGifs.add(imageFile); // Mark this GIF as processed

            const tempFramesDir = path.join(absoluteOutputFolder, 'temp_frames');
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
            
            console.log(`Combining ${images.length} frames into a single image.`);
            console.log(`Canvas dimensions: ${canvas.width}x${canvas.height}`);

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
            
            for (const framePath of framePaths) {
              fs.unlinkSync(framePath);
            }
          }

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

          results.push({
            imageName: imageFile,
            colors: palette
          });
          
          if (imageFile.toLowerCase().endsWith('.gif')) {
            try {
              const tempFramesDir = path.join(absoluteOutputFolder, 'temp_frames');
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
        console.log(`Finished processing image: ${imageFile}`);
      });
    }));
    
    console.log('Writing results to output JSON...');
    await writeFile(absoluteOutputJsonPath, JSON.stringify(results, null, 2));
    console.log('Results successfully written to output JSON.');
    console.log(`Palettes saved to ${absoluteOutputJsonPath}`);

    // Conditional HTML report generation
    if (reportType === 'html' || (config.outputHtml && typeof config.outputHtml === 'string')) {
      await generateHtmlReport(results, absoluteOutputFolder, config.outputHtml || 'report.html');
    }

    return results; // Return the results array
  } catch (err) {
    console.error('Error processing images:', err);
  }
}

async function generateHtmlReport(results, absoluteOutputFolder, reportFileName) {
  const reportTemplatePath = path.join(__dirname, 'report.tpl.html');
  const reportHtmlPath = path.join(absoluteOutputFolder, reportFileName);

  try {
    const template = await fs.promises.readFile(reportTemplatePath, 'utf-8');
    let entriesHtml = '';

    if (results.length === 0) {
      entriesHtml = '<p class="no-results">No images processed or no palettes extracted.</p>';
    } else {
      for (const item of results) {
        // Ensure image paths are relative to the output directory for the HTML report
        // or use absolute paths if they are outside the project structure (e.g. when using npx in an arbitrary dir)
        let imageDisplayPath = path.relative(path.dirname(reportHtmlPath), path.join(config.imagesFolder, item.imageName));
        // If the image is outside the outputJsonPath's parent, use an absolute path with file:// protocol
        if (imageDisplayPath.startsWith('..')) {
            imageDisplayPath = `file://${path.resolve(config.imagesFolder, item.imageName)}`;
        }

        const colorsHtml = item.colors.map(color => 
          `<div class="palette-color" style="background-color: ${color};" title="${color}">${color}</div>`
        ).join('');
        
        entriesHtml += `
          <div class="report-item">
            <img src="${imageDisplayPath}" alt="${item.imageName}">
            <div class="item-content">
              <h2>${item.imageName}</h2>
              <div class="palette">
                ${colorsHtml}
              </div>
            </div>
          </div>
        `;
      }
    }

    const outputHtml = template.replace('{{{IMAGE_PALETTE_ENTRIES}}}', entriesHtml);
    await fs.promises.writeFile(reportHtmlPath, outputHtml);
    console.log(`HTML report generated at ${reportHtmlPath}`);

  } catch (err) {
    console.error('Failed to generate HTML report:', err);
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

// Dynamically load the user's config if it exists, otherwise use the default config
let userConfigPath = path.join(process.cwd(), 'sucker.config.js');
let config;

// Parse command line arguments for --colors or -c and --report
const args = process.argv.slice(2);
let cliPaletteSize = null;
let reportType = null;

for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--colors' || args[i] === '-c') && args[i + 1]) {
    const numColors = parseInt(args[i + 1], 10);
    if (!isNaN(numColors) && numColors > 0) {
      cliPaletteSize = numColors;
      console.log(`CLI override: paletteSize set to ${cliPaletteSize}`);
    } else {
      console.warn(`Warning: Invalid value provided for --colors. Using config or default paletteSize.`);
    }
    i++; // Skip next argument as it's the value for --colors
  } else if (args[i] === '--report' && args[i + 1]) {
    if (args[i + 1].toLowerCase() === 'html') {
      reportType = 'html';
      console.log('CLI option: HTML report will be generated.');
    } else {
      console.warn(`Warning: Invalid value provided for --report. Supported type: html.`);
    }
    i++; // Skip next argument as it's the value for --report
  }
}

if (existsSync(userConfigPath)) {
  console.log(`Using user-provided config from: ${userConfigPath}`);
  const userConfigModule = await import(userConfigPath);
  config = { ...(userConfigModule.default || userConfigModule) }; // Handle ES module default export

  config.imagesFolder = path.resolve(process.cwd(), config.imagesFolder || '.');
  config.outputFolder = path.resolve(process.cwd(), config.outputFolder || './output');

} else {
  console.log('No user config found. Loading defaults and adjusting paths for current directory.');
  const defaultConfigModule = await import('./sucker.config.js');
  config = { ...defaultConfigModule.default }; // Make a copy to preserve original defaults

  // Override imagesFolder to current working directory
  config.imagesFolder = process.cwd();
  console.log(`  Defaulting imagesFolder to current working directory: ${config.imagesFolder}`);

  config.outputFolder = path.join(process.cwd(), 'output');
  console.log(`  Defaulting outputFolder to: ${config.outputFolder}`);
}

// Override paletteSize if provided via CLI
if (cliPaletteSize !== null) {
  config.paletteSize = cliPaletteSize;
}

config.imagesFolder = path.isAbsolute(config.imagesFolder)
  ? config.imagesFolder
  : path.resolve(process.cwd(), config.imagesFolder || '.');

// Dynamically set the imagesFolder to the current working directory if running with npx
if (process.cwd() !== __dirname) {
  config.imagesFolder = process.cwd();
  console.log(`Using current working directory as images folder: ${config.imagesFolder}`);
}

// Add a log to confirm the script is running
console.log('Color Sucker script started.');

let mainScriptPath;
try {
  // Resolve process.argv[1] to its canonical path, resolving symlinks
  mainScriptPath = fs.realpathSync(process.argv[1]);
} catch (e) {
  // Fallback if realpathSync fails (e.g., path doesn't exist, though unlikely for argv[1])
  mainScriptPath = path.resolve(process.argv[1]);
}

// Convert import.meta.url to a file system path
const modulePath = fileURLToPath(import.meta.url);

const isMain = modulePath === mainScriptPath;

// Ensure processImages is executed when the script is run directly
if (isMain) {
  (async () => {
    try {
      console.log('Executing processImages...');
      const results = await processImages(); // processImages should return results
      console.log('processImages completed successfully.');

    } catch (err) {
      console.error('Error during processImages execution:', err);
    }
  })();
}

// Export the function for use in other modules
export { extractPalette };