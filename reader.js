import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);

function printUsage() {
  console.log(`
Usage: node reader.js <command> [options]

Commands:
  list <story-slug>              List all chapters for a story
  read <story-slug> <chapter>    Read a specific chapter (by number or filename)
  info <story-slug>              Show story information
  export <story-slug> [format]   Export story to text/HTML format

Examples:
  node reader.js list pham-nhan-tu-tien
  node reader.js read pham-nhan-tu-tien 1
  node reader.js read pham-nhan-tu-tien chapter-00001.json
  node reader.js info pham-nhan-tu-tien
  node reader.js export pham-nhan-tu-tien txt
`);
}

async function listChapters(storySlug) {
  const outputDir = path.join(__dirname, 'output', storySlug);
  const chaptersDir = path.join(outputDir, 'chapters');
  
  if (!await fs.pathExists(chaptersDir)) {
    console.error(`Error: Story "${storySlug}" not found in output directory`);
    process.exit(1);
  }
  
  const files = await fs.readdir(chaptersDir);
  const chapterFiles = files
    .filter(f => f.endsWith('.json'))
    .sort();
  
  console.log(`\n=== Chapters for "${storySlug}" ===\n`);
  console.log(`Total chapters: ${chapterFiles.length}\n`);
  
  for (const file of chapterFiles) {
    const filePath = path.join(chaptersDir, file);
    const chapter = await fs.readJSON(filePath);
    console.log(`${file.padEnd(25)} - ${chapter.title}`);
  }
}

async function readChapter(storySlug, chapterIdentifier) {
  const outputDir = path.join(__dirname, 'output', storySlug);
  const chaptersDir = path.join(outputDir, 'chapters');
  
  if (!await fs.pathExists(chaptersDir)) {
    console.error(`Error: Story "${storySlug}" not found in output directory`);
    process.exit(1);
  }
  
  let chapterPath;
  
  // Check if it's a filename or chapter number
  if (chapterIdentifier.endsWith('.json')) {
    chapterPath = path.join(chaptersDir, chapterIdentifier);
  } else {
    // Try to find by chapter number
    const chapterNum = parseInt(chapterIdentifier, 10);
    const filename = `chapter-${chapterNum.toString().padStart(5, '0')}.json`;
    chapterPath = path.join(chaptersDir, filename);
  }
  
  if (!await fs.pathExists(chapterPath)) {
    console.error(`Error: Chapter not found: ${chapterIdentifier}`);
    process.exit(1);
  }
  
  const chapter = await fs.readJSON(chapterPath);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Chapter ${chapter.number || 'N/A'}: ${chapter.title}`);
  console.log(`URL: ${chapter.url}`);
  console.log(`${'='.repeat(60)}\n`);
  console.log(chapter.content.text);
  console.log(`\n${'='.repeat(60)}\n`);
}

async function showInfo(storySlug) {
  const outputDir = path.join(__dirname, 'output', storySlug);
  const infoPath = path.join(outputDir, 'info.json');
  
  if (!await fs.pathExists(infoPath)) {
    console.error(`Error: Story "${storySlug}" not found in output directory`);
    process.exit(1);
  }
  
  const info = await fs.readJSON(infoPath);
  const chaptersDir = path.join(outputDir, 'chapters');
  const chapterCount = await fs.pathExists(chaptersDir) 
    ? (await fs.readdir(chaptersDir)).filter(f => f.endsWith('.json')).length
    : 0;
  
  console.log(`\n=== Story Information ===\n`);
  console.log(`Title: ${info.title}`);
  console.log(`Slug: ${info.slug}`);
  console.log(`URL: ${info.url}`);
  console.log(`Total Pages: ${info.totalPages}`);
  console.log(`Chapters Crawled: ${chapterCount}`);
  console.log();
}

async function exportStory(storySlug, format = 'txt') {
  const outputDir = path.join(__dirname, 'output', storySlug);
  const chaptersDir = path.join(outputDir, 'chapters');
  const storyPath = path.join(outputDir, 'story.json');
  
  if (!await fs.pathExists(storyPath)) {
    console.error(`Error: Story "${storySlug}" not found in output directory`);
    process.exit(1);
  }
  
  const story = await fs.readJSON(storyPath);
  const exportDir = path.join(outputDir, 'export');
  await fs.ensureDir(exportDir);
  
  if (format === 'txt') {
    const txtPath = path.join(exportDir, `${storySlug}.txt`);
    let content = `${story.storyInfo.title}\n`;
    content += `${'='.repeat(60)}\n\n`;
    
    for (const chapter of story.chapters) {
      content += `\n${'='.repeat(60)}\n`;
      content += `Chapter ${chapter.number || 'N/A'}: ${chapter.title}\n`;
      content += `${'='.repeat(60)}\n\n`;
      content += chapter.content.text;
      content += `\n\n`;
    }
    
    await fs.writeFile(txtPath, content, 'utf8');
    console.log(`\nExported to: ${txtPath}`);
  } else if (format === 'html') {
    const htmlPath = path.join(exportDir, `${storySlug}.html`);
    let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${story.storyInfo.title}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
    h1 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; }
    .chapter { margin: 40px 0; }
    .chapter-title { color: #666; font-size: 1.2em; margin-bottom: 20px; }
    .chapter-content { text-align: justify; }
  </style>
</head>
<body>
  <h1>${story.storyInfo.title}</h1>
`;
    
    for (const chapter of story.chapters) {
      html += `  <div class="chapter">
    <div class="chapter-title">Chapter ${chapter.number || 'N/A'}: ${chapter.title}</div>
    <div class="chapter-content">${chapter.content.html.replace(/\n/g, '<br>')}</div>
  </div>\n`;
    }
    
    html += `</body>
</html>`;
    
    await fs.writeFile(htmlPath, html, 'utf8');
    console.log(`\nExported to: ${htmlPath}`);
  } else {
    console.error(`Error: Unsupported format "${format}". Use "txt" or "html".`);
    process.exit(1);
  }
}

async function main() {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }
  
  const command = args[0];
  
  try {
    switch (command) {
      case 'list':
        if (args.length < 2) {
          console.error('Error: Please provide a story slug');
          printUsage();
          process.exit(1);
        }
        await listChapters(args[1]);
        break;
        
      case 'read':
        if (args.length < 3) {
          console.error('Error: Please provide a story slug and chapter identifier');
          printUsage();
          process.exit(1);
        }
        await readChapter(args[1], args[2]);
        break;
        
      case 'info':
        if (args.length < 2) {
          console.error('Error: Please provide a story slug');
          printUsage();
          process.exit(1);
        }
        await showInfo(args[1]);
        break;
        
      case 'export':
        if (args.length < 2) {
          console.error('Error: Please provide a story slug');
          printUsage();
          process.exit(1);
        }
        const format = args[2] || 'txt';
        await exportStory(args[1], format);
        break;
        
      default:
        console.error(`Error: Unknown command "${command}"`);
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();

