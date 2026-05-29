// 全局状态
let currentProjectDir = null;

// 文件图标映射
const fileIcons = {
    '.c': '📄', '.h': '📋', '.cpp': '📄', '.hpp': '📋',
    '.py': '🐍', '.java': '☕', '.js': '📜', '.ts': '📜',
    '.html': '🌐', '.css': '🎨', '.json': '📊', '.xml': '📰',
    '.bat': '⚙️', '.sh': '⚙️', '.md': '📝', '.txt': '📄',
    '.ini': '⚙️', '.cfg': '⚙️', '.conf': '⚙️', '.yml': '⚙️',
    '.yaml': '⚙️', '.toml': '⚙️', '.make': '🔨', '.mk': '🔨',
    '.s': '📜', '.S': '📜', '.asm': '📜', '.ld': '📋',
};

function getFileIcon(filename) {
    const ext = '.' + filename.split('.').pop().toLowerCase();
    return fileIcons[ext] || '📄';
}

// 显示索引对话框
function showIndexDialog() {
    document.getElementById('indexModal').classList.add('active');
    document.getElementById('indexResult').style.display = 'none';
    document.getElementById('indexProgress').style.display = 'none';
}

function closeIndexDialog() {
    document.getElementById('indexModal').classList.remove('active');
}

// 构建索引
async function buildIndex() {
    const projectDir = document.getElementById('projectDir').value.trim();
    if (!projectDir) {
        alert('请输入项目目录路径');
        return;
    }

    const progressEl = document.getElementById('indexProgress');
    const resultEl = document.getElementById('indexResult');
    const btn = document.querySelector('.btn-primary');

    progressEl.style.display = 'block';
    resultEl.style.display = 'none';
    btn.disabled = true;

    try {
        const response = await fetch('/api/index', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_dir: projectDir })
        });

        const data = await response.json();
        progressEl.style.display = 'none';

        if (data.success) {
            resultEl.className = 'result-container success';
            resultEl.innerHTML = '<strong>✅ 索引构建成功！</strong><br>文档数: ' + data.stats.num_docs + ' | 文件夹数: ' + data.stats.num_folders + '<br>项目: ' + data.project_dir;
            resultEl.style.display = 'block';

            currentProjectDir = data.project_dir;
            document.getElementById('statusIndicator').classList.add('active');

            setTimeout(function() {
                closeIndexDialog();
                loadTree();
            }, 1000);
        } else {
            throw new Error(data.detail || '索引构建失败');
        }
    } catch (error) {
        progressEl.style.display = 'none';
        resultEl.className = 'result-container error';
        resultEl.innerHTML = '<strong>❌ 错误:</strong> ' + error.message;
        resultEl.style.display = 'block';
    } finally {
        btn.disabled = false;
    }
}

// 搜索
async function search() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;

    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = '<div class="loading">搜索中</div>';

    try {
        const response = await fetch('/api/search?query=' + encodeURIComponent(query) + '&max_results=50');
        const data = await response.json();

        if (data.success) {
            renderSearchResults(data);
        } else {
            contentArea.innerHTML = '<div class="empty-state"><p>搜索失败: ' + data.detail + '</p></div>';
        }
    } catch (error) {
        contentArea.innerHTML = '<div class="empty-state"><p>搜索出错: ' + error.message + '</p></div>';
    }
}

// 渲染搜索结果
function renderSearchResults(data) {
    const contentArea = document.getElementById('contentArea');
    
    var html = '<div class="search-results">' +
        '<div class="search-header">' +
        '<h3>🔍 搜索结果: "' + data.query + '"</h3>' +
        '<span class="count">' + data.count + ' 个结果</span>' +
        '</div>';

    if (data.count === 0) {
        html += '<div class="empty-state"><p>未找到匹配的结果</p></div>';
    } else {
        data.results.forEach(function(result) {
            var preview = result.content_preview ? 
                result.content_preview.substring(0, 200).replace(/</g, '&lt;').replace(/>/g, '&gt;') : 
                '无预览内容';
            var size = result.file_size ? formatSize(result.file_size) : '';
            var safeFilename = result.filename.replace(/\\/g, '/').replace(/'/g, "\\'");
            
            html += '<div class="result-item" onclick="openFile(\'' + safeFilename + '\')">' +
                '<div class="result-filename">' + getFileIcon(result.filename) + ' ' + result.filename + '</div>' +
                '<div class="result-preview">' + preview + '</div>' +
                (size ? '<div class="result-meta">' + size + '</div>' : '') +
                '</div>';
        });
    }

    html += '</div>';
    contentArea.innerHTML = html;
}

// 加载文件树
async function loadTree() {
    const treeContainer = document.getElementById('treeContainer');
    treeContainer.innerHTML = '<div class="loading">加载文件树</div>';

    try {
        var pathParam = currentProjectDir ? '?path=' + encodeURIComponent(currentProjectDir) : '';
        const response = await fetch('/api/tree' + pathParam);
        const data = await response.json();

        if (data.success) {
            renderTree(data.tree, treeContainer);
        } else {
            treeContainer.innerHTML = '<div class="empty-state"><p>加载失败: ' + data.detail + '</p></div>';
        }
    } catch (error) {
        treeContainer.innerHTML = '<div class="empty-state"><p>加载出错: ' + error.message + '</p></div>';
    }
}

// 渲染文件树
function renderTree(node, container, depth) {
    if (!node) return;
    if (depth === undefined) depth = 0;
    
    if (depth === 0) container.innerHTML = '';

    // 渲染顶层文件
    if (depth === 0 && node.files && node.files.length > 0) {
        var rootFilesDiv = document.createElement('div');
        rootFilesDiv.className = 'tree-files';
        rootFilesDiv.style.paddingLeft = '8px';
        node.files.forEach(function(file) {
            var fileDiv = document.createElement('div');
            fileDiv.className = 'tree-file';
            fileDiv.innerHTML = '<span class="icon">' + getFileIcon(file.name) + '</span>' + file.name;
            fileDiv.onclick = function() { openFile(file.path); };
            rootFilesDiv.appendChild(fileDiv);
        });
        container.appendChild(rootFilesDiv);
    }

    if (node.children) {
        node.children.forEach(function(child) {
            var folderDiv = document.createElement('div');
            folderDiv.className = 'tree-item';
            var paddingLeft = 8 + depth * 16;
            folderDiv.innerHTML = '<div class="tree-folder" style="padding-left: ' + paddingLeft + 'px" onclick="toggleFolder(this)">' +
                '<span class="toggle">▶</span>' +
                '<span class="name">📁 ' + child.name + '</span>' +
                '</div>' +
                '<div class="tree-children" style="display:none;"></div>';
            container.appendChild(folderDiv);

            // 渲染文件
            if (child.files && child.files.length > 0) {
                var filesDiv = document.createElement('div');
                filesDiv.className = 'tree-files';
                child.files.forEach(function(file) {
                    var fileDiv = document.createElement('div');
                    fileDiv.className = 'tree-file';
                    fileDiv.innerHTML = '<span class="icon">' + getFileIcon(file.name) + '</span>' + file.name;
                    fileDiv.onclick = function() { openFile(file.path); };
                    filesDiv.appendChild(fileDiv);
                });
                folderDiv.querySelector('.tree-children').appendChild(filesDiv);
            }

            // 递归渲染子文件夹
            if (child.children && child.children.length > 0) {
                var subContainer = folderDiv.querySelector('.tree-children');
                child.children.forEach(function(subChild) {
                    renderSubTree(subChild, subContainer, depth + 1);
                });
            }
        });
    }
}

function renderSubTree(node, container, depth) {
    var folderDiv = document.createElement('div');
    folderDiv.className = 'tree-item';
    var paddingLeft = 8 + depth * 16;
    folderDiv.innerHTML = '<div class="tree-folder" style="padding-left: ' + paddingLeft + 'px" onclick="toggleFolder(this)">' +
        '<span class="toggle">▶</span>' +
        '<span class="name">📁 ' + node.name + '</span>' +
        '</div>' +
        '<div class="tree-children" style="display:none;"></div>';
    container.appendChild(folderDiv);

    if (node.files && node.files.length > 0) {
        var filesDiv = document.createElement('div');
        filesDiv.className = 'tree-files';
        node.files.forEach(function(file) {
            var fileDiv = document.createElement('div');
            fileDiv.className = 'tree-file';
            fileDiv.innerHTML = '<span class="icon">' + getFileIcon(file.name) + '</span>' + file.name;
            fileDiv.onclick = function() { openFile(file.path); };
            filesDiv.appendChild(fileDiv);
        });
        folderDiv.querySelector('.tree-children').appendChild(filesDiv);
    }

    if (node.children && node.children.length > 0) {
        var subContainer = folderDiv.querySelector('.tree-children');
        node.children.forEach(function(subChild) {
            renderSubTree(subChild, subContainer, depth + 1);
        });
    }
}

// 切换文件夹展开/折叠
function toggleFolder(element) {
    var children = element.nextElementSibling;
    if (children) {
        var isHidden = children.style.display === 'none';
        children.style.display = isHidden ? 'block' : 'none';
        element.querySelector('.toggle').textContent = isHidden ? '▼' : '▶';
    }
}

// 打开文件
async function openFile(filePath) {
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = '<div class="loading">加载文件</div>';

    try {
        const response = await fetch('/api/file?path=' + encodeURIComponent(filePath));
        const data = await response.json();

        if (data.success) {
            renderFileContent(data);
        } else {
            contentArea.innerHTML = '<div class="empty-state"><p>无法打开文件: ' + data.detail + '</p></div>';
        }
    } catch (error) {
        contentArea.innerHTML = '<div class="empty-state"><p>打开文件出错: ' + error.message + '</p></div>';
    }
}

// 渲染文件内容
function renderFileContent(data) {
    const contentArea = document.getElementById('contentArea');
    var lines = data.content.split('\n');
    
    var html = '<div class="search-results">' +
        '<div class="search-header">' +
        '<h3>📄 ' + data.path.split('/').pop().split('\\').pop() + '</h3>' +
        '<span class="count">' + data.lines + ' 行</span>' +
        '</div>' +
        '<div class="line-numbers">' +
        '<div class="line-nums">';
    
    lines.forEach(function(_, i) {
        html += (i + 1) + '\n';
    });
    
    html += '</div><div class="line-content"><pre><code>';
    
    lines.forEach(function(line) {
        html += line.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '\n';
    });
    
    html += '</code></pre></div></div></div>';
    contentArea.innerHTML = html;
}

// 格式化文件大小
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// 页面加载完成后检查状态
window.addEventListener('DOMContentLoaded', async function() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();
        if (data.project_dir) {
            currentProjectDir = data.project_dir;
            document.getElementById('statusIndicator').classList.add('active');
            document.getElementById('projectDir').value = data.project_dir;
            loadTree();
        }
    } catch (error) {
        console.log('Status check failed:', error);
    }
});
