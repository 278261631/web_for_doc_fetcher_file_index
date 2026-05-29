import os
import sys
import json
import uuid
import logging
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel

class IndexRequest(BaseModel):
    project_dir: str

# 添加项目目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from docfetcher_java import DocFetcherIndex, get_file_tree, get_file_content

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="DocFetcher Web", version="1.0.0")

# 静态文件和模板
static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
templates_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")

if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

templates = Jinja2Templates(directory=templates_dir) if os.path.exists(templates_dir) else None

# 全局索引管理器
index_manager = DocFetcherIndex()

# 当前项目配置
current_project = {
    "project_dir": None,
    "index_dir": None
}

# 索引存储目录
INDEX_BASE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "indexes")
os.makedirs(INDEX_BASE_DIR, exist_ok=True)

# 配置文件路径
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")


def get_index_dir_for_project(project_dir):
    """根据项目目录生成固定的索引目录路径（基于 hash）"""
    import hashlib
    project_hash = hashlib.sha256(project_dir.encode('utf-8')).hexdigest()[:12]
    return os.path.join(INDEX_BASE_DIR, project_hash)


def load_config():
    """从配置文件加载持久化设置"""
    global current_project
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
            saved_dir = config.get('project_dir')
            saved_index = config.get('index_dir')
            if saved_dir and os.path.isdir(saved_dir):
                current_project['project_dir'] = saved_dir
                logger.info(f"从配置文件加载目录: {saved_dir}")
            else:
                logger.info("配置文件中的目录不存在，已忽略")
            if saved_index and os.path.isdir(saved_index):
                current_project['index_dir'] = saved_index
                logger.info(f"从配置文件加载索引目录: {saved_index}")
        except Exception as e:
            logger.warning(f"读取配置文件失败: {e}")


def save_config():
    """将当前设置保存到配置文件"""
    try:
        config = {
            "project_dir": current_project.get('project_dir'),
            "index_dir": current_project.get('index_dir')
        }
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        logger.info(f"配置已保存: {current_project.get('project_dir')}")
    except Exception as e:
        logger.warning(f"保存配置文件失败: {e}")


def auto_load_index():
    """启动时自动加载已有索引"""
    saved_dir = current_project.get('project_dir')
    saved_index = current_project.get('index_dir')
    if saved_index and os.path.isdir(saved_index) and saved_dir:
        try:
            logger.info(f"自动加载已有索引: {saved_index}")
            stats = index_manager.load_index(saved_index, saved_dir)
            logger.info(f"索引加载成功: {stats}")
            return True
        except Exception as e:
            logger.warning(f"自动加载索引失败: {e}，需要重新构建")
            # 清理无效配置
            current_project['index_dir'] = None
    return False


# 启动时加载配置
load_config()
# 启动时自动加载已有索引
auto_load_index()


@app.get("/", response_class=HTMLResponse)
async def index_page(request: Request):
    """主页"""
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/api/index")
async def build_index(req: IndexRequest):
    """构建索引"""
    try:
        project_dir = req.project_dir.strip().strip('"').strip("'")
        if not os.path.exists(project_dir):
            raise HTTPException(status_code=400, detail=f"目录不存在: {project_dir}")
        
        # 使用基于 project_dir 的固定 hash 作为索引目录
        index_dir = get_index_dir_for_project(project_dir)
        
        logger.info(f"Building index for: {project_dir}")
        stats = index_manager.build_index(project_dir, index_dir)
        
        current_project["project_dir"] = project_dir
        current_project["index_dir"] = index_dir
        
        # 保存配置到文件
        save_config()
        
        return {
            "success": True,
            "message": "索引构建成功",
            "stats": stats,
            "index_dir": index_dir,
            "project_dir": project_dir
        }
    except Exception as e:
        logger.error(f"Index build error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/search")
async def search_code(query: str, max_results: int = 50):
    """搜索代码"""
    try:
        if not current_project["project_dir"]:
            raise HTTPException(status_code=400, detail="请先构建索引")
        
        results = index_manager.search(
            query,
            project_dir=current_project["project_dir"],
            max_results=max_results
        )
        
        return {
            "success": True,
            "query": query,
            "count": len(results),
            "results": results
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Search error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/tree")
async def get_tree(path: Optional[str] = None):
    """获取目录树"""
    try:
        target_path = path or current_project["project_dir"]
        if not target_path:
            raise HTTPException(status_code=400, detail="请先构建索引")
        
        if not os.path.exists(target_path):
            raise HTTPException(status_code=404, detail=f"路径不存在: {target_path}")
        
        tree = get_file_tree(target_path, max_depth=4)
        
        return {
            "success": True,
            "tree": tree
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Tree error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/file")
async def get_file(path: str):
    """获取文件内容"""
    try:
        # 如果是相对路径，与当前项目目录拼接
        if not os.path.isabs(path) and current_project["project_dir"]:
            path = os.path.join(current_project["project_dir"], path)
        
        if not os.path.exists(path):
            raise HTTPException(status_code=404, detail=f"文件不存在: {path}")
        
        content_info = get_file_content(path, max_lines=1000)
        
        if "error" in content_info and content_info["error"]:
            if content_info["error"] == "无法解码文件":
                raise HTTPException(status_code=400, detail="二进制文件，无法显示")
        
        return {
            "success": True,
            "path": path,
            **content_info
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File read error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/status")
async def get_status():
    """获取当前状态"""
    return {
        "started": index_manager.is_started,
        "project_dir": current_project["project_dir"],
        "index_dir": current_project["index_dir"],
        "index_loaded": index_manager._index is not None
    }


@app.post("/api/shutdown")
async def shutdown():
    """关闭索引"""
    try:
        index_manager.stop()
        current_project["project_dir"] = None
        current_project["index_dir"] = None
        return {"success": True, "message": "已关闭"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False)
