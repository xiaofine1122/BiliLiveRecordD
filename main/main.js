const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const url = require('url');
const logger = require('electron-log');
const electronStore = require('electron-store');

// 导入自定义模块
const BilibiliApiClient = require('./api-client');
const CookieManager = require('./cookie-manager');
const DownloadManager = require('./download-manager');
const FfmpegManager = require('./ffmpeg-manager');

// 配置日志
// 正确的日志配置方式
logger.transports.file.level = 'info';
logger.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
logger.transports.file.encoding = 'utf8';
logger.transports.file.json = false;
logger.transports.file.fileName = 'app.log';
logger.transports.file.maxSize = 10 * 1024 * 1024;

// 禁用控制台日志，只使用文件日志，避免控制台编码问题
logger.transports.console.level = 'off';

// 全局变量
let mainWindow;
let store;
let cookieManager;
let downloadManager;
let ffmpegManager;
let apiClient;

// 创建窗口
function createWindow() {
  try {
    logger.info('开始创建窗口');
    
    // 检查渲染进程HTML文件是否存在
    const htmlPath = path.join(__dirname, '../renderer/index.html');
    logger.info(`HTML文件路径: ${htmlPath}`);
    logger.info(`HTML文件存在: ${require('fs').existsSync(htmlPath)}`);
    
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 920,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        preload: path.join(__dirname, './preload.js')
      },
      // 隐藏默认菜单栏
      autoHideMenuBar: true,
      // 设置窗口图标
      icon: path.join(__dirname, '../assets/icons/icon.ico')
    });

    logger.info('窗口对象创建成功');
    
    // 加载渲染进程页面
    mainWindow.loadURL(url.format({
      pathname: htmlPath,
      protocol: 'file:',
      slashes: true
    }));

    logger.info('正在加载渲染进程页面');
    
    // 根据环境变量决定是否打开调试工具
    if (process.env.NODE_ENV === 'development') {
      logger.info('当前处于开发模式，正在打开开发者工具...');
      mainWindow.webContents.openDevTools();
    } else {
      logger.info('当前处于生产模式，开发者工具已关闭.');
    }
    
    // 监听页面加载完成事件
    mainWindow.webContents.on('did-finish-load', () => {
      logger.info('渲染进程页面加载完成');
    });

    // 监听页面加载失败事件
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      logger.error(`渲染进程页面加载失败: ${errorCode} - ${errorDescription}`);
    });

    // 窗口关闭事件
    mainWindow.on('closed', () => {
      logger.info('主窗口已关闭');
      mainWindow = null;
    });
    
    // 窗口显示事件
    mainWindow.on('show', () => {
      logger.info('主窗口已显示');
    });
    
  } catch (error) {
    logger.error('窗口创建失败:', error);
    dialog.showErrorBox('窗口创建失败', `创建窗口时发生错误: ${error.message}`);
  }
}

// 初始化应用
function initializeApp() {
  try {
    // 初始化存储
    store = new electronStore();
    logger.info('应用存储初始化成功');

    // 初始化管理器
    cookieManager = new CookieManager();
    downloadManager = new DownloadManager(store.get('maxConcurrent', 3));
    
    // 尝试初始化ffmpegManager
    try {
      // 获取FFmpeg路径，根据是否打包调整路径
      const defaultFfmpegPath = app.isPackaged 
        ? path.join(process.resourcesPath, 'ffmpeg/ffmpeg.exe') 
        : path.join(__dirname, '../ffmpeg/ffmpeg.exe');
      
      ffmpegManager = new FfmpegManager(store.get('ffmpegPath', defaultFfmpegPath));
      logger.info('FFmpeg管理器初始化成功');
    } catch (ffmpegError) {
      logger.error('FFmpeg初始化失败:', ffmpegError);
      ffmpegManager = null;
      dialog.showMessageBox({
        type: 'warning',
        title: 'FFmpeg缺失',
        message: 'FFmpeg可执行文件不存在或不可访问',
        detail: `您需要在设置中配置有效的FFmpeg路径才能使用下载功能。\n\n错误详情: ${ffmpegError.message}`
      });
    }
    
    apiClient = new BilibiliApiClient(cookieManager.getCookies());

    logger.info('应用管理器初始化成功');
  } catch (error) {
    logger.error('应用初始化失败:', error);
    dialog.showErrorBox('初始化失败', `应用初始化时发生错误: ${error.message}`);
    app.quit();
  }
}

// 设置IPC通信
function setupIPC() {
  // Cookie管理相关
  ipcMain.on('load-cookie-from-text', (event, cookieText) => {
    try {
      const result = cookieManager.loadFromText(cookieText);
      event.reply('cookie-loaded', { success: true, cookies: result });
    } catch (error) {
      event.reply('cookie-loaded', { success: false, error: error.message });
    }
  });

  ipcMain.on('get-cookies', (event) => {
    const cookies = cookieManager.getCookies();
    event.reply('cookies-returned', cookies);
  });



  // API调用相关
  ipcMain.handle('api:fetch-vod-list', async (event, uid, page) => {
    try {
      // 更新API客户端的Cookie
      apiClient.cookies = cookieManager.getCookies();
      return await apiClient.fetchVodList(uid, page);
    } catch (error) {
      logger.error('获取回放列表失败:', error);
      throw error;
    }
  });

  ipcMain.handle('api:fetch-vod-stream-info', async (event, liveKey, startTime, endTime, uid) => {
    try {
      // 更新API客户端的Cookie
      apiClient.cookies = cookieManager.getCookies();
      return await apiClient.fetchVodStreamInfo(liveKey, startTime, endTime, uid);
    } catch (error) {
      logger.error('获取直播流信息失败:', error);
      throw error;
    }
  });

  // 下载相关
  ipcMain.handle('download:add', async (event, vodInfo) => {
    try {
      if (!ffmpegManager) {
        throw new Error('FFmpeg未配置或配置无效。请在设置中配置有效的FFmpeg路径后重试。');
      }
      
      const savePath = store.get('savePath', path.join(app.getPath('downloads'), 'B站直播回放'));
      const task = await downloadManager.addTask(vodInfo, savePath, apiClient, ffmpegManager);
      return task;
    } catch (error) {
      logger.error('添加下载任务失败:', error);
      throw error;
    }
  });


  ipcMain.handle('download:cancel', (event, taskId) => {
    return downloadManager.cancelTask(taskId);
  });

  ipcMain.on('remove-download-task', (event, taskId) => {
    downloadManager.removeTask(taskId);
  });

  ipcMain.handle('download:get-all', () => {
    return downloadManager.getAllTasks();
  });

  // 设置相关
  ipcMain.handle('settings:get', () => {
    // 获取FFmpeg路径，根据是否打包调整路径
    const defaultFfmpegPath = app.isPackaged 
      ? path.join(process.resourcesPath, 'ffmpeg/ffmpeg.exe') 
      : path.join(__dirname, '../ffmpeg/ffmpeg.exe');
    
    return {
      savePath: store.get('savePath', path.join(app.getPath('downloads'), 'B站直播回放')),
      maxConcurrent: store.get('maxConcurrent', 3),
      tolerance: store.get('tolerance', 0.01),
      ffmpegPath: store.get('ffmpegPath', defaultFfmpegPath),
      retryCount: store.get('retryCount', 3)
    };
  });

  ipcMain.handle('settings:save', (event, settings) => {
    if (settings.savePath) {
      const oldSavePath = store.get('savePath');
      if (oldSavePath !== settings.savePath) {
        logger.info(`下载保存路径已修改: ${oldSavePath || '默认路径'} -> ${settings.savePath}`);
        store.set('savePath', settings.savePath);
      }
    }
    if (settings.maxConcurrent) {
      const oldMaxConcurrent = store.get('maxConcurrent');
      if (oldMaxConcurrent !== settings.maxConcurrent) {
        logger.info(`最大并发数已修改: ${oldMaxConcurrent || 3} -> ${settings.maxConcurrent}`);
        store.set('maxConcurrent', settings.maxConcurrent);
        downloadManager.setMaxConcurrent(settings.maxConcurrent);
      }
    }
    if (settings.tolerance) {
      const oldTolerance = store.get('tolerance');
      if (oldTolerance !== settings.tolerance) {
        logger.info(`时长容差已修改: ${oldTolerance || 0.01} -> ${settings.tolerance}`);
        store.set('tolerance', settings.tolerance);
      }
    }
    if (settings.ffmpegPath) {
      const oldFfmpegPath = store.get('ffmpegPath');
      if (oldFfmpegPath !== settings.ffmpegPath) {
        logger.info(`FFmpeg路径已修改: ${oldFfmpegPath || '默认路径'} -> ${settings.ffmpegPath}`);
        store.set('ffmpegPath', settings.ffmpegPath);
        ffmpegManager.setFfmpegPath(settings.ffmpegPath);
      }
    }
    if (settings.retryCount) {
      const oldRetryCount = store.get('retryCount');
      if (oldRetryCount !== settings.retryCount) {
        logger.info(`重试次数已修改: ${oldRetryCount || 3} -> ${settings.retryCount}`);
        store.set('retryCount', settings.retryCount);
      }
    }
    return true;
  });
  
  // 文件对话框相关
  ipcMain.on('show-open-dialog', async (event, dialogOptions) => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: dialogOptions.properties || ['openDirectory'],
        filters: dialogOptions.filters || []
      });
      
      // 将结果发送回渲染进程
      event.reply('open-dialog-closed', {
        canceled: result.canceled,
        filePaths: result.filePaths,
        dialogType: dialogOptions.dialogType
      });
    } catch (error) {
      logger.error('打开文件对话框失败:', error);
      event.reply('open-dialog-closed', {
        canceled: true,
        dialogType: dialogOptions.dialogType
      });
    }
  });

  // 日志相关
  ipcMain.handle('log:get', () => {
    // 简单实现，实际项目中可能需要更复杂的日志查询
    return logger.transports.file.fileName;
  });

  // 下载任务添加事件
  downloadManager.on('download-task-added', (task) => {
    if (mainWindow) {
      mainWindow.webContents.send('download-task-added', { task: task });
    }
  });

  // 下载任务开始事件
  downloadManager.on('download-task-started', (task) => {
    if (mainWindow) {
      mainWindow.webContents.send('download-task-started', { taskId: task.id });
    }
  });

  // 下载进度更新事件
  downloadManager.on('download-progress', (taskId, progress) => {
    if (mainWindow) {
      mainWindow.webContents.send('download-task-progress', { taskId: taskId, progress: progress });
    }
  });

  // 下载状态更新事件
  downloadManager.on('download-task-updated', (task) => {
    if (mainWindow) {
      mainWindow.webContents.send('download-task-progress', { taskId: task.id, progress: task.progress });
    }
  });

  // 下载完成事件
  downloadManager.on('download-task-completed', (task) => {
    if (mainWindow) {
      mainWindow.webContents.send('download-task-completed', { taskId: task.id });
    }
  });

  // 下载错误事件
  downloadManager.on('download-task-failed', (taskId, errorMessage) => {
    if (mainWindow) {
      mainWindow.webContents.send('download-task-failed', { taskId: taskId, error: errorMessage });
    }
  });


  // 下载任务取消事件
  downloadManager.on('download-task-cancelled', (result) => {
    if (mainWindow) {
      mainWindow.webContents.send('download-task-cancelled', result);
    }
  });

  // 下载任务移除事件
  downloadManager.on('download-task-removed', (result) => {
    if (mainWindow) {
      mainWindow.webContents.send('download-task-removed', result);
    }
  });
}

// 应用生命周期事件
app.on('ready', () => {
  logger.info('应用启动');
  initializeApp();
  createWindow();
  setupIPC();
});

app.on('window-all-closed', () => {
  logger.info('所有窗口已关闭');
  // 在Windows上，我们希望应用窗口关闭后仍然保持后台运行
  // 这样下载任务可以继续执行
  // 如果用户想完全退出应用，可以使用任务栏图标或托盘菜单
  // 在macOS上，除非用户用Cmd+Q确定地退出，否则应用及其菜单栏会保持激活
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // 在macOS上，当点击dock图标并且没有其他窗口打开时，重新创建一个窗口
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('quit', () => {
  logger.info('应用退出');
});
