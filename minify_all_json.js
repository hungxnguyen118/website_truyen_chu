import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputDir = path.join(__dirname, 'output');

async function minifyAllJsonFiles() {
    console.log('🔍 Scanning for JSON files to minify...\n');

    const directories = await fs.readdir(outputDir);
    let processedCount = 0;
    let totalSizeSaved = 0;

    for (const dir of directories) {
        const storyDir = path.join(outputDir, dir);
        const stat = await fs.stat(storyDir);

        if (!stat.isDirectory()) continue;

        console.log(`📁 Processing: ${dir}`);

        // Process all JSON files in this directory
        const files = await fs.readdir(storyDir, { recursive: true });

        for (const file of files) {
            if (!file.endsWith('.json')) continue;

            const filePath = path.join(storyDir, file);

            try {
                // Get original file size
                const stats = await fs.stat(filePath);
                const originalSize = stats.size;

                // Read and re-write in minified format
                const data = await fs.readJSON(filePath);
                await fs.writeJSON(filePath, data, { encoding: 'utf8' });

                // Get new file size
                const newStats = await fs.stat(filePath);
                const newSize = newStats.size;
                const saved = originalSize - newSize;

                if (saved > 0) {
                    totalSizeSaved += saved;
                    processedCount++;
                }
            } catch (error) {
                console.error(`  ✗ Error processing ${file}: ${error.message}`);
            }
        }

        console.log(`  ✓ Completed ${dir}\n`);
    }

    console.log(`\n✅ Complete!`);
    console.log(`Processed: ${processedCount} files`);
    console.log(`Total space saved: ${(totalSizeSaved / 1024 / 1024).toFixed(2)} MB`);
}

minifyAllJsonFiles();
