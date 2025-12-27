// Global state
let currentStory = null;
let currentChapters = [];
let currentChapterIndex = -1;
let readingProgress = {};

// URL routing (using History API for clean URLs)
function updateURL(story, chapterNumber = null) {
    let url = '/';
    if (story) {
        url = `/story/${story}`;
        if (chapterNumber !== null && chapterNumber > 0) {
            url += `/chapter/${chapterNumber}`;
        }
    }
    window.history.pushState({ story, chapterNumber }, '', url);
}

function parseURL() {
    const path = window.location.pathname;
    
    // Format: /story/<slug>/chapter/<number>
    const match = path.match(/\/story\/([^/]+)(?:\/chapter\/(\d+))?/);
    if (match) {
        return {
            story: match[1],
            chapterNumber: match[2] ? parseInt(match[2], 10) : null
        };
    }
    return null;
}

// API functions
async function fetchStories() {
    const response = await fetch('/api/stories');
    return await response.json();
}

async function fetchChapters(slug) {
    const response = await fetch(`/api/stories/${slug}/chapters`);
    return await response.json();
}

async function fetchChapter(slug, filename) {
    const response = await fetch(`/api/stories/${slug}/chapters/${filename}`);
    return await response.json();
}

async function saveProgress(slug, chapterNumber, read) {
    await fetch(`/api/progress/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterNumber, read })
    });
}

async function loadProgress(slug) {
    const response = await fetch(`/api/progress/${slug}`);
    return await response.json();
}

// UI functions
function renderStories(stories) {
    const storyList = document.getElementById('storyList');
    
    if (stories.length === 0) {
        storyList.innerHTML = '<div class="loading">No stories found. Crawl some stories first!</div>';
        return;
    }
    
    storyList.innerHTML = stories.map(story => `
        <div class="story-item" data-slug="${story.slug}">
            <div class="story-title">${story.title}</div>
            <div class="story-meta">${story.chapterCount} chapters</div>
        </div>
    `).join('');
    
    // Add click handlers
    document.querySelectorAll('.story-item').forEach(item => {
        item.addEventListener('click', () => {
            const slug = item.dataset.slug;
            loadStory(slug);
            document.querySelectorAll('.story-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        });
    });
    
    // Check URL and restore state
    const urlState = parseURL();
    if (urlState) {
        const storyItem = document.querySelector(`[data-slug="${urlState.story}"]`);
        if (storyItem) {
            storyItem.classList.add('active');
            loadStory(urlState.story, urlState.chapterNumber);
        }
    }
}

async function loadStory(slug, chapterNumber = null) {
    currentStory = slug;
    document.getElementById('currentStory').textContent = 'Loading...';
    
    // Load chapters and progress
    const [chapters, progress] = await Promise.all([
        fetchChapters(slug),
        loadProgress(slug)
    ]);
    
    currentChapters = chapters;
    readingProgress = progress.chapters || {};
    
    // Update UI
    const storyInfo = await fetchStories();
    const story = storyInfo.find(s => s.slug === slug);
    document.getElementById('currentStory').textContent = story ? story.title : slug;
    
    // Update URL
    updateURL(slug, chapterNumber);
    
    // If chapter number is specified, find and load that chapter
    if (chapterNumber !== null && chapterNumber > 0) {
        const chapterIndex = chapters.findIndex(ch => ch.number === chapterNumber);
        if (chapterIndex >= 0) {
            loadChapter(chapterIndex, chapterNumber);
        } else {
            showChapterList();
        }
    } else {
        showChapterList();
    }
}

function showChapterList() {
    document.getElementById('chapterListView').classList.remove('hidden');
    document.getElementById('chapterView').classList.add('hidden');
    
    const chapterList = document.getElementById('chapterListView');
    const welcome = chapterList.querySelector('.welcome-message');
    
    if (welcome) {
        welcome.remove();
    }
    
    chapterList.innerHTML = `
        <h3>Chapters (${currentChapters.length})</h3>
        <div class="chapter-grid" id="chapterGrid"></div>
    `;
    
    const grid = document.getElementById('chapterGrid');
    grid.innerHTML = currentChapters.map((chapter, index) => {
        const isRead = readingProgress[chapter.number]?.read || false;
        return `
            <div class="chapter-card ${isRead ? 'read' : ''}" data-index="${index}">
                <div class="chapter-number">Chapter ${chapter.number || 'N/A'}</div>
                <div class="chapter-title">${chapter.title}</div>
            </div>
        `;
    }).join('');
    
    // Add click handlers
    document.querySelectorAll('.chapter-card').forEach(card => {
        card.addEventListener('click', () => {
            const index = parseInt(card.dataset.index);
            loadChapter(index);
        });
    });
}

async function loadChapter(index, chapterNumber = null) {
    if (index < 0 || index >= currentChapters.length) return;
    
    currentChapterIndex = index;
    const chapter = currentChapters[index];
    const chNumber = chapterNumber || chapter.number;
    
    // Update URL with chapter number (not index)
    updateURL(currentStory, chNumber);
    
    // Show chapter view
    document.getElementById('chapterListView').classList.add('hidden');
    document.getElementById('chapterView').classList.remove('hidden');
    
    // Update header
    document.getElementById('chapterTitle').textContent = `Chapter ${chapter.number || 'N/A'}: ${chapter.title}`;
    
    // Update navigation buttons
    document.getElementById('prevChapter').disabled = index === 0;
    document.getElementById('nextChapter').disabled = index === currentChapters.length - 1;
    
    // Show loading spinner
    document.getElementById('chapterContent').innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading chapter...</p></div>';
    const chapterData = await fetchChapter(currentStory, chapter.filename);
    
    // Display HTML content
    if (chapterData.content.html) {
        document.getElementById('chapterContent').innerHTML = chapterData.content.html;
    } else {
        // Fallback to text if HTML not available
        document.getElementById('chapterContent').textContent = chapterData.content.text;
    }
    
    // Update read checkbox
    const isRead = readingProgress[chapter.number]?.read || false;
    document.getElementById('markRead').checked = isRead;
    
    // Scroll to top
    document.querySelector('.chapter-view').scrollTop = 0;
}

// Event listeners
document.getElementById('menuBtn').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.add('open');
});

document.getElementById('closeSidebar').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.remove('open');
});

document.getElementById('prevChapter').addEventListener('click', () => {
    if (currentChapterIndex > 0) {
        loadChapter(currentChapterIndex - 1);
    }
});

document.getElementById('nextChapter').addEventListener('click', () => {
    if (currentChapterIndex < currentChapters.length - 1) {
        loadChapter(currentChapterIndex + 1);
    }
});

document.getElementById('markRead').addEventListener('change', async (e) => {
    if (!currentStory || currentChapterIndex < 0) return;
    
    const chapter = currentChapters[currentChapterIndex];
    const isRead = e.target.checked;
    
    await saveProgress(currentStory, chapter.number, isRead);
    
    // Update progress
    if (!readingProgress[chapter.number]) {
        readingProgress[chapter.number] = {};
    }
    readingProgress[chapter.number].read = isRead;
    
    // Update chapter list if visible
    if (!document.getElementById('chapterListView').classList.contains('hidden')) {
        showChapterList();
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    if (e.key === 'ArrowLeft' && !document.getElementById('prevChapter').disabled) {
        document.getElementById('prevChapter').click();
    } else if (e.key === 'ArrowRight' && !document.getElementById('nextChapter').disabled) {
        document.getElementById('nextChapter').click();
    }
});

// Handle browser back/forward buttons
window.addEventListener('popstate', (e) => {
    const urlState = parseURL();
    if (urlState) {
        loadStory(urlState.story, urlState.chapterNumber);
    } else {
        // Go back to story list
        currentStory = null;
        document.getElementById('chapterListView').classList.remove('hidden');
        document.getElementById('chapterView').classList.add('hidden');
        document.getElementById('currentStory').textContent = 'Select a story to read';
        updateURL(null);
    }
});

// Initialize
async function init() {
    const stories = await fetchStories();
    renderStories(stories);
    
    // Check if URL has state to restore
    const urlState = parseURL();
    if (urlState && stories.find(s => s.slug === urlState.story)) {
        // URL state will be handled by renderStories after stories are loaded
    }
}

init();

