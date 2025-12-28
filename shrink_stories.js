import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputDir = path.join(__dirname, 'output');

async function shrinkStoryFiles() {
    console.log('🔍 Scanning for story.json files...\n');

    const directories = await fs.readdir(outputDir);
    let processedCount = 0;
    let totalSizeSaved = 0;

    for (const dir of directories) {
        const storyDir = path.join(outputDir, dir);
        const storyJsonPath = path.join(storyDir, 'story.json');

        // Check if story.json exists
        if (!await fs.pathExists(storyJsonPath)) {
            continue;
        }

        try {
            // Get original file size
            const stats = await fs.stat(storyJsonPath);
            const originalSize = stats.size;

            // Read the story.json
            const data = await fs.readJSON(storyJsonPath);

            // Check if chapters have content field
            if (data.chapters && data.chapters.length > 0 && data.chapters[0].content) {
                // Strip content from all chapters
                const lightweightChapters = data.chapters.map(chapter => {
                    const { content, ...metadata } = chapter;
                    return metadata;
                });

                // Write back the optimized version
                await fs.writeJSON(storyJsonPath, {
                    ...data,
                    chapters: lightweightChapters
                }, { encoding: 'utf8' });

                // Get new file size
                const newStats = await fs.stat(storyJsonPath);
                const newSize = newStats.size;
                const saved = originalSize - newSize;
                totalSizeSaved += saved;

                console.log(`✓ ${dir}`);
                console.log(`  Original: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
                console.log(`  New: ${(newSize / 1024 / 1024).toFixed(2)} MB`);
                console.log(`  Saved: ${(saved / 1024 / 1024).toFixed(2)} MB\n`);

                processedCount++;
            }
        } catch (error) {
            console.error(`✗ Error processing ${dir}: ${error.message}`);
        }
    }

    console.log(`\n✅ Complete!`);
    console.log(`Processed: ${processedCount} files`);
    console.log(`Total space saved: ${(totalSizeSaved / 1024 / 1024).toFixed(2)} MB`);
}

shrinkStoryFiles();
