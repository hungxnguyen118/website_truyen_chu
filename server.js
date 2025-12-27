import express from 'express';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const OUTPUT_DIR = path.join(__dirname, 'output');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: Get all stories
app.get('/api/stories', async (req, res) => {
  try {
    if (!await fs.pathExists(OUTPUT_DIR)) {
      return res.json([]);
    }
    
    const stories = [];
    const dirs = await fs.readdir(OUTPUT_DIR);
    
    for (const dir of dirs) {
      const storyDir = path.join(OUTPUT_DIR, dir);
      const stat = await fs.stat(storyDir);
      
      if (stat.isDirectory()) {
        const infoPath = path.join(storyDir, 'info.json');
        if (await fs.pathExists(infoPath)) {
          const info = await fs.readJSON(infoPath);
          
          // Count chapters
          const chaptersDir = path.join(storyDir, 'chapters');
          let chapterCount = 0;
          if (await fs.pathExists(chaptersDir)) {
            const files = await fs.readdir(chaptersDir);
            chapterCount = files.filter(f => f.endsWith('.json')).length;
          }
          
          stories.push({
            slug: dir,
            title: info.title,
            url: info.url,
            totalPages: info.totalPages,
            chapterCount: chapterCount
          });
        }
      }
    }
    
    res.json(stories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get story chapters
app.get('/api/stories/:slug/chapters', async (req, res) => {
  try {
    const { slug } = req.params;
    const storyDir = path.join(OUTPUT_DIR, slug);
    const chaptersDir = path.join(storyDir, 'chapters');
    
    if (!await fs.pathExists(chaptersDir)) {
      return res.json([]);
    }
    
    const files = await fs.readdir(chaptersDir);
    const chapterFiles = files
      .filter(f => f.endsWith('.json'))
      .sort();
    
    const chapters = [];
    for (const file of chapterFiles) {
      const filePath = path.join(chaptersDir, file);
      const chapter = await fs.readJSON(filePath);
      chapters.push({
        number: chapter.number,
        title: chapter.title,
        url: chapter.url,
        filename: file
      });
    }
    
    res.json(chapters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get chapter content
app.get('/api/stories/:slug/chapters/:filename', async (req, res) => {
  try {
    const { slug, filename } = req.params;
    const chapterPath = path.join(OUTPUT_DIR, slug, 'chapters', filename);
    
    if (!await fs.pathExists(chapterPath)) {
      return res.status(404).json({ error: 'Chapter not found' });
    }
    
    const chapter = await fs.readJSON(chapterPath);
    res.json(chapter);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Save reading progress
app.post('/api/progress/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { chapterNumber, read } = req.body;
    
    const progressDir = path.join(OUTPUT_DIR, slug);
    await fs.ensureDir(progressDir);
    const progressFile = path.join(progressDir, 'progress.json');
    
    let progress = {};
    if (await fs.pathExists(progressFile)) {
      progress = await fs.readJSON(progressFile);
    }
    
    if (!progress.chapters) {
      progress.chapters = {};
    }
    
    progress.chapters[chapterNumber] = {
      read: read,
      timestamp: new Date().toISOString()
    };
    
    // Update last read chapter
    if (read) {
      progress.lastReadChapter = chapterNumber;
      progress.lastReadTime = new Date().toISOString();
    }
    
    await fs.writeJSON(progressFile, progress, { spaces: 2 });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get reading progress
app.get('/api/progress/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const progressFile = path.join(OUTPUT_DIR, slug, 'progress.json');
    
    if (!await fs.pathExists(progressFile)) {
      return res.json({ chapters: {}, lastReadChapter: null });
    }
    
    const progress = await fs.readJSON(progressFile);
    res.json(progress);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve main page and handle client-side routing
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle client-side routing - serve index.html for all routes
app.get('/story/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n📚 Story Reader Server running at:`);
  console.log(`   http://localhost:${PORT}\n`);
});

