import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);

function printUsage() {
  console.log(`
Usage: node check.js <story-slug> [options]

Options:
  --format <json|txt>    Check format (default: json)
  --output-dir <dir>     Output directory (default: ./output)

Examples:
  node check.js pham-nhan-tu-tien
  node check.js pham-nhan-tu-tien --format txt
`);
}

async function checkChapters(storySlug, outputDir = './output', format = 'json') {
  const storyDir = path.join(__dirname, outputDir, storySlug);
  const chaptersDir = path.join(storyDir, 'chapters');
  const infoPath = path.join(storyDir, 'info.json');
  
  console.log(`\n=== Chapter Status Check ===\n`);
  console.log(`Story: ${storySlug}`);
  console.log(`Directory: ${storyDir}\n`);
  
  // Check if story directory exists
  if (!await fs.pathExists(storyDir)) {
    console.log(`❌ Story directory not found.`);
    console.log(`   This story hasn't been crawled yet.`);
    return;
  }
  
  // Get story info
  let storyInfo = null;
  if (await fs.pathExists(infoPath)) {
    try {
      storyInfo = await fs.readJSON(infoPath);
      console.log(`📖 Story: ${storyInfo.title}`);
      console.log(`📄 Total pages: ${storyInfo.totalPages}`);
    } catch (error) {
      console.log(`⚠️  Could not read story info: ${error.message}`);
    }
  }
  
  // Check chapters directory
  if (!await fs.pathExists(chaptersDir)) {
    console.log(`\n❌ No chapters directory found.`);
    console.log(`   This story hasn't been crawled yet.`);
    return;
  }
  
  const files = await fs.readdir(chaptersDir);
  const chapterFiles = files
    .filter(f => f.endsWith(format === 'txt' ? '.txt' : '.json'))
    .sort();
  
  if (chapterFiles.length === 0) {
    console.log(`\n❌ No chapters found in ${format.toUpperCase()} format.`);
    return;
  }
  
  console.log(`\n✅ Found ${chapterFiles.length} chapters\n`);
  
  // Extract chapter numbers
  const chapterNumbers = new Set();
  const chapterDetails = [];
  
  for (const file of chapterFiles) {
    const match = file.match(/chapter-(\d+)/);
    if (match) {
      const chapterNum = parseInt(match[1], 10);
      chapterNumbers.add(chapterNum);
      
      const filePath = path.join(chaptersDir, file);
      const stats = await fs.stat(filePath);
      const sizeKB = (stats.size / 1024).toFixed(2);
      
      let title = `Chapter ${chapterNum}`;
      if (format === 'json') {
        try {
          const chapter = await fs.readJSON(filePath);
          title = chapter.title || title;
        } catch (error) {
          // Skip if can't read
        }
      }
      
      chapterDetails.push({
        number: chapterNum,
        title,
        file,
        size: sizeKB
      });
    }
  }
  
  // Sort by chapter number
  chapterDetails.sort((a, b) => a.number - b.number);
  
  // Display summary
  if (chapterDetails.length > 0) {
    const minChapter = Math.min(...chapterDetails.map(ch => ch.number));
    const maxChapter = Math.max(...chapterDetails.map(ch => ch.number));
    
    console.log(`📊 Summary:`);
    console.log(`   First chapter: ${minChapter}`);
    console.log(`   Last chapter: ${maxChapter}`);
    console.log(`   Total chapters: ${chapterDetails.length}`);
    
    // Check for gaps
    const gaps = [];
    for (let i = minChapter; i <= maxChapter; i++) {
      if (!chapterNumbers.has(i)) {
        gaps.push(i);
      }
    }
    
    if (gaps.length > 0) {
      console.log(`\n⚠️  Missing chapters: ${gaps.length}`);
      if (gaps.length <= 20) {
        console.log(`   Chapters: ${gaps.join(', ')}`);
      } else {
        console.log(`   First 20 missing: ${gaps.slice(0, 20).join(', ')}...`);
        console.log(`   (and ${gaps.length - 20} more)`);
      }
    } else {
      console.log(`\n✅ No gaps found! All chapters from ${minChapter} to ${maxChapter} are present.`);
    }
    
    // Show first and last few chapters
    console.log(`\n📚 Chapters (showing first 5 and last 5):`);
    const showCount = 5;
    for (let i = 0; i < Math.min(showCount, chapterDetails.length); i++) {
      const ch = chapterDetails[i];
      console.log(`   ${ch.number.toString().padStart(5, '0')}: ${ch.title} (${ch.size} KB)`);
    }
    if (chapterDetails.length > showCount * 2) {
      console.log(`   ... (${chapterDetails.length - showCount * 2} more chapters) ...`);
    }
    for (let i = Math.max(showCount, chapterDetails.length - showCount); i < chapterDetails.length; i++) {
      const ch = chapterDetails[i];
      console.log(`   ${ch.number.toString().padStart(5, '0')}: ${ch.title} (${ch.size} KB)`);
    }
  }
  
  console.log();
}

async function main() {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }
  
  const storySlug = args[0];
  let outputDir = './output';
  let format = 'json';
  
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--output-dir' && args[i + 1]) {
      outputDir = args[++i];
    } else if (arg === '--format' && args[i + 1]) {
      format = args[++i];
      if (!['json', 'txt'].includes(format)) {
        console.error('Error: Format must be either "json" or "txt"');
        process.exit(1);
      }
    }
  }
  
  try {
    await checkChapters(storySlug, outputDir, format);
  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  }
}

main();

