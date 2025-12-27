# TruyenFull Vision Crawler

A Node.js tool to crawl story content from truyenfull.vision website with a web interface for reading and tracking progress.

## Installation

1. Install dependencies:
```bash
npm install
```

## Web Reader Interface

Start the web server to read stories in your browser:

```bash
npm run server
# or
node server.js
```

Then open your browser and go to: **http://localhost:3000**

### Features:
- 📚 Browse all crawled stories
- 📖 Read chapters in a clean interface
- ✅ Mark chapters as read (progress is saved)
- 🔍 See which chapters you've already read (highlighted in green)
- ⌨️ Keyboard shortcuts: Arrow keys to navigate chapters
- 📱 Responsive design (works on mobile)

### How it works:
- Progress is saved automatically in `output/<story-slug>/progress.json`
- Your reading position is remembered
- Chapters marked as read are highlighted in the chapter list

## Usage

### Basic Usage

Crawl all chapters of a story:
```bash
node index.js https://truyenfull.vision/pham-nhan-tu-tien
```

### Options

- `--output-dir <dir>`: Specify output directory (default: `./output`)
- `--delay <ms>`: Delay between requests in milliseconds (default: 1000)
- `--start <num>`: Start chapter number (optional)
- `--end <num>`: End chapter number (optional)
- `--format <json|txt>`: Output format (default: `json`)
- `--resume`: Resume crawling, skip already downloaded chapters (default: enabled)
- `--no-resume`: Disable resume mode, crawl all chapters even if they exist
- `--force`: Force re-crawl even if chapter already exists
- `--help`: Show help message

### Examples

Crawl specific chapter range:
```bash
node index.js https://truyenfull.vision/pham-nhan-tu-tien --start 1 --end 10
```

Crawl with custom output directory and delay:
```bash
node index.js https://truyenfull.vision/pham-nhan-tu-tien --output-dir ./stories --delay 2000
```

Save as text files:
```bash
node index.js https://truyenfull.vision/pham-nhan-tu-tien --format txt
```

By default, the crawler automatically skips existing chapters (resume mode is ON).

To disable resume mode and crawl all chapters:
```bash
node index.js https://truyenfull.vision/pham-nhan-tu-tien --no-resume
```

Force re-crawl all chapters (even if they exist):
```bash
node index.js https://truyenfull.vision/pham-nhan-tu-tien --force
```

## Output Structure

When using JSON format, the output will be organized as:
```
output/
  └── story-slug/
      ├── info.json          # Story information
      ├── story.json         # Complete story with all chapters
      └── chapters/
          ├── chapter-00001.json
          ├── chapter-00002.json
          └── ...
```

When using TXT format:
```
output/
  └── story-slug/
      ├── info.json          # Story information
      └── chapters/
          ├── chapter-00001.txt
          ├── chapter-00002.txt
          └── ...
```

## Features

- ✅ **Incremental saving** - Chapters are saved immediately as they are crawled
- ✅ **Resume capability** - Skip already downloaded chapters with `--resume`
- ✅ Automatic pagination handling
- ✅ Chapter list extraction
- ✅ Chapter content extraction (title and body)
- ✅ Error handling with retry logic
- ✅ Rate limiting with configurable delays
- ✅ Real-time progress tracking
- ✅ Multiple output formats (JSON, TXT)
- ✅ Chapter range filtering

## Check Crawled Chapters

Check which chapters have already been crawled:

```bash
node check.js pham-nhan-tu-tien
```

This will show:
- Total chapters downloaded
- First and last chapter numbers
- Missing chapters (gaps)
- Chapter details

## Reading Output Files

After crawling, you can read the output files using the included reader tool:

### List all chapters:
```bash
node reader.js list pham-nhan-tu-tien
```

### Read a specific chapter:
```bash
# By chapter number
node reader.js read pham-nhan-tu-tien 1

# By filename
node reader.js read pham-nhan-tu-tien chapter-00001.json
```

### Show story information:
```bash
node reader.js info pham-nhan-tu-tien
```

### Export to text or HTML:
```bash
# Export to text file
node reader.js export pham-nhan-tu-tien txt

# Export to HTML file
node reader.js export pham-nhan-tu-tien html
```

### Direct JSON Access

You can also read the JSON files directly:
- **Story info**: `output/<story-slug>/info.json`
- **Complete story**: `output/<story-slug>/story.json`
- **Individual chapters**: `output/<story-slug>/chapters/chapter-XXXXX.json`

Each chapter JSON contains:
- `number`: Chapter number
- `title`: Chapter title
- `url`: Original chapter URL
- `content.text`: Plain text content
- `content.html`: HTML formatted content

## Text-to-Speech (TTS) - Vietnamese Audio

Convert chapters to Vietnamese audio files using AI voice:

### Convert a single chapter:
```bash
node tts.js convert pham-nhan-tu-tien 1
```

### Convert all chapters:
```bash
node tts.js convert pham-nhan-tu-tien all
```

### Convert a range of chapters:
```bash
node tts.js batch pham-nhan-tu-tien 1 10
```

### List audio files:
```bash
node tts.js list pham-nhan-tu-tien
```

### Play an audio file:
```bash
# Play all parts (default behavior - creates playlist if chapter is split)
node tts.js play pham-nhan-tu-tien 1

# Play only the first part
node tts.js play pham-nhan-tu-tien 1 --single-part
```

By default, if a chapter is split into multiple audio files, a playlist file (M3U) will be created and opened in your media player, which will automatically play all parts sequentially.

### Options:
- `--lang <code>`: Language code (default: `vi` for Vietnamese)
- `--slow`: Use slower speech speed
- `--force`: Re-convert even if audio file already exists

### Examples:
```bash
# Convert chapter 1 with slow speed
node tts.js convert pham-nhan-tu-tien 1 --slow

# Convert chapters 1-5
node tts.js batch pham-nhan-tu-tien 1 5

# Convert all chapters
node tts.js convert pham-nhan-tu-tien all
```

Audio files are saved to: `output/<story-slug>/audio/chapter-XXXXX.mp3`

**Note:** 
- The TTS uses Google Text-to-Speech which supports Vietnamese
- For very long chapters, the text is automatically split into parts, then combined into a single audio file
- **Requires ffmpeg** to combine audio parts. Download from: https://ffmpeg.org/download.html
- If ffmpeg is not installed, parts will be kept separate
- Use `--no-combine` to keep parts separate even if ffmpeg is available

## Notes

- The crawler includes delays between requests to be respectful to the server
- Default delay is 1 second (1000ms) - adjust as needed
- The tool handles pagination automatically by reading the total pages from the HTML
- Failed chapters are logged but don't stop the entire crawl process
- TTS conversion may take time depending on chapter length and internet connection

