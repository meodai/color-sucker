import { extractPalette } from './index.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name correctly in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the example image
const imagePath = path.join(__dirname, 'libs/art-palette/palette-extraction/palette_demo_example.jpg');

async function runTest() {
  try {
    console.log('Extracting palette from image:', imagePath);
    
    // Extract palette with 6 colors
    const palette = await extractPalette({
      imagePath,
      paletteSize: 6
    });
    
    console.log('Successfully extracted palette:');
    console.log(palette);
    
    // Display the colors in a more visual way in the terminal
    const colorBlocks = palette.map(color => {
      return `\x1b[48;2;${parseInt(color.slice(1, 3), 16)};${parseInt(color.slice(3, 5), 16)};${parseInt(color.slice(5, 7), 16)}m     \x1b[0m ${color}`;
    });
    
    console.log('\nColor palette:');
    colorBlocks.forEach(block => console.log(block));
    
  } catch (err) {
    console.error('Test failed:', err);
  }
}

runTest();
