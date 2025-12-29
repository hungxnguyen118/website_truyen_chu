import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { TruyenFullCrawler } from './Crawler.js';
import { sanitizeFileName } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputDir = path.join(__dirname, 'output');

/**
 * Save a single chapter
 */
async function saveChapter(chapter, storySlug, outputDir) {
    const sanitizedSlug = sanitizeFileName(storySlug);
    const storyDir = path.join(outputDir, sanitizedSlug);
    const chaptersDir = path.join(storyDir, 'chapters');

    await fs.ensureDir(chaptersDir);

    const chapterFileName = `chapter-${chapter.number.toString().padStart(5, '0')}.json`;
    const chapterPath = path.join(chaptersDir, chapterFileName);

    await fs.writeJSON(chapterPath, chapter, { encoding: 'utf8' });
    return chapterPath;
}

/**
 * Update story.json with new chapter metadata
 */
async function updateStoryJson(storySlug, newChapters, outputDir) {
    const sanitizedSlug = sanitizeFileName(storySlug);
    const storyDir = path.join(outputDir, sanitizedSlug);
    const storyJsonPath = path.join(storyDir, 'story.json');

    // Read existing story.json
    const storyData = await fs.readJSON(storyJsonPath);

    // Get existing chapter numbers
    const existingChapterNumbers = new Set(
        storyData.chapters.map(ch => ch.number)
    );

    // Add new chapters (without content field)
    for (const chapter of newChapters) {
        if (!existingChapterNumbers.has(chapter.number)) {
            // Remove content field to keep story.json small
            const { content, ...chapterMeta } = chapter;
            storyData.chapters.push(chapterMeta);
        }
    }

    // Sort chapters by number
    storyData.chapters.sort((a, b) => a.number - b.number);

    // Save updated story.json (minified)
    await fs.writeJSON(storyJsonPath, storyData, { encoding: 'utf8' });
}

/**
 * Construct chapter URL from story URL and chapter number
 */
function constructChapterUrl(storyUrl, chapterNumber) {
    // Remove trailing slash if present
    const baseUrl = storyUrl.replace(/\/$/, '');
    // Construct chapter URL: https://truyenfull.vision/story-name/chuong-123/
    return `${baseUrl}/chuong-${chapterNumber}/`;
}

/**
 * Retry missing chapters for a specific story
 */
async function retryStory(storyName, missingChapters, storyUrl) {
    console.log(`\n📖 Retrying: ${storyName}`);
    console.log(`   Missing: ${missingChapters.length} chapters`);
    console.log(`   Story URL: ${storyUrl}\n`);

    const crawler = new TruyenFullCrawler({
        delay: 1000,
        retries: 3,
        timeout: 30000
    });

    const storyDir = path.join(outputDir, storyName);
    const errorLogPath = path.join(storyDir, 'retry_errors.log');

    let successCount = 0;
    let failCount = 0;
    const successfulChapters = [];

    for (let i = 0; i < missingChapters.length; i++) {
        const chapter = missingChapters[i];

        // Construct chapter URL if not provided
        const chapterUrl = chapter.url || constructChapterUrl(storyUrl, chapter.number);

        console.log(`[${i + 1}/${missingChapters.length}] Crawling Chapter ${chapter.number}: ${chapter.title}`);
        console.log(`  URL: ${chapterUrl}`);

        try {
            const chapterContent = await crawler.getChapterContent(chapterUrl);
            await saveChapter(chapterContent, storyName, outputDir);
            successfulChapters.push(chapterContent);
            successCount++;
            console.log(`  ✓ Saved`);
        } catch (error) {
            failCount++;
            console.error(`  ✗ Failed: ${error.message}`);

            // Log error
            const logEntry = `[${new Date().toISOString()}] Chapter ${chapter.number} - ${chapter.title} (${chapterUrl}): ${error.message}\n`;
            await fs.appendFile(errorLogPath, logEntry, 'utf8');
        }

        // Delay between requests
        if (i < missingChapters.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    // Update story.json with successful chapters
    if (successfulChapters.length > 0) {
        console.log(`\n📝 Updating story.json...`);
        await updateStoryJson(storyName, successfulChapters, outputDir);
        console.log(`  ✓ Added ${successfulChapters.length} chapters to story.json`);
    }

    // Clean up if all chapters succeeded
    if (failCount === 0 && successCount > 0) {
        console.log(`\n🧹 Cleaning up...`);

        // Remove error log if it exists
        if (await fs.pathExists(errorLogPath)) {
            await fs.remove(errorLogPath);
            console.log(`  ✓ Removed error log`);
        }
    }

    console.log(`\n✅ ${storyName} complete:`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Failed: ${failCount}`);

    return { successCount, failCount, storyName };
}

/**
 * Update missing chapters report
 */
async function updateMissingReport(storyName, reportPath) {
    const missingByStory = await fs.readJSON(reportPath);

    // Remove the story from the report
    delete missingByStory[storyName];

    // Save updated report
    if (Object.keys(missingByStory).length > 0) {
        await fs.writeJSON(reportPath, missingByStory, { spaces: 2 });
        console.log(`\n📝 Updated missing chapters report`);
    } else {
        // No more missing chapters, remove the report file
        await fs.remove(reportPath);
        console.log(`\n🎉 All missing chapters recovered! Removed report file.`);
    }
}

/**
 * Get story URL from story.json
 */
async function getStoryUrl(storyName) {
    const storyJsonPath = path.join(outputDir, storyName, 'story.json');

    if (!await fs.pathExists(storyJsonPath)) {
        return null;
    }

    const storyData = await fs.readJSON(storyJsonPath);
    return storyData.storyInfo?.url || null;
}

/**
 * Main retry function
 */
async function retryMissingChapters() {
    console.log('🔄 Starting retry for missing chapters...\n');

    // Read the missing chapters report
    const reportPath = path.join(outputDir, 'missing_chapters_report.json');

    if (!await fs.pathExists(reportPath)) {
        console.error('❌ No missing_chapters_report.json found. Run detect_missing.js first.');
        process.exit(1);
    }

    const missingByStory = await fs.readJSON(reportPath);
    const storyNames = Object.keys(missingByStory);

    if (storyNames.length === 0) {
        console.log('✅ No missing chapters to retry!');
        return;
    }

    console.log(`Found ${storyNames.length} stories with missing chapters:\n`);
    storyNames.forEach((name, idx) => {
        console.log(`${idx + 1}. ${name} (${missingByStory[name].length} chapters)`);
    });

    // Check if story name and URL provided
    const args = process.argv.slice(2);

    // Support 'all' command to retry all stories
    if (args.length === 1 && args[0].toLowerCase() === 'all') {
        console.log('\n🔄 Retrying all stories...\n');

        let totalSuccess = 0;
        let totalFailed = 0;

        for (const storyName of storyNames) {
            const storyUrl = await getStoryUrl(storyName);

            if (!storyUrl) {
                console.error(`\n❌ Could not find URL for ${storyName} in story.json, skipping...`);
                continue;
            }

            const result = await retryStory(storyName, missingByStory[storyName], storyUrl);
            totalSuccess += result.successCount;
            totalFailed += result.failCount;

            // Update the missing chapters report if all chapters succeeded
            if (result.failCount === 0 && result.successCount > 0) {
                await updateMissingReport(storyName, reportPath);
            }

            // Small delay between stories
            if (storyNames.indexOf(storyName) < storyNames.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        console.log(`\n\n🎉 All stories complete!`);
        console.log(`   Total Success: ${totalSuccess}`);
        console.log(`   Total Failed: ${totalFailed}`);
        return;
    }

    // Single story mode
    console.log('\n⚠️  Usage:');
    console.log('  Retry all stories:        node retry_failed.js all');
    console.log('  Retry specific story:     node retry_failed.js <story-name> [story-url]');
    console.log('\nExamples:');
    console.log('  node retry_failed.js all');
    console.log('  node retry_failed.js the-gioi-hoan-my');
    console.log('  node retry_failed.js the-gioi-hoan-my https://truyenfull.vision/the-gioi-hoan-my\n');

    if (args.length < 1) {
        console.log('💡 Provide "all" to retry all stories, or a story name to retry a specific story.');
        process.exit(0);
    }

    const targetStory = args[0];
    let storyUrl = args[1];

    if (!missingByStory[targetStory]) {
        console.error(`❌ Story "${targetStory}" not found in missing chapters report.`);
        process.exit(1);
    }

    // Try to get URL from story.json if not provided
    if (!storyUrl) {
        storyUrl = await getStoryUrl(targetStory);
        if (!storyUrl) {
            console.error(`❌ Could not find URL for ${targetStory} in story.json.`);
            console.error(`   Please provide the URL manually:`);
            console.error(`   node retry_failed.js ${targetStory} <story-url>`);
            process.exit(1);
        }
        console.log(`📍 Found story URL: ${storyUrl}\n`);
    }

    const result = await retryStory(targetStory, missingByStory[targetStory], storyUrl);

    // Update the missing chapters report if all chapters succeeded
    if (result.failCount === 0 && result.successCount > 0) {
        await updateMissingReport(targetStory, reportPath);
    }
}

retryMissingChapters();
