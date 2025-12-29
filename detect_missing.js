import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputDir = path.join(__dirname, 'output');

async function detectMissingChapters() {
    console.log('🔍 Scanning for missing chapters...\n');

    const directories = await fs.readdir(outputDir);
    let totalMissing = 0;
    const missingByStory = {};

    for (const dir of directories) {
        const storyDir = path.join(outputDir, dir);
        const stat = await fs.stat(storyDir);

        if (!stat.isDirectory()) continue;

        const storyJsonPath = path.join(storyDir, 'story.json');
        const chaptersDir = path.join(storyDir, 'chapters');

        // Check if story.json exists
        if (!await fs.pathExists(storyJsonPath)) {
            console.log(`⚠️  ${dir}: No story.json found, skipping...`);
            continue;
        }

        // Check if chapters directory exists
        if (!await fs.pathExists(chaptersDir)) {
            console.log(`⚠️  ${dir}: No chapters directory found, skipping...`);
            continue;
        }

        try {
            // Read story.json to get expected chapters
            const storyData = await fs.readJSON(storyJsonPath);
            const expectedChapters = storyData.chapters || [];

            if (expectedChapters.length === 0) {
                console.log(`⚠️  ${dir}: No chapters listed in story.json, skipping...`);
                continue;
            }

            // Get actual chapter files
            const files = await fs.readdir(chaptersDir);
            const existingChapterNumbers = new Set();

            for (const file of files) {
                if (file.endsWith('.json')) {
                    const match = file.match(/chapter-(\d+)\.json/);
                    if (match) {
                        existingChapterNumbers.add(parseInt(match[1], 10));
                    }
                }
            }

            // Find the max chapter number to check for gaps
            const maxChapter = Math.max(...expectedChapters.map(ch => ch.number || 0));

            // Find missing chapters - check all numbers from 1 to max
            const missing = [];
            const missingNumbers = [];

            for (let i = 1; i <= maxChapter; i++) {
                if (!existingChapterNumbers.has(i)) {
                    // Find the chapter info from story.json
                    const chapterInfo = expectedChapters.find(ch => ch.number === i);
                    if (chapterInfo) {
                        missing.push(chapterInfo);
                        missingNumbers.push(i);
                    } else {
                        // Chapter not in story.json but missing from sequence
                        missing.push({ number: i, title: 'Unknown', url: '' });
                        missingNumbers.push(i);
                    }
                }
            }

            if (missing.length > 0) {
                console.log(`📁 ${dir}:`);
                console.log(`   Expected: ${maxChapter} chapters (1-${maxChapter})`);
                console.log(`   Found: ${existingChapterNumbers.size} chapters`);
                console.log(`   Missing: ${missing.length} chapters`);

                // Show first 20 missing chapter numbers
                const showCount = Math.min(20, missingNumbers.length);
                const missingStr = missingNumbers.slice(0, showCount).join(', ');
                console.log(`   Missing numbers: ${missingStr}${missingNumbers.length > showCount ? ` ... and ${missingNumbers.length - showCount} more` : ''}`);
                console.log();

                missingByStory[dir] = missing;
                totalMissing += missing.length;
            } else {
                console.log(`✓ ${dir}: All ${maxChapter} chapters present (1-${maxChapter})`);
            }
        } catch (error) {
            console.error(`✗ Error processing ${dir}: ${error.message}`);
        }
    }

    console.log(`\n✅ Scan complete!`);
    console.log(`Total missing chapters: ${totalMissing}`);

    // Save missing chapters report
    if (totalMissing > 0) {
        const reportPath = path.join(outputDir, 'missing_chapters_report.json');
        await fs.writeJSON(reportPath, missingByStory, { spaces: 2 });
        console.log(`\n📄 Detailed report saved to: ${reportPath}`);
    }
}

detectMissingChapters();
