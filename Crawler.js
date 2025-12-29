import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { delay } from './utils.js';

export class TruyenFullCrawler {
  constructor(options = {}) {
    this.baseUrl = 'https://truyenfull.vision';
    this.delay = options.delay || 1000; // Delay between requests in ms
    this.retries = options.retries || 3;
    this.timeout = options.timeout || 30000;

    // Set default headers to mimic a browser
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    };
  }

  /**
   * Fetch HTML content from a URL with retry logic
   */
  async fetchPage(url, retryCount = 0) {
    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), this.timeout);
      });

      // Create fetch promise
      const fetchPromise = fetch(url, {
        headers: this.headers
      });

      // Race between fetch and timeout
      const response = await Promise.race([fetchPromise, timeoutPromise]);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      return html;
    } catch (error) {
      if (retryCount < this.retries) {
        console.log(`Retrying ${url} (attempt ${retryCount + 1}/${this.retries})...`);
        await delay(this.delay * (retryCount + 1));
        return this.fetchPage(url, retryCount + 1);
      }
      throw new Error(`Failed to fetch ${url}: ${error.message}`);
    }
  }

  /**
   * Extract story information and total pages from story page
   */
  async getStoryInfo(storyUrl) {
    try {
      const html = await this.fetchPage(storyUrl);
      const $ = cheerio.load(html);

      // Extract story title
      const storyTitle = $('h1').first().text().trim() ||
        $('.title-story').text().trim() ||
        'Unknown Story';

      // Extract total pages from hidden input
      const totalPages = parseInt($('#total-page').val() || '1', 10);

      // Extract story slug from URL
      const urlParts = storyUrl.replace(this.baseUrl, '').split('/').filter(Boolean);
      const storySlug = urlParts[0] || 'unknown';

      return {
        title: storyTitle,
        slug: storySlug,
        url: storyUrl,
        totalPages: totalPages
      };
    } catch (error) {
      throw new Error(`Failed to get story info: ${error.message}`);
    }
  }

  /**
   * Extract chapter links from a single page of chapter list
   */
  async getChaptersFromPage(storyUrl, pageNumber = 1) {
    try {
      let url = storyUrl;

      // Construct paginated URL if not first page
      if (pageNumber > 1) {
        // Remove trailing slash if present
        url = storyUrl.replace(/\/$/, '');
        url = `${url}/trang-${pageNumber}/#list-chapter`;
      } else {
        url = `${storyUrl}#list-chapter`;
      }

      const html = await this.fetchPage(url);
      const $ = cheerio.load(html);

      const chapters = [];

      // Find all chapter links in the list
      $('#list-chapter ul.list-chapter li a').each((index, element) => {
        const $link = $(element);
        const href = $link.attr('href');
        const title = $link.attr('title') || $link.text().trim();

        if (href) {
          // Extract chapter number from URL (e.g., /chuong-790/)
          const chapterMatch = href.match(/chuong-(\d+)/);
          const chapterNumber = chapterMatch ? parseInt(chapterMatch[1], 10) : null;

          chapters.push({
            number: chapterNumber,
            title: title,
            url: href.startsWith('http') ? href : `${this.baseUrl}${href}`,
            order: index
          });
        }
      });

      return chapters;
    } catch (error) {
      throw new Error(`Failed to get chapters from page ${pageNumber}: ${error.message}`);
    }
  }

  /**
   * Get all chapters from all pages
   */
  async getAllChapters(storyUrl) {
    try {
      console.log('Fetching story information...');
      const storyInfo = await this.getStoryInfo(storyUrl);
      console.log(`Story: ${storyInfo.title}`);
      console.log(`Total pages: ${storyInfo.totalPages}`);

      const allChapters = [];

      // Fetch chapters from all pages
      for (let page = 1; page <= storyInfo.totalPages; page++) {
        console.log(`Fetching chapters from page ${page}/${storyInfo.totalPages}...`);
        const chapters = await this.getChaptersFromPage(storyUrl, page);
        allChapters.push(...chapters);

        // Add delay between page requests
        if (page < storyInfo.totalPages) {
          await delay(this.delay);
        }
      }

      // Sort chapters by number
      allChapters.sort((a, b) => {
        if (a.number !== null && b.number !== null) {
          return a.number - b.number;
        }
        return a.order - b.order;
      });

      return {
        storyInfo,
        chapters: allChapters
      };
    } catch (error) {
      throw new Error(`Failed to get all chapters: ${error.message}`);
    }
  }

  /**
   * Extract chapter content (title and body) from a chapter page
   */
  async getChapterContent(chapterUrl) {
    try {
      const html = await this.fetchPage(chapterUrl);
      const $ = cheerio.load(html);

      // Extract chapter title
      const chapterTitle = $('h2 a.chapter-title').text().trim() ||
        $('.chapter-title').text().trim() ||
        $('h2').first().text().trim() ||
        'Unknown Chapter';

      // Extract chapter content
      const chapterContent = $('#chapter-c').html() ||
        $('.chapter-c').html() ||
        '';

      // Clean up the content - remove scripts, styles, and unwanted elements
      const $content = cheerio.load(chapterContent);
      $content('script, style, .ads, .advertisement, iframe').remove();

      // Get text content or HTML
      const textContent = $content('body').text().trim();
      const htmlContent = $content('body').html() || '';

      // Extract chapter number from URL
      const chapterMatch = chapterUrl.match(/chuong-(\d+)/);
      const chapterNumber = chapterMatch ? parseInt(chapterMatch[1], 10) : null;

      return {
        number: chapterNumber,
        title: chapterTitle,
        url: chapterUrl,
        content: {
          text: textContent,
          html: htmlContent
        }
      };
    } catch (error) {
      throw new Error(`Failed to get chapter content from ${chapterUrl}: ${error.message}`);
    }
  }

  /**
   * Crawl all chapters of a story
   */
  async crawlStory(storyUrl, options = {}) {
    const {
      startChapter = 1,
      endChapter = null,
      onProgress = null,
      onChapterCrawled = null,
      onError = null,
      existingChapters = null
    } = options;

    try {
      console.log('Starting to crawl story...');

      // Get all chapter links
      const { storyInfo, chapters } = await this.getAllChapters(storyUrl);

      // Filter chapters if range is specified
      let chaptersToCrawl = chapters;
      if (startChapter || endChapter) {
        chaptersToCrawl = chapters.filter(ch => {
          if (ch.number === null) return true;
          if (startChapter && ch.number < startChapter) return false;
          if (endChapter && ch.number > endChapter) return false;
          return true;
        });
      }

      // Filter out existing chapters if resume mode
      let skippedChapters = [];
      if (existingChapters && existingChapters.size > 0) {
        const beforeCount = chaptersToCrawl.length;
        skippedChapters = chaptersToCrawl.filter(ch => {
          if (ch.number === null) return false;
          return existingChapters.has(ch.number);
        });
        chaptersToCrawl = chaptersToCrawl.filter(ch => {
          if (ch.number === null) return true;
          return !existingChapters.has(ch.number);
        });
        const skipped = beforeCount - chaptersToCrawl.length;
        if (skipped > 0) {
          console.log(`\n⏭️  Skipping ${skipped} already downloaded chapters:`);
          // Show first 10 skipped chapters
          const showCount = Math.min(10, skippedChapters.length);
          for (let i = 0; i < showCount; i++) {
            const ch = skippedChapters[i];
            console.log(`   ⏭️  Chapter ${ch.number}: ${ch.title}`);
          }
          if (skippedChapters.length > showCount) {
            console.log(`   ... and ${skippedChapters.length - showCount} more`);
          }
          console.log();
        }
      }

      console.log(`Total chapters to crawl: ${chaptersToCrawl.length}`);

      const crawledChapters = [];
      let crawledCount = 0;

      // Crawl each chapter
      for (let i = 0; i < chaptersToCrawl.length; i++) {
        const chapterLink = chaptersToCrawl[i];
        console.log(`\n[${i + 1}/${chaptersToCrawl.length}] Crawling: ${chapterLink.title}`);

        try {
          const chapterContent = await this.getChapterContent(chapterLink.url);
          crawledChapters.push(chapterContent);
          crawledCount++;

          // Call onChapterCrawled callback for immediate saving
          if (onChapterCrawled) {
            await onChapterCrawled(chapterContent);
          }

          // Call progress callback if provided
          if (onProgress) {
            onProgress({
              current: crawledCount,
              total: chaptersToCrawl.length,
              chapter: chapterContent
            });
          }

          // Add delay between chapter requests
          if (i < chaptersToCrawl.length - 1) {
            await delay(this.delay);
          }
        } catch (error) {
          console.error(`  ✗ Error crawling chapter: ${error.message}`);

          // Log error for retry later
          if (onError) {
            await onError({
              chapter: chapterLink,
              error: error.message,
              timestamp: new Date().toISOString()
            });
          }

          // Continue with next chapter even if one fails
        }
      }

      return {
        storyInfo,
        chapters: crawledChapters
      };
    } catch (error) {
      throw new Error(`Failed to crawl story: ${error.message}`);
    }
  }
}

