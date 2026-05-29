// ============================================
// DocFetcher Web - IntelliJ IDEA Style
// ============================================

// Global state
let currentProjectDir = null;
let currentOpenFiles = [];
let activeFileTab = null;
let sidebarVisible = true;

// File icon mapping (IDEA style)
const fileIcons = {
    '.java': '☕', '.class': '☕',
    '.py': '🐍', '.pyc': '🐍',
    '.js': '📜', '.jsx': '⚛️',
    '.ts': '📜', '.tsx': '⚛️',
    '.html': '🌐', '.htm': '🌐',
    '.css': '🎨', '.scss': '🎨', '.less': '🎨',
    '.json': '📊', '.xml': '📰',
    '.md': '📝', '.txt': '📄',
    '.yml': '⚙️', '.yaml': '⚙️', '.toml': '⚙️',
    '.ini': '⚙️', '.cfg': '⚙️', '.conf': '⚙️',
    '.c': '📄', '.h': '📋',
    '.cpp': '📄', '.hpp': '📋',
    '.go': '🔷', '.rs': '🦀',
    '.rb': '💎', '.php': '🐘',
    '.sql': '🗃️', '.sh': '⚙️', '.bat': '⚙️',
    '.gitignore': '⚙️', '.gitconfig': '⚙️',
    '.dockerfile': '🐳', '.env': '⚙️',
    '.svg': '🖼️', '.png': '🖼️', '.jpg': '🖼️',
};

function getFileIcon(filename) {
    if (!filename) return '📄';
    const ext = '.' + filename.split('.').pop().toLowerCase();
    return fileIcons[ext] || '📄';
}

function getFileTypeClass(filename) {
    if (!filename) return '';
    const ext = '.' + filename.split('.').pop().toLowerCase();
    const typeMap = {
        '.java': 'file-java', '.py': 'file-python',
        '.js': 'file-js', '.jsx': 'file-js',
        '.ts': 'file-ts', '.tsx': 'file-ts',
        '.html': 'file-html', '.htm': 'file-html',
        '.css': 'file-css', '.scss': 'file-css',
        '.json': 'file-json', '.xml': 'file-xml',
        '.md': 'file-md', '.yml': 'file-yaml', '.yaml': 'file-yaml',
        '.c': 'file-c', '.cpp': 'file-cpp',
        '.bat': 'file-bat', '.sh': 'file-sh',
    };
    return typeMap[ext] || '';
}

function getRelativePath(fullPath, projectDir) {
    if (!projectDir || !fullPath) return fullPath;
    const normalized = fullPath.replace(/\\/g, '/');
    const projNormalized = projectDir.replace(/\\/g, '/');
    if (normalized.startsWith(projNormalized)) {
        return normalized.substring(projNormalized.length).replace(/^\//, '');
    }
    return fullPath.split('/').pop() || fullPath.split('\\').pop();
}

// ============================================
// Search
// ============================================

async function executeSearch() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;
    
    const resultsList = document.getElementById('resultsList');
    const resultsCount = document.getElementById('resultsCount');
    const statusBarResults = document.getElementById('statusBarResults');
    
    resultsList.innerHTML = '<div class="results-empty"><div class="progress-spinner"></div><p>Searching...</p></div>';
    resultsCount.textContent = 'Searching...';
    
    const startTime = Date.now();
    
    try {
        const response = await fetch(`/api/search?query=${encodeURIComponent(query)}&max_results=100`);
        const data = await response.json();
        
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        
        if (data.success && data.results) {
            renderResults(data.results, query);
            resultsCount.textContent = `${data.count} result${data.count !== 1 ? 's' : ''} in ${elapsed}s`;
            statusBarResults.textContent = `${data.count} results`;
            document.getElementById('statusBarTime').textContent = `${elapsed}s`;
        } else {
            resultsList.innerHTML = '<div class="results-empty"><p>No results found</p></div>';
            resultsCount.textContent = '0 results';
            statusBarResults.textContent = '0 results';
        }
    } catch (error) {
        resultsList.innerHTML = `<div class="results-empty"><p style="color: var(--accent-red)">Search error: ${error.message}</p></div>`;
        resultsCount.textContent = 'Error';
        console.error('Search error:', error);
    }
}

function renderResults(results, query) {
    const resultsList = document.getElementById('resultsList');
    
    if (!results || results.length === 0) {
        resultsList.innerHTML = '<div class="results-empty"><p>No results found</p></div>';
        return;
    }
    
    let html = '';
    results.forEach(result => {
        const relPath = getRelativePath(result.file || result.path, currentProjectDir);
        const icon = getFileIcon(relPath);
        const typeClass = getFileTypeClass(relPath);
        const lineNum = result.line || 1;
        const lineContent = escapeHtml(result.content || result.line_content || '');
        
        // Highlight search match
        let highlightedContent = lineContent;
        if (query && lineContent.toLowerCase().includes(query.toLowerCase())) {
            const regex = new RegExp(escapeRegex(query), 'gi');
            highlightedContent = lineContent.replace(regex, match => `<span class="match">${escapeHtml(match)}</span>`);
        }
        
        html += `
            <div class="result-item" onclick="openFile('${escapeAttr(result.file || result.path)}', ${lineNum})">
                <div class="result-path">
                    <span class="file-icon">${icon}</span>
                    <span class="path-text ${typeClass}">${escapeHtml(relPath)}</span>
                </div>
                <div class="result-line">
                    <span class="result-line-number">${lineNum}</span>
                    <span class="result-line-content">${highlightedContent}</span>
                </div>
            </div>
        `;
    });
    
    resultsList.innerHTML = html;
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    document.getElementById('resultsList').innerHTML = `
        <div class="results-empty">
            <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor" opacity="0.3"><path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.007 1.007 0 00-.115-.1zM12 6.5a5.5 5.5 0 11-11 0 5.5 5.5 0 0111 0z"/></svg>
            <p>Enter search text and press Enter</p>
        </div>
    `;
    document.getElementById('resultsCount').textContent = 'No results';
    document.getElementById('statusBarResults').textContent = '';
    document.getElementById('statusBarTime').textContent = '';
}

// ============================================
// File Tree
// ============================================

async function loadTree() {
    const treeContainer = document.getElementById('projectTree');
    treeContainer.innerHTML = '<div class="tree-empty"><div class="progress-spinner"></div></div>';
    
    try {
        const response = await fetch('/api/tree');
        const data = await response.json();
        
        if (data.success && data.tree) {
            treeContainer.innerHTML = renderTree(data.tree, 0);
        } else {
            treeContainer.innerHTML = '<div class="tree-empty">No files found</div>';
        }
    } catch (error) {
        treeContainer.innerHTML = `<div class="tree-empty" style="color: var(--accent-red)">Error loading tree</div>`;
        console.error('Tree error:', error);
    }
}

function renderTree(node, depth) {
    if (!node) return '';
    
    const isDir = node.type === 'dir' || node.children;
    const name = node.name || node.path?.split('/').pop() || node.path?.split('\\').pop() || 'unknown';
    const path = node.path || '';
    const indent = depth * 16;
    
    let html = '';
    
    if (isDir) {
        const dirId = `dir-${Math.random().toString(36).substr(2, 9)}`;
        html += `
            <div class="tree-item dir" style="padding-left: ${indent + 8}px" onclick="toggleDir('${dirId}')">
                <span class="tree-toggle" id="toggle-${dirId}">▶</span>
                <span class="tree-icon">📁</span>
                <span class="tree-label">${escapeHtml(name)}</span>
            </div>
            <div class="tree-children" id="${dirId}">
        `;
        
        const children = node.children || [];
        // Sort: dirs first, then files
        const sorted = [...children].sort((a, b) => {
            const aDir = a.type === 'dir' || a.children ? 0 : 1;
            const bDir = b.type === 'dir' || b.children ? 0 : 1;
            if (aDir !== bDir) return aDir - bDir;
            return (a.name || '').localeCompare(b.name || '');
        });
        
        sorted.forEach(child => {
            html += renderTree(child, depth + 1);
        });
        
        // Also render files from the files array
        const files = node.files || [];
        files.forEach(file => {
            const name = file.name || file.path?.split('/').pop() || file.path?.split('\\').pop() || 'unknown';
            const fpath = file.path || '';
            const typeClass = getFileTypeClass(name);
            html += `
                <div class="tree-item file ${typeClass}" style="padding-left: ${(depth + 1) * 16 + 8}px" onclick="openFile('${escapeAttr(fpath)}')">
                    <span class="tree-toggle"></span>
                    <span class="tree-icon">${getFileIcon(name)}</span>
                    <span class="tree-label">${escapeHtml(name)}</span>
                </div>
            `;
        });
        
        html += '</div>';
    } else {
        const typeClass = getFileTypeClass(name);
        html += `
            <div class="tree-item file ${typeClass}" style="padding-left: ${indent + 8}px" onclick="openFile('${escapeAttr(path)}')">
                <span class="tree-toggle"></span>
                <span class="tree-icon">${getFileIcon(name)}</span>
                <span class="tree-label">${escapeHtml(name)}</span>
            </div>
        `;
    }
    
    return html;
}

function toggleDir(dirId) {
    const children = document.getElementById(dirId);
    const toggle = document.getElementById(`toggle-${dirId}`);
    
    if (children) {
        const isExpanded = children.classList.contains('expanded');
        children.classList.toggle('expanded');
        if (toggle) {
            toggle.textContent = isExpanded ? '▶' : '▼';
        }
    }
}

function collapseAll() {
    document.querySelectorAll('.tree-children').forEach(el => el.classList.remove('expanded'));
    document.querySelectorAll('.tree-toggle').forEach(el => el.textContent = '▶');
}

function expandAll() {
    document.querySelectorAll('.tree-children').forEach(el => el.classList.add('expanded'));
    document.querySelectorAll('.tree-toggle').forEach(el => el.textContent = '▼');
}

// ============================================
// File Viewer
// ============================================

async function openFile(filePath, lineNumber = null) {
    // Check if already open
    const existingTab = currentOpenFiles.find(f => f.path === filePath);
    if (existingTab) {
        activateTab(existingTab.id);
        if (lineNumber) {
            scrollToLine(lineNumber);
        }
        return;
    }
    
    try {
        const response = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
        const data = await response.json();
        
        if (data.success) {
            const tabId = `tab-${Date.now()}`;
            const fileName = filePath.split('/').pop() || filePath.split('\\').pop();
            
            currentOpenFiles.push({
                id: tabId,
                path: filePath,
                name: fileName,
                content: data.content || '',
                lines: data.lines || (data.content || '').split('\n'),
                total_lines: data.total_lines || 0,
            });
            
            renderTabs();
            activateTab(tabId);
            
            if (lineNumber) {
                setTimeout(() => scrollToLine(lineNumber), 50);
            }
        }
    } catch (error) {
        console.error('File open error:', error);
    }
}

function renderTabs() {
    const tabsContainer = document.getElementById('fileTabs');
    
    if (currentOpenFiles.length === 0) {
        tabsContainer.innerHTML = '';
        return;
    }
    
    let html = '';
    currentOpenFiles.forEach(file => {
        const isActive = file.id === activeFileTab;
        html += `
            <div class="file-tab ${isActive ? 'active' : ''}" onclick="activateTab('${file.id}')">
                <span class="tab-icon">${getFileIcon(file.name)}</span>
                <span class="tab-name">${escapeHtml(file.name)}</span>
                <span class="tab-close" onclick="event.stopPropagation(); closeTab('${file.id}')">✕</span>
            </div>
        `;
    });
    
    tabsContainer.innerHTML = html;
}

function activateTab(tabId) {
    activeFileTab = tabId;
    const file = currentOpenFiles.find(f => f.id === tabId);
    
    if (!file) return;
    
    renderTabs();
    renderFileContent(file);
}

function closeTab(tabId) {
    const index = currentOpenFiles.findIndex(f => f.id === tabId);
    if (index === -1) return;
    
    currentOpenFiles.splice(index, 1);
    
    if (activeFileTab === tabId) {
        activeFileTab = currentOpenFiles.length > 0 ? currentOpenFiles[Math.max(0, index - 1)].id : null;
        if (activeFileTab) {
            activateTab(activeFileTab);
        } else {
            document.getElementById('contentArea').innerHTML = '<div class="content-empty"><p>Select a file to view its contents</p></div>';
        }
    }
    
    renderTabs();
}

function renderFileContent(file) {
    const contentArea = document.getElementById('contentArea');
    const lines = file.lines || file.content.split('\n');
    
    let html = '<div class="code-container">';
    lines.forEach((line, index) => {
        const lineNum = index + 1;
        html += `
            <div class="code-line" id="line-${lineNum}">
                <span class="code-line-number">${lineNum}</span>
                <span class="code-line-content">${escapeHtml(line)}</span>
            </div>
        `;
    });
    html += '</div>';
    
    contentArea.innerHTML = html;
}

function scrollToLine(lineNumber) {
    const lineEl = document.getElementById(`line-${lineNumber}`);
    if (lineEl) {
        lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        lineEl.classList.add('highlight');
        setTimeout(() => lineEl.classList.remove('highlight'), 2000);
    }
}

// ============================================
// Index Dialog
// ============================================

function showIndexDialog() {
    document.getElementById('indexDialog').classList.add('active');
    if (currentProjectDir) {
        document.getElementById('projectDir').value = currentProjectDir;
    }
}

function closeIndexDialog() {
    document.getElementById('indexDialog').classList.remove('active');
}

async function buildIndex() {
    const projectDir = document.getElementById('projectDir').value.trim();
    if (!projectDir) {
        alert('Please enter a project directory');
        return;
    }
    
    closeIndexDialog();
    showProgress('Indexing project...');
    
    try {
        const response = await fetch('/api/index', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_dir: projectDir })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentProjectDir = data.project_dir;
            
            // 保存到 localStorage
            try {
                localStorage.setItem('docfetcher_project_dir', projectDir);
            } catch (e) {
                console.warn('Failed to save to localStorage:', e);
            }
            
            // Update UI
            document.getElementById('statusIndicator').classList.add('active');
            document.getElementById('statusText').textContent = 'Indexed';
            document.getElementById('statusBarProject').textContent = currentProjectDir;
            
            // Load tree
            loadTree();
            
            hideProgress();
        } else {
            hideProgress();
            alert(`Index build failed: ${data.detail || data.message || 'Unknown error'}`);
        }
    } catch (error) {
        hideProgress();
        alert(`Index build error: ${error.message}`);
        console.error('Index error:', error);
    }
}

function browseDirectory() {
    // Simple prompt for directory path (cross-platform compatible)
    const path = prompt('Enter project directory path:', currentProjectDir || '');
    if (path) {
        document.getElementById('projectDir').value = path;
    }
}

// ============================================
// Progress
// ============================================

function showProgress(text) {
    document.getElementById('progressText').textContent = text || 'Processing...';
    document.getElementById('progressOverlay').classList.add('active');
}

function hideProgress() {
    document.getElementById('progressOverlay').classList.remove('active');
}

// ============================================
// Sidebar Toggle
// ============================================

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebarVisible = !sidebarVisible;
    sidebar.classList.toggle('collapsed', !sidebarVisible);
}

// ============================================
// Utility Functions
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeAttr(text) {
    if (!text) return '';
    return text.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================
// Keyboard Shortcuts
// ============================================

document.addEventListener('keydown', function(e) {
    // Ctrl+Shift+F: Focus search
    if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        document.getElementById('searchInput').focus();
    }
    // Enter: Execute search when search input is focused
    if (e.key === 'Enter' && document.activeElement === document.getElementById('searchInput')) {
        e.preventDefault();
        executeSearch();
    }
    // Escape: Close dialogs
    if (e.key === 'Escape') {
        closeIndexDialog();
        hideProgress();
    }
    // Ctrl+E: Toggle sidebar
    if (e.ctrlKey && e.key === 'e') {
        e.preventDefault();
        toggleSidebar();
    }
});

// Search input Enter key
document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                executeSearch();
            }
        });
    }
});

// ============================================
// Initialization
// ============================================

async function init() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();
        
        if (data.started && data.project_dir) {
            currentProjectDir = data.project_dir;
            document.getElementById('statusIndicator').classList.add('active');
            document.getElementById('statusText').textContent = 'Indexed';
            document.getElementById('statusBarProject').textContent = data.project_dir;
            document.getElementById('projectDir').value = data.project_dir;
            loadTree();
        } else {
            // 后端没有目录，尝试从 localStorage 读取
            try {
                const savedDir = localStorage.getItem('docfetcher_project_dir');
                if (savedDir) {
                    document.getElementById('projectDir').value = savedDir;
                    currentProjectDir = savedDir;
                }
            } catch (e) {
                console.warn('Failed to read from localStorage:', e);
            }
        }
    } catch (error) {
        console.log('Status check failed:', error);
    }
}

// Start
init();