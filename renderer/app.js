// 导入ipcRenderer
const { ipcRenderer } = require('electron');

// 全局变量
let uidManager = null;
let vodList = null;
let downloadQueue = null;
let cookieSettings = null;
let logView = null;

// 页面加载完成后初始化
$(function() {
  console.log('页面加载完成');
  
  // 初始化组件
  initComponents();
  
  // 加载本地数据
  loadLocalData();
  
  // 绑定全局事件
  bindGlobalEvents();
});

/**
 * 初始化所有组件
 */
function initComponents() {
  // 初始化日志组件
  logView = new LogView();
  logView.init();
  
  // 初始化UID管理组件
  uidManager = new UidManager();
  uidManager.init();
  
  // 初始化Cookie设置组件
  cookieSettings = new CookieSettings();
  cookieSettings.init();
  
  // 初始化回放列表组件
  vodList = new VodList();
  vodList.init();
  
  // 初始化下载队列组件
  downloadQueue = new DownloadQueue();
  downloadQueue.init();
  
  // 绑定组件间的事件
  bindComponentEvents();
}

/**
 * 绑定组件间的事件
 */
function bindComponentEvents() {
  // 当UID列表变化时，自动刷新回放列表
  uidManager.setOnUidChange(() => {
    logView.log('UID列表已更新，刷新回放列表');
    vodList.refreshVodList();
  });
  
  // 当点击下载按钮时，添加到下载队列
  vodList.setOnDownloadClick((vod) => {
    const task = {
      title: vod.title || `主播${vod.uid}的直播回放`,
      vod: vod,
      status: 'pending',
      progress: 0
    };
    
    ipcRenderer.send('add-download-task', task);
  });
  
  // 当下载任务状态变化时，更新界面
  downloadQueue.setOnTaskStatusChange(() => {
    // 这里可以添加全局状态更新逻辑
  });
}

/**
 * 加载本地数据
 */
function loadLocalData() {
  // 获取设置
  loadSettings();
  
  // 获取Cookie
  loadCookies();
}

/**
 * 绑定全局事件
 */
function bindGlobalEvents() {
  // 保存设置按钮事件
  $('#saveSettingsBtn').on('click', () => {
    saveSettings();
  });
  
  // 浏览保存路径按钮事件
  $('#browsePathBtn').on('click', () => {
    ipcRenderer.send('open-save-dialog');
  });
  
  // 浏览Cookie文件按钮事件
  $('#selectCookieFileBtn').on('click', () => {
    ipcRenderer.send('open-file-dialog', {
      filters: [{ name: '文本文件', extensions: ['txt', 'cookie'] }]
    });
  });
  
  // Cookie输入框事件（自动加载）
  $('#cookieInput').on('input', () =>  {
    const cookieText = $('#cookieInput').val()?.trim();
    if (cookieText) {
      cookieSettings.loadCookieFromText(cookieText);
    }
  });
  
  // 清空日志按钮事件
  $('#clearLogBtn').on('click', () => {
    logView.clear();
  });
  
  // 监听设置对话框关闭事件
  $('#settingsModal').on('hidden.bs.modal', () => {
    // 可以在这里添加清理逻辑
  });
  
  // 监听主进程发来的消息
  ipcRenderer.on('update-status', (event, status) => {
    $('#statusText').text(status);
  });
  
  ipcRenderer.on('save-dialog-result', (event, result) => {
    if (result.canceled === false) {
      $('#savePath').val(result.filePaths[0]);
    }
  });
  
  ipcRenderer.on('file-dialog-result', (event, result) => {
    if (result.canceled === false) {
      $('#cookieFile').val(result.filePaths[0]);
    }
  });
}

/**
 * 加载设置
 */
function loadSettings() {
  ipcRenderer.send('get-settings');
  ipcRenderer.on('settings-returned', (event, settings) => {
    $('#savePath').val(settings.savePath);
  });
}

/**
 * 保存设置
 */
function saveSettings() {
  const settings = {
    savePath: $('#savePath').val()
  };
  
  ipcRenderer.send('save-settings', settings);
  logView.log('设置已保存');
}

/**
 * 加载Cookie
 */
function loadCookies() {
  ipcRenderer.send('get-cookies');
  ipcRenderer.on('cookies-returned', (event, cookies) => {
    // 如果有SESSDATA，显示在输入框中
    if (cookies.SESSDATA) {
      $('#cookieInput').val(cookies.SESSDATA);
    }
  });
}

/**
 * 全局日志函数
 * @param {string} message - 日志消息
 * @param {string} level - 日志级别 ('info', 'warning', 'error')
 */
function log(message, level = 'info') {
  if (logView) {
    logView.log(message, level);
  } else {
    console.log(`${level}: ${message}`);
  }
}