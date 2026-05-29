import os
import sys
import glob
import logging
from pathlib import Path
from typing import List, Dict, Optional, Any

logger = logging.getLogger(__name__)

JVM_PATH = "C:/Java/jdk-11.0.18/bin/server/jvm.dll"
DOCFETCHER_HOME = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docfetcher-src", "build", "DocFetcher-1.1.9")

def _build_classpath():
    lib_dir = os.path.join(DOCFETCHER_HOME, "lib")
    jars = glob.glob(os.path.join(lib_dir, "*.jar"))
    for subdir in glob.glob(os.path.join(lib_dir, "*")):
        if os.path.isdir(subdir):
            jars.extend(glob.glob(os.path.join(subdir, "*.jar")))
    jars = list(set(jars))
    # 添加编译后的 class 文件目录
    src_build = os.path.join(os.path.dirname(DOCFETCHER_HOME), "build", "tmp", "src")
    if os.path.exists(src_build):
        jars.append(src_build)
    logger.info(f"Classpath: {len(jars)} entries")
    return os.pathsep.join(jars)

def _start_jvm():
    import jpype
    import jpype.imports
    if jpype.isJVMStarted():
        return
    classpath = _build_classpath()
    # 直接使用指定的 JVM 路径
    jvm_path = JVM_PATH if os.path.exists(JVM_PATH) else None
    if jvm_path is None:
        # 尝试从 JAVA_HOME 获取
        java_home = os.environ.get('JAVA_HOME', '')
        if java_home:
            jvm_path = os.path.join(java_home, 'jre', 'bin', 'server', 'jvm.dll')
            if not os.path.exists(jvm_path):
                jvm_path = os.path.join(java_home, 'bin', 'server', 'jvm.dll')
    if jvm_path is None:
        raise Exception("Cannot find JVM. Set JAVA_HOME or check JVM_PATH")
    logger.info(f"Using JVM: {jvm_path}")
    logger.info(f"Classpath has {len(classpath)} chars")
    # 使用 -Djava.class.path 参数传递 classpath
    jpype.startJVM(
        jvm_path,
        "-Djava.class.path=" + classpath,
        "-Djava.awt.headless=true",
        "-Xmx2G",
        convertStrings=False,
    )
    logger.info("JVM started")

def _stop_jvm():
    import jpype
    if jpype.isJVMStarted():
        jpype.shutdownJVM()
        logger.info("JVM stopped")

class DocFetcherIndex:
    def __init__(self):
        self._started = False
        self._index = None
        self._index_dir = None
        self._root_dir = None

    def start(self):
        if self._started:
            return
        _start_jvm()
        import jpype.imports
        from net.sourceforge.docfetcher.util import AppUtil
        AppUtil.Const.autoInit()
        self._started = True
        logger.info("DocFetcher initialized")

    def stop(self):
        self._started = False
        self._index = None
        _stop_jvm()

    @property
    def is_started(self):
        return self._started

    def build_index(self, project_dir, index_dir, force=False):
        """构建索引。如果 index_dir 已存在且 force=False，则直接加载已有索引"""
        if not self._started:
            self.start()
        import jpype.imports
        from net.sourceforge.docfetcher.model.index.file import FileIndex
        from java.io import File as JavaFile
        os.makedirs(index_dir, exist_ok=True)
        # 如果索引目录已存在且有文件，且不是强制重建，则直接加载
        if os.path.exists(index_dir) and not force:
            existing_files = [f for f in os.listdir(index_dir)
                             if os.path.isfile(os.path.join(index_dir, f))]
            if existing_files:
                logger.info(f"Index already exists at {index_dir}, loading...")
                return self.load_index(index_dir, project_dir)
        # 清空旧索引文件（只删除文件，保留子目录）
        if os.path.exists(index_dir):
            for f in os.listdir(index_dir):
                fp = os.path.join(index_dir, f)
                if os.path.isfile(fp):
                    os.remove(fp)
        project_file = JavaFile(project_dir)
        index_file = JavaFile(index_dir)
        logger.info(f"Building index for {project_dir}")
        self._index = FileIndex(index_file, project_file)
        self._index.update(None, None)
        self._index_dir = index_dir
        self._root_dir = project_dir
        stats = self._get_stats()
        logger.info(f"Index built: {stats}")
        return stats

    def load_index(self, index_dir, project_dir=None):
        """加载已有索引目录（仅恢复路径信息，搜索使用文件扫描）"""
        if not os.path.exists(index_dir):
            raise FileNotFoundError(f"Index directory not found: {index_dir}")
        self._index_dir = index_dir
        self._root_dir = project_dir
        # 设置 _index 标记为 True，表示索引已加载（搜索使用文件扫描，不需要 Java 对象）
        self._index = True
        self._started = True
        logger.info(f"Index directory restored: {index_dir}")
        return {"num_docs": -1, "num_folders": -1, "errors": [], "note": "使用文件扫描搜索"}

    def _get_stats(self):
        if not self._index:
            return {"num_docs": 0, "num_folders": 0, "errors": []}
        root = self._index.getRootFolder()
        num_docs = self._count_docs(root)
        num_folders = self._count_folders(root)
        errors = self._collect_errors(root)
        return {"num_docs": num_docs, "num_folders": num_folders, "errors": errors[:10]}

    def _count_docs(self, node):
        count = 0
        if node is None:
            return 0
        try:
            count = node.getDocumentCount()
        except Exception:
            pass
        children = node.getChildren()
        if children is not None:
            for child in children:
                count += self._count_docs(child)
        return count

    def _count_folders(self, node):
        count = 0
        if node is None:
            return 0
        children = node.getChildren()
        if children is not None:
            for child in children:
                count += 1
                count += self._count_folders(child)
        return count

    def _collect_errors(self, node, max_errors=50):
        errors = []
        if node is None or len(errors) >= max_errors:
            return errors
        try:
            if node.hasErrors():
                errs = node.getErrors()
                if errs is not None:
                    for e in errs:
                        errors.append(str(e))
        except Exception:
            pass
        children = node.getChildren()
        if children is not None:
            for child in children:
                errors.extend(self._collect_errors(child, max_errors))
        return errors[:max_errors]

    def search(self, query, project_dir=None, index_dir=None, max_results=50):
        if not self._started:
            self.start()
        results = []
        # 使用文件扫描进行搜索（可靠且快速）
        search_dir = project_dir or self._root_dir
        if search_dir:
            all_files = self._get_all_files(search_dir)
            for fpath in all_files:
                try:
                    for encoding in ["utf-8", "gbk", "latin-1"]:
                        try:
                            with open(fpath, "r", encoding=encoding, errors="ignore") as f:
                                content = f.read(5000)
                            if query.lower() in content.lower():
                                rel_path = os.path.relpath(fpath, search_dir)
                                results.append({
                                    "filename": rel_path,
                                    "content_preview": content[:2000],
                                    "file_size": os.path.getsize(fpath),
                                    "score": 1.0,
                                })
                                break
                        except Exception:
                            continue
                except Exception:
                    continue
                if len(results) >= max_results:
                    break
        logger.info(f"Search: {len(results)} results")
        return results[:max_results]


    def _get_all_files(self, project_dir, extensions=None):
        """获取项目目录中的所有文本文件"""
        if extensions is None:
            extensions = ['.c', '.h', '.cpp', '.hpp', '.cc', '.cxx', '.txt', '.xml', '.json', '.py', '.java', '.ini', '.cfg', '.yml', '.md', '.html', '.css', '.sql', '.sh', '.bat', '.cmake']
        files = []
        for root, dirs, filenames in os.walk(project_dir):
            # 跳过隐藏目录
            dirs[:] = [d for d in dirs if not d.startswith('.')]
            for fname in filenames:
                if any(fname.endswith(ext) for ext in extensions):
                    files.append(os.path.join(root, fname))
        return files

    def _get_lucene_version(self):
        import jpype.imports
        from net.sourceforge.docfetcher.model.index import IndexRegistry
        return IndexRegistry.LUCENE_VERSION

    def _doc_to_dict(self, doc, searcher, score_doc):
        try:
            result = {}
            fields = doc.getFields()
            for field in fields:
                name = field.name()
                value = field.stringValue()
                if value:
                    result[name] = value
            if "filename" not in result:
                return None
            result["score"] = score_doc.score
            return result
        except Exception as e:
            logger.debug(f"Error converting doc: {e}")
            return None

    def _add_file_content(self, result, project_dir):
        try:
            filename = result.get("filename", "")
            file_path = os.path.join(project_dir, filename)
            if os.path.exists(file_path):
                for encoding in ["utf-8", "gbk", "latin-1"]:
                    try:
                        with open(file_path, "r", encoding=encoding, errors="ignore") as f:
                            content = f.read(2000)
                        result["content_preview"] = content
                        result["file_size"] = os.path.getsize(file_path)
                        break
                    except Exception:
                        continue
        except Exception as e:
            logger.debug(f"Error reading file content: {e}")

    def get_folder_structure(self, index_dir=None):
        if not self._started:
            self.start()
        if self._index:
            root = self._index.getRootFolder()
            return self._folder_to_tree(root)
        return {"name": "", "children": [], "files": []}

    def _folder_to_tree(self, node):
        if node is None:
            return {"name": "", "children": [], "files": []}
        result = {"name": str(node.getName()), "children": [], "files": []}
        children = node.getChildren()
        if children is not None:
            for child in children:
                result["children"].append(self._folder_to_tree(child))
        docs = node.getDocuments()
        if docs is not None:
            for doc in docs:
                try:
                    filename = str(doc.getFilename())
                    result["files"].append({"name": filename, "path": filename, "has_error": doc.hasError()})
                except Exception:
                    pass
        return result

    def get_file_content(self, filename, project_dir=None):
        p_dir = project_dir or self._root_dir
        if not p_dir:
            return None
        file_path = os.path.join(p_dir, filename)
        if not os.path.exists(file_path):
            return None
        for encoding in ["utf-8", "gbk", "latin-1"]:
            try:
                with open(file_path, "r", encoding=encoding, errors="ignore") as f:
                    return f.read()
            except Exception:
                continue
        return None

_index_manager = None

def get_index_manager():
    global _index_manager
    if _index_manager is None:
        _index_manager = DocFetcherIndex()
    return _index_manager

def init_docfetcher():
    mgr = get_index_manager()
    mgr.start()
    return mgr


def get_file_tree(root_dir, max_depth=5):
    """获取目录树结构（基于文件系统）"""
    import os
    
    def _build_tree(dir_path, current_depth):
        if current_depth > max_depth:
            return None
        
        try:
            entries = sorted(os.listdir(dir_path))
        except PermissionError:
            return None
        
        children = []
        files = []
        
        for entry in entries:
            full_path = os.path.join(dir_path, entry)
            # 跳过隐藏文件和常见非代码目录
            if entry.startswith('.') or entry in ['node_modules', '__pycache__', '.git', 'build', 'dist']:
                continue
            
            if os.path.isdir(full_path):
                child = {
                    'name': entry,
                    'path': full_path,
                    'type': 'folder',
                    'children': [],
                    'files': []
                }
                sub_tree = _build_tree(full_path, current_depth + 1)
                if sub_tree:
                    child['children'] = sub_tree.get('children', [])
                    child['files'] = sub_tree.get('files', [])
                children.append(child)
            else:
                files.append({
                    'name': entry,
                    'path': full_path,
                    'type': 'file',
                    'size': os.path.getsize(full_path)
                })
        
        return {
            'name': os.path.basename(dir_path),
            'path': dir_path,
            'children': children,
            'files': files
        }
    
    return _build_tree(root_dir, 0)


def get_file_content(file_path, max_lines=500):
    """读取文件内容"""
    try:
        for encoding in ['utf-8', 'gbk', 'latin-1']:
            try:
                with open(file_path, 'r', encoding=encoding, errors='ignore') as f:
                    lines = f.readlines()
                lines = lines[:max_lines]
                content = ''.join(lines)
                return {
                    'content': content,
                    'lines': len(lines),
                    'encoding': encoding,
                    'truncated': len(f.readlines()) > 0 if False else False
                }
            except UnicodeDecodeError:
                continue
        return {'content': '', 'error': '无法解码文件', 'lines': 0}
    except Exception as e:
        return {'content': '', 'error': str(e), 'lines': 0}


def shutdown_docfetcher():
    global _index_manager
    if _index_manager:
        _index_manager.stop()
        _index_manager = None