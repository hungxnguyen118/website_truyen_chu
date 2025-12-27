import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import gTTS from 'gtts';
import ffmpeg from 'fluent-ffmpeg';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);

function printUsage() {
  console.log(`
Usage: node tts.js <command> [options]

Commands:
  convert <story-slug> <chapter>    Convert a chapter to audio (by number or "all")
  batch <story-slug> [start] [end]   Convert multiple chapters to audio
  list <story-slug>                  List available audio files
  play <story-slug> <chapter>        Play an audio file (by chapter number)
                                      Default: plays all parts if chapter is split
                                      Use --single-part to play only the first part

Options:
  --lang <code>          Language code (default: vi for Vietnamese)
  --slow                 Use slow speed (default: false)
  --voice <name>         Voice name (for gTTS: limited options, see docs)
  --no-combine           Don't combine split audio parts (keep separate files)
  --output-dir <dir>     Output directory for audio files (default: ./output/<story>/audio)
  
Note: Audio parts are automatically combined into a single file using ffmpeg.
      Make sure ffmpeg is installed on your system.
      Download from: https://ffmpeg.org/download.html
  
Voice Options:
  gTTS (current) supports language codes but limited voice selection.
  Available Vietnamese options: 'vi' (default Vietnamese voice)
  
  For more voice options, consider:
  - Google Cloud TTS (requires API key, many voices)
  - Azure Cognitive Services (requires API key, many voices)
  - Amazon Polly (requires API key, many voices)

Examples:
  node tts.js convert pham-nhan-tu-tien 1
  node tts.js convert pham-nhan-tu-tien 1 --slow          # Slower speech
  node tts.js convert pham-nhan-tu-tien 1 --lang vi      # Vietnamese
  node tts.js convert pham-nhan-tu-tien all
  node tts.js batch pham-nhan-tu-tien 1 5
  node tts.js list pham-nhan-tu-tien
  node tts.js play pham-nhan-tu-tien 1                   # Plays all parts by default
  node tts.js play pham-nhan-tu-tien 1 --single-part     # Play only first part
  node tts.js convert pham-nhan-tu-tien 1 --list-voices   # List available voices
`);
}

/**
 * Combine multiple audio files into one
 */
async function combineAudioFiles(inputFiles, outputFile) {
  return new Promise((resolve, reject) => {
    if (inputFiles.length === 0) {
      reject(new Error('No input files to combine'));
      return;
    }
    
    if (inputFiles.length === 1) {
      // If only one file, just copy it
      fs.copyFile(inputFiles[0], outputFile)
        .then(() => resolve(outputFile))
        .catch(reject);
      return;
    }
    
    // Create a temporary file list for ffmpeg
    const listFile = outputFile.replace('.mp3', '_filelist.txt');
    const fileListContent = inputFiles.map(file => {
      // Escape single quotes and use forward slashes for cross-platform compatibility
      const normalizedPath = file.replace(/\\/g, '/').replace(/'/g, "'\\''");
      return `file '${normalizedPath}'`;
    }).join('\n');
    
    fs.writeFile(listFile, fileListContent, 'utf8')
      .then(() => {
        // Use ffmpeg to concatenate files
        const listFilePath = listFile.replace(/\\/g, '/');
        
        ffmpeg()
          .input(listFilePath)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .outputOptions(['-c', 'copy'])
          .output(outputFile)
          .on('start', (commandLine) => {
            // Optional: log the command for debugging
          })
          .on('end', () => {
            // Clean up list file
            fs.remove(listFile).catch(() => {});
            resolve(outputFile);
          })
          .on('error', (err) => {
            // Clean up list file
            fs.remove(listFile).catch(() => {});
            reject(new Error(`Failed to combine audio files: ${err.message}. Make sure ffmpeg is installed.`));
          })
          .run();
      })
      .catch(reject);
  });
}

/**
 * Split text into chunks that are suitable for TTS (max ~5000 characters)
 */
function splitTextForTTS(text, maxLength = 4500) {
  const chunks = [];
  let currentChunk = '';
  
  // Split by sentences (periods, exclamation, question marks)
  const sentences = text.split(/([.!?。！？]\s*)/);
  
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    
    if ((currentChunk + sentence).length > maxLength && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

/**
 * Get available voices for a language
 */
function getAvailableVoices(lang = 'vi') {
  // gTTS has limited voice options per language
  // These are the common language codes that gTTS supports
  const voices = {
    'vi': {
      default: 'Vietnamese (default)',
      note: 'gTTS uses Google\'s default Vietnamese voice. For more voice options, consider using Google Cloud TTS API.'
    },
    'en': {
      default: 'English (default)',
      'en-us': 'English (US)',
      'en-gb': 'English (UK)',
      'en-au': 'English (Australia)',
      note: 'gTTS supports different English accents via language codes'
    },
    'es': {
      default: 'Spanish (default)',
      'es-es': 'Spanish (Spain)',
      'es-us': 'Spanish (US)',
      note: 'gTTS supports different Spanish accents'
    },
    'fr': {
      default: 'French (default)',
      'fr-fr': 'French (France)',
      'fr-ca': 'French (Canada)',
      note: 'gTTS supports different French accents'
    }
  };
  
  return voices[lang] || { default: `${lang} (default)`, note: 'Using default voice for this language' };
}

/**
 * Convert text to speech and save as MP3
 */
async function textToSpeech(text, outputPath, options = {}) {
  const {
    lang = 'vi',
    slow = false,
    voice = null
  } = options;
  
  return new Promise((resolve, reject) => {
    try {
      // gTTS constructor: (text, lang, slow, host)
      // Note: gTTS doesn't support direct voice selection, only language codes
      // For voice selection, you'd need Google Cloud TTS API or similar
      let ttsLang = lang;
      
      // If voice is specified and it's a valid language code variant, use it
      if (voice && voice.startsWith(lang)) {
        ttsLang = voice;
      } else if (voice && voice !== 'default') {
        console.log(`Warning: gTTS doesn't support custom voice names. Using language: ${lang}`);
        console.log(`For custom voices, consider using Google Cloud TTS API.`);
      }
      
      const gtts = new gTTS(text, ttsLang, slow);
      
      gtts.save(outputPath, (err) => {
        if (err) {
          reject(new Error(`TTS conversion failed: ${err.message}`));
        } else {
          resolve(outputPath);
        }
      });
    } catch (error) {
      reject(new Error(`TTS error: ${error.message}`));
    }
  });
}

/**
 * Convert a single chapter to audio
 */
async function convertChapter(storySlug, chapterIdentifier, options = {}) {
  const outputDir = path.join(__dirname, 'output', storySlug);
  const chaptersDir = path.join(outputDir, 'chapters');
  const audioDir = path.join(outputDir, 'audio');
  
  await fs.ensureDir(audioDir);
  
  if (!await fs.pathExists(chaptersDir)) {
    throw new Error(`Story "${storySlug}" not found in output directory`);
  }
  
  let chapterPath;
  let chapterNum;
  
  // Handle "all" case
  if (chapterIdentifier === 'all') {
    const files = await fs.readdir(chaptersDir);
    const chapterFiles = files.filter(f => f.endsWith('.json')).sort();
    
    console.log(`\nConverting all ${chapterFiles.length} chapters to audio...\n`);
    
    for (let i = 0; i < chapterFiles.length; i++) {
      const file = chapterFiles[i];
      const filePath = path.join(chaptersDir, file);
      const chapter = await fs.readJSON(filePath);
      
      console.log(`[${i + 1}/${chapterFiles.length}] Converting: ${chapter.title}`);
      await convertSingleChapter(chapter, audioDir, options);
    }
    
    console.log(`\n✓ All chapters converted successfully!`);
    return;
  }
  
  // Find chapter file
  if (chapterIdentifier.endsWith('.json')) {
    chapterPath = path.join(chaptersDir, chapterIdentifier);
  } else {
    chapterNum = parseInt(chapterIdentifier, 10);
    if (isNaN(chapterNum)) {
      throw new Error(`Invalid chapter identifier: ${chapterIdentifier}`);
    }
    const filename = `chapter-${chapterNum.toString().padStart(5, '0')}.json`;
    chapterPath = path.join(chaptersDir, filename);
  }
  
  if (!await fs.pathExists(chapterPath)) {
    throw new Error(`Chapter not found: ${chapterIdentifier}`);
  }
  
  const chapter = await fs.readJSON(chapterPath);
  await convertSingleChapter(chapter, audioDir, options);
}

/**
 * Convert a single chapter object to audio
 */
async function convertSingleChapter(chapter, audioDir, options = {}) {
  const chapterNum = chapter.number || 'unknown';
  const outputFile = path.join(audioDir, `chapter-${chapterNum.toString().padStart(5, '0')}.mp3`);
  const combineParts = options.combineParts !== false; // Default to true
  
  // Check if already exists
  if (await fs.pathExists(outputFile) && !options.force) {
    console.log(`  ⏭️  Skipping (already exists): ${path.basename(outputFile)}`);
    return outputFile;
  }
  
  // Prepare text: title + content
  const text = `${chapter.title}\n\n${chapter.content.text}`;
  
  // Split into chunks if too long
  const chunks = splitTextForTTS(text);
  
  if (chunks.length > 1) {
    console.log(`  📝 Text split into ${chunks.length} parts (total: ${text.length} chars)`);
    
    // Convert each chunk and combine
    const tempFiles = [];
    try {
      for (let i = 0; i < chunks.length; i++) {
        const tempFile = path.join(audioDir, `temp_chapter_${chapterNum}_part_${i + 1}.mp3`);
        console.log(`  🔊 Converting part ${i + 1}/${chunks.length}...`);
        await textToSpeech(chunks[i], tempFile, options);
        tempFiles.push(tempFile);
      }
      
      // Combine all parts into one file (if enabled)
      if (combineParts) {
        console.log(`  🔗 Combining ${chunks.length} parts into single audio file...`);
        try {
          await combineAudioFiles(tempFiles, outputFile);
          
          // Clean up temporary part files
          for (const tempFile of tempFiles) {
            if (await fs.pathExists(tempFile)) {
              await fs.remove(tempFile);
            }
          }
          
          console.log(`  ✓ Combined audio saved successfully`);
        } catch (error) {
          console.log(`  ⚠️  Warning: Could not combine audio files: ${error.message}`);
          console.log(`     Make sure ffmpeg is installed. Keeping individual parts.`);
          // Keep the parts as separate files
          await fs.move(tempFiles[0], outputFile, { overwrite: true });
          for (let i = 1; i < tempFiles.length; i++) {
            const partFile = path.join(audioDir, `chapter-${chapterNum.toString().padStart(5, '0')}_part${i + 1}.mp3`);
            await fs.move(tempFiles[i], partFile, { overwrite: true });
          }
        }
      } else {
        // Don't combine, keep as separate files
        console.log(`  ℹ️  Keeping ${chunks.length} separate audio files (--no-combine option)`);
        await fs.move(tempFiles[0], outputFile, { overwrite: true });
        for (let i = 1; i < tempFiles.length; i++) {
          const partFile = path.join(audioDir, `chapter-${chapterNum.toString().padStart(5, '0')}_part${i + 1}.mp3`);
          await fs.move(tempFiles[i], partFile, { overwrite: true });
        }
      }
    } catch (error) {
      // Clean up temp files on error
      for (const tempFile of tempFiles) {
        if (await fs.pathExists(tempFile)) {
          await fs.remove(tempFile);
        }
      }
      throw error;
    }
  } else {
    console.log(`  🔊 Converting to audio...`);
    await textToSpeech(text, outputFile, options);
  }
  
  console.log(`  ✓ Saved: ${path.basename(outputFile)}`);
  return outputFile;
}

/**
 * Convert multiple chapters in batch
 */
async function batchConvert(storySlug, startChapter = null, endChapter = null, options = {}) {
  const outputDir = path.join(__dirname, 'output', storySlug);
  const chaptersDir = path.join(outputDir, 'chapters');
  
  if (!await fs.pathExists(chaptersDir)) {
    throw new Error(`Story "${storySlug}" not found in output directory`);
  }
  
  const files = await fs.readdir(chaptersDir);
  const chapterFiles = files
    .filter(f => f.endsWith('.json'))
    .sort();
  
  let filesToConvert = chapterFiles;
  
  // Filter by chapter range if specified
  if (startChapter !== null || endChapter !== null) {
    filesToConvert = [];
    for (const file of chapterFiles) {
      const chapterPath = path.join(chaptersDir, file);
      const chapter = await fs.readJSON(chapterPath);
      
      if (chapter.number !== null) {
        if (startChapter !== null && chapter.number < startChapter) continue;
        if (endChapter !== null && chapter.number > endChapter) continue;
      }
      filesToConvert.push(file);
    }
  }
  
  console.log(`\nConverting ${filesToConvert.length} chapters to audio...\n`);
  
  const audioDir = path.join(outputDir, 'audio');
  await fs.ensureDir(audioDir);
  
  for (let i = 0; i < filesToConvert.length; i++) {
    const file = filesToConvert[i];
    const chapterPath = path.join(chaptersDir, file);
    const chapter = await fs.readJSON(chapterPath);
    
    console.log(`[${i + 1}/${filesToConvert.length}] ${chapter.title}`);
    try {
      await convertSingleChapter(chapter, audioDir, options);
    } catch (error) {
      console.error(`  ✗ Error: ${error.message}`);
    }
    
    // Small delay between conversions
    if (i < filesToConvert.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log(`\n✓ Batch conversion completed!`);
}

/**
 * Find all audio parts for a chapter
 */
async function findAudioParts(audioDir, chapterNumber) {
  const chapterPrefix = `chapter-${chapterNumber.toString().padStart(5, '0')}`;
  const files = await fs.readdir(audioDir);
  
  const parts = [];
  
  // Find main file
  const mainFile = path.join(audioDir, `${chapterPrefix}.mp3`);
  if (await fs.pathExists(mainFile)) {
    parts.push({ file: mainFile, part: 1, isMain: true });
  }
  
  // Find part files (chapter-00001_part2.mp3, chapter-00001_part3.mp3, etc.)
  const partPattern = new RegExp(`^${chapterPrefix}_part(\\d+)\\.mp3$`);
  for (const file of files) {
    const match = file.match(partPattern);
    if (match) {
      const partNum = parseInt(match[1], 10);
      parts.push({ 
        file: path.join(audioDir, file), 
        part: partNum + 1, // part2 is actually part 2, so we add 1
        isMain: false 
      });
    }
  }
  
  // Sort by part number
  parts.sort((a, b) => {
    if (a.isMain) return -1;
    if (b.isMain) return 1;
    return a.part - b.part;
  });
  
  return parts;
}

/**
 * Play an audio file (and all its parts if split)
 */
async function playAudio(storySlug, chapterNumber, playAllParts = true) {
  const outputDir = path.join(__dirname, 'output', storySlug);
  const audioDir = path.join(outputDir, 'audio');
  
  if (!await fs.pathExists(audioDir)) {
    throw new Error(`Audio directory not found for "${storySlug}"`);
  }
  
  // Find all parts of this chapter
  const parts = await findAudioParts(audioDir, chapterNumber);
  
  if (parts.length === 0) {
    throw new Error(`Audio file not found: Chapter ${chapterNumber}`);
  }
  
  console.log(`\nPlaying: Chapter ${chapterNumber}`);
  
  if (parts.length > 1) {
    console.log(`Found ${parts.length} audio parts for this chapter:`);
    for (const part of parts) {
      const stats = await fs.stat(part.file);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`  Part ${part.part}: ${path.basename(part.file)} (${sizeMB} MB)`);
    }
    console.log();
  }
  
  // Determine OS and use appropriate command
  const platform = process.platform;
  
  if (parts.length === 1 || !playAllParts) {
    // Play single file or just the first part
    const audioFile = parts[0].file;
    let command;
    
    if (platform === 'win32') {
      command = `start "" "${audioFile}"`;
    } else if (platform === 'darwin') {
      command = `open "${audioFile}"`;
    } else {
      command = `xdg-open "${audioFile}"`;
    }
    
    try {
      await execAsync(command);
      console.log(`Audio player opened: ${path.basename(audioFile)}`);
      if (parts.length > 1) {
        console.log(`\nNote: This chapter has ${parts.length} parts.`);
        console.log(`Use --all-parts to play all parts sequentially.`);
      }
    } catch (error) {
      console.error(`Error playing audio: ${error.message}`);
      console.log(`\nYou can manually open the file:`);
      console.log(`  ${audioFile}`);
    }
  } else {
    // Create a playlist file (M3U format) for all parts
    const playlistFile = path.join(audioDir, `chapter-${chapterNumber.toString().padStart(5, '0')}.m3u`);
    
    // Create M3U playlist content
    let playlistContent = '#EXTM3U\n';
    playlistContent += `#EXTINF:-1,Chapter ${chapterNumber} - Complete\n`;
    
    for (const part of parts) {
      // Use relative path for better compatibility
      const relativePath = path.relative(path.dirname(playlistFile), part.file);
      playlistContent += `${relativePath}\n`;
    }
    
    await fs.writeFile(playlistFile, playlistContent, 'utf8');
    console.log(`Created playlist: ${path.basename(playlistFile)}`);
    console.log(`Playing all ${parts.length} parts sequentially...\n`);
    
    // Open the playlist file
    let command;
    if (platform === 'win32') {
      command = `start "" "${playlistFile}"`;
    } else if (platform === 'darwin') {
      command = `open "${playlistFile}"`;
    } else {
      command = `xdg-open "${playlistFile}"`;
    }
    
    try {
      await execAsync(command);
      console.log(`✓ Playlist opened in your media player!`);
      console.log(`The player will automatically play all ${parts.length} parts in sequence.`);
    } catch (error) {
      console.error(`Error opening playlist: ${error.message}`);
      console.log(`\nYou can manually open the playlist file:`);
      console.log(`  ${playlistFile}`);
      console.log(`\nOr play individual parts:`);
      for (const part of parts) {
        console.log(`  ${part.file}`);
      }
    }
  }
}

/**
 * List available audio files
 */
async function listAudioFiles(storySlug) {
  const outputDir = path.join(__dirname, 'output', storySlug);
  const audioDir = path.join(outputDir, 'audio');
  
  if (!await fs.pathExists(audioDir)) {
    console.log(`No audio files found for "${storySlug}"`);
    return;
  }
  
  const files = await fs.readdir(audioDir);
  const audioFiles = files
    .filter(f => f.endsWith('.mp3'))
    .sort();
  
  console.log(`\n=== Audio Files for "${storySlug}" ===\n`);
  console.log(`Total audio files: ${audioFiles.length}\n`);
  
  for (const file of audioFiles) {
    const filePath = path.join(audioDir, file);
    const stats = await fs.stat(filePath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`${file.padEnd(30)} - ${sizeMB} MB`);
  }
}

async function main() {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }
  
  const command = args[0];
  const options = {
    lang: 'vi',
    slow: false,
    force: false,
    voice: null
  };
  
  // Parse options
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--lang' && args[i + 1]) {
      options.lang = args[++i];
    } else if (arg === '--slow') {
      options.slow = true;
    } else if (arg === '--voice' && args[i + 1]) {
      options.voice = args[++i];
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--list-voices') {
      // List available voices for current language
      const lang = options.lang || 'vi';
      const voices = getAvailableVoices(lang);
      console.log(`\nAvailable voices for language "${lang}":`);
      console.log(`  Default: ${voices.default}`);
      if (voices.note) {
        console.log(`  Note: ${voices.note}`);
      }
      Object.keys(voices).forEach(key => {
        if (key !== 'default' && key !== 'note') {
          console.log(`  ${key}: ${voices[key]}`);
        }
      });
      console.log();
      process.exit(0);
    }
  }
  
  try {
    switch (command) {
      case 'convert':
        if (args.length < 3) {
          console.error('Error: Please provide story slug and chapter identifier');
          printUsage();
          process.exit(1);
        }
        await convertChapter(args[1], args[2], options);
        break;
        
      case 'batch':
        if (args.length < 2) {
          console.error('Error: Please provide story slug');
          printUsage();
          process.exit(1);
        }
        const start = args[2] ? parseInt(args[2], 10) : null;
        const end = args[3] ? parseInt(args[3], 10) : null;
        await batchConvert(args[1], start, end, options);
        break;
        
      case 'list':
        if (args.length < 2) {
          console.error('Error: Please provide story slug');
          printUsage();
          process.exit(1);
        }
        await listAudioFiles(args[1]);
        break;
        
      case 'play':
        if (args.length < 3) {
          console.error('Error: Please provide story slug and chapter number');
          printUsage();
          process.exit(1);
        }
        const chapterNum = parseInt(args[2], 10);
        if (isNaN(chapterNum)) {
          console.error('Error: Chapter number must be a valid number');
          process.exit(1);
        }
        const playAllParts = !args.includes('--single-part'); // Default to true (play all parts)
        await playAudio(args[1], chapterNum, playAllParts);
        break;
        
      default:
        console.error(`Error: Unknown command "${command}"`);
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  }
}

main();

