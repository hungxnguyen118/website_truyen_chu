import { TruyenFullCrawler } from './Crawler.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeFileName } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);

function printUsage() {
  console.log(`
Usage: node index.js <story-url> [options]

Options:
  --output-dir <dir>     Output directory for saved files (default: ./output)
  --delay <ms>           Delay between requests in milliseconds (default: 1000)
  --start <num>          Start chapter number (optional)
  --end <num>            End chapter number (optional)
  --format <json|txt>    Output format (default: json)
  --resume               Resume crawling, skip already downloaded chapters (default: ON)
  --no-resume            Disable resume mode, crawl all chapters
  --force                Force re-crawl even if chapter already exists
  --help                 Show this help message

Example:
  node index.js https://truyenfull.vision/pham-nhan-tu-tien
  node index.js https://truyenfull.vision/pham-nhan-tu-tien --start 1 --end 10
  node index.js https://truyenfull.vision/pham-nhan-tu-tien --output-dir ./stories --delay 2000
`);
}

/**
 * Save a single chapter immediately
 */
async function saveChapter(chapter, storySlug, outputDir, format = 'json') {
  const sanitizedSlug = sanitizeFileName(storySlug);
  const storyDir = path.join(outputDir, sanitizedSlug);
  const chaptersDir = path.join(storyDir, 'chapters');

  await fs.ensureDir(chaptersDir);

  const chapterFileName = chapter.number
    ? `chapter-${chapter.number.toString().padStart(5, '0')}.${format === 'txt' ? 'txt' : 'json'}`
    : `chapter-${chapter.order.toString().padStart(5, '0')}.${format === 'txt' ? 'txt' : 'json'}`;
  const chapterPath = path.join(chaptersDir, chapterFileName);

  if (format === 'json') {
    await fs.writeJSON(chapterPath, chapter, { encoding: 'utf8' });
  } else {
    const textContent = `${chapter.title}\n\n${chapter.content.text}`;
    await fs.writeFile(chapterPath, textContent, 'utf8');
  }

  return { storySlug: sanitizedSlug, chapterPath };
}

/**
 * Update story.json with all crawled chapters
 */
async function updateStoryJson(storyInfo, allChapters, outputDir) {
  const storySlug = sanitizeFileName(storyInfo.slug);
  const storyDir = path.join(outputDir, storySlug);
  const jsonPath = path.join(storyDir, 'story.json');

  // Sort chapters by number
  const sortedChapters = [...allChapters].sort((a, b) => {
    if (a.number !== null && b.number !== null) {
      return a.number - b.number;
    }
    if (a.number !== null) return -1;
    if (b.number !== null) return 1;
    return (a.order || 0) - (b.order || 0);
  });

  // Create lightweight chapters (exclude content to reduce file size)
  const lightweightChapters = sortedChapters.map(chapter => {
    const { content, ...metadata } = chapter;
    return metadata;
  });

  const data = {
    storyInfo,
    chapters: lightweightChapters
  };

  await fs.writeJSON(jsonPath, data, { encoding: 'utf8' });
}

/**
 * Check if a chapter already exists
 */
async function chapterExists(chapter, storySlug, outputDir, format = 'json') {
  const sanitizedSlug = sanitizeFileName(storySlug);
  const storyDir = path.join(outputDir, sanitizedSlug);
  const chaptersDir = path.join(storyDir, 'chapters');

  if (!await fs.pathExists(chaptersDir)) {
    return false;
  }

  const chapterFileName = chapter.number
    ? `chapter-${chapter.number.toString().padStart(5, '0')}.${format === 'txt' ? 'txt' : 'json'}`
    : `chapter-${chapter.order.toString().padStart(5, '0')}.${format === 'txt' ? 'txt' : 'json'}`;
  const chapterPath = path.join(chaptersDir, chapterFileName);

  return await fs.pathExists(chapterPath);
}

/**
 * Get existing chapters to resume from
 */
async function getExistingChapters(storySlug, outputDir, format = 'json') {
  const storyDir = path.join(outputDir, storySlug);
  const chaptersDir = path.join(storyDir, 'chapters');

  if (!await fs.pathExists(chaptersDir)) {
    return new Set();
  }

  const files = await fs.readdir(chaptersDir);
  const existingChapters = new Set();

  for (const file of files) {
    if (file.endsWith(format === 'txt' ? '.txt' : '.json')) {
      // Extract chapter number from filename
      const match = file.match(/chapter-(\d+)/);
      if (match) {
        existingChapters.add(parseInt(match[1], 10));
      }
    }
  }

  return existingChapters;
}

/**
 * Save story info
 */
async function saveStoryInfo(storyInfo, outputDir) {
  const storySlug = sanitizeFileName(storyInfo.slug);
  const storyDir = path.join(outputDir, storySlug);
  await fs.ensureDir(storyDir);

  const infoPath = path.join(storyDir, 'info.json');
  await fs.writeJSON(infoPath, storyInfo, { encoding: 'utf8' });
}

async function main() {
  // Parse arguments
  if (args.length === 0 || args.includes('--help')) {
    printUsage();
    process.exit(0);
  }

  const storyUrl = args[0];
  if (!storyUrl || !storyUrl.startsWith('http')) {
    console.error('Error: Please provide a valid story URL');
    printUsage();
    process.exit(1);
  }

  // Parse options
  const options = {
    outputDir: './output',
    delay: 1000,
    startChapter: null,
    endChapter: null,
    format: 'json',
    resume: true,  // Default to resume mode (skip existing chapters)
    force: false
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--output-dir' && args[i + 1]) {
      options.outputDir = args[++i];
    } else if (arg === '--delay' && args[i + 1]) {
      options.delay = parseInt(args[++i], 10);
    } else if (arg === '--start' && args[i + 1]) {
      options.startChapter = parseInt(args[++i], 10);
    } else if (arg === '--end' && args[i + 1]) {
      options.endChapter = parseInt(args[++i], 10);
    } else if (arg === '--format' && args[i + 1]) {
      options.format = args[++i];
      if (!['json', 'txt'].includes(options.format)) {
        console.error('Error: Format must be either "json" or "txt"');
        process.exit(1);
      }
    } else if (arg === '--resume') {
      options.resume = true;  // Explicitly enable resume
    } else if (arg === '--no-resume') {
      options.resume = false;  // Disable resume mode
    } else if (arg === '--force') {
      options.force = true;
      options.resume = false;  // Force mode disables resume
    }
  }

  // Create crawler instance
  const crawler = new TruyenFullCrawler({
    delay: options.delay,
    retries: 3,
    timeout: 30000
  });

  try {
    console.log(`\n=== TruyenFull Crawler ===\n`);
    console.log(`Story URL: ${storyUrl}`);
    console.log(`Output directory: ${options.outputDir}`);
    console.log(`Delay: ${options.delay}ms`);
    if (options.startChapter || options.endChapter) {
      console.log(`Chapter range: ${options.startChapter || 'start'} - ${options.endChapter || 'end'}`);
    }
    console.log(`Format: ${options.format}`);
    if (options.force) {
      console.log(`Force mode: ON (will re-crawl existing chapters)`);
    } else {
      console.log(`Resume mode: ON (will skip existing chapters by default)`);
    }
    console.log();

    // Get story info first
    const storyInfo = await crawler.getStoryInfo(storyUrl);
    await saveStoryInfo(storyInfo, options.outputDir);

    // Always check for existing chapters (unless force mode)
    let existingChapters = new Set();
    const allCrawledChapters = [];

    if (!options.force) {
      existingChapters = await getExistingChapters(storyInfo.slug, options.outputDir, options.format);
      if (existingChapters.size > 0) {
        if (options.resume) {
          console.log(`Found ${existingChapters.size} existing chapters. Will skip them.`);
        } else {
          console.log(`Found ${existingChapters.size} existing chapters. Use --resume to skip them, or --force to re-crawl.`);
        }

        // Load existing chapters into allCrawledChapters for complete story.json
        const storyDir = path.join(options.outputDir, storyInfo.slug);
        const chaptersDir = path.join(storyDir, 'chapters');
        if (await fs.pathExists(chaptersDir)) {
          const files = await fs.readdir(chaptersDir);
          const chapterFiles = files
            .filter(f => f.endsWith(options.format === 'txt' ? '.txt' : '.json'))
            .sort();

          for (const file of chapterFiles) {
            const filePath = path.join(chaptersDir, file);
            if (options.format === 'json') {
              try {
                const chapter = await fs.readJSON(filePath);
                allCrawledChapters.push(chapter);
              } catch (error) {
                // Skip corrupted files
                console.log(`Warning: Could not load ${file}, skipping...`);
              }
            }
          }

          if (allCrawledChapters.length > 0) {
            console.log(`Loaded ${allCrawledChapters.length} existing chapters into memory.`);
          }
        }
        console.log();
      }
    } else {
      console.log(`Force mode: Will re-crawl all chapters even if they exist.\n`);
    }

    let savedCount = 0;
    let skippedCount = 0;

    // Progress callback with incremental saving
    const onChapterCrawled = async (chapter) => {
      // Check if chapter exists and should be skipped
      if (!options.force && existingChapters.has(chapter.number)) {
        skippedCount++;
        console.log(`  ⏭️  Skipped (already exists): Chapter ${chapter.number} - ${chapter.title}`);
        // Still add to allCrawledChapters for story.json (use existing data if available)
        const existingChapter = allCrawledChapters.find(ch => ch.number === chapter.number);
        if (!existingChapter) {
          allCrawledChapters.push(chapter);
        }
        // Update story.json to ensure it's current
        await updateStoryJson(storyInfo, allCrawledChapters, options.outputDir);
        return;
      }

      // Save chapter immediately
      try {
        await saveChapter(chapter, storyInfo.slug, options.outputDir, options.format);
        savedCount++;
        console.log(`  ✓ Saved: Chapter ${chapter.number || 'N/A'} - ${chapter.title}`);

        // Update story.json incrementally
        allCrawledChapters.push(chapter);
        await updateStoryJson(storyInfo, allCrawledChapters, options.outputDir);
      } catch (error) {
        console.error(`  ✗ Error saving chapter: ${error.message}`);
      }
    };

    // Progress callback
    const onProgress = ({ current, total, chapter }) => {
      const percentage = ((current / total) * 100).toFixed(1);
      process.stdout.write(`\rProgress: ${current}/${total} (${percentage}%) - ${chapter.title}`);
    };

    // Error logging callback
    const onError = async (errorInfo) => {
      const storyDir = path.join(options.outputDir, storyInfo.slug);
      const errorLogPath = path.join(storyDir, 'errors.log');

      const logEntry = `[${errorInfo.timestamp}] Chapter ${errorInfo.chapter.number || 'N/A'} - ${errorInfo.chapter.title}: ${errorInfo.error}\n`;

      await fs.ensureDir(storyDir);
      await fs.appendFile(errorLogPath, logEntry, 'utf8');
    };

    // Crawl the story
    const result = await crawler.crawlStory(storyUrl, {
      startChapter: options.startChapter,
      endChapter: options.endChapter,
      onProgress,
      onChapterCrawled,
      onError,
      existingChapters: !options.force ? existingChapters : null
    });

    console.log('\n\nCrawling completed!');
    console.log(`Total chapters crawled: ${result.chapters.length}`);
    console.log(`Chapters saved: ${savedCount}`);

    // Get final count of skipped chapters
    const finalExistingChapters = await getExistingChapters(storyInfo.slug, options.outputDir, options.format);
    const totalChapters = result.chapters.length + (finalExistingChapters.size - allCrawledChapters.length);
    const totalSkipped = finalExistingChapters.size - savedCount;

    if (totalSkipped > 0) {
      console.log(`Chapters skipped (already existed): ${totalSkipped}`);
    }

    console.log('\nDone!');
  } catch (error) {
    console.error('\nError:', error.message);
    process.exit(1);
  }
}

main();

