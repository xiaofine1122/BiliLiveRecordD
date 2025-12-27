// 导入ipcRenderer
const { ipcRenderer } = require('electron');

class CookieSettings {
  constructor() {
    this.cookieManager = null;
  }

  init() {
    // 绑定基本事件，但主要事件处理在app.js中
  }

  // 从文本输入加载Cookie
  loadCookie() {
    // 先尝试从文本输入加载
    const cookieText = $('#cookieInput').val().trim();
    if (cookieText) {
      this.loadCookieFromText(cookieText);
      return;
    }
    
    // 如果文本输入为空，尝试从文件加载
    const cookieFile = $('#cookieFile').val().trim();
    if (cookieFile) {
      this.loadCookieFromFile(cookieFile);
      return;
    }
    
    log('请输入Cookie内容或选择Cookie文件', 'warning');
  }

  loadCookieFromText(cookieText) {
    if (!cookieText) {
      log('请输入Cookie内容', 'warning');
      return;
    }

    ipcRenderer.send('load-cookie-from-text', cookieText);
    ipcRenderer.on('cookie-loaded', (event, result) => {
      if (result.success) {
        log(`Cookie加载成功`);
      } else {
        log(`Cookie加载失败: ${result.error}`, 'error');
      }
    });
  }

  // 从文件加载Cookie
  loadCookieFromFile(filePath) {
    if (!filePath) {
      log('请选择Cookie文件', 'warning');
      return;
    }

    ipcRenderer.send('load-cookie-from-file', filePath);
    ipcRenderer.on('cookie-loaded', (event, result) => {
      if (result.success) {
        log(`Cookie加载成功`);
      } else {
        log(`Cookie加载失败: ${result.error}`, 'error');
      }
    });
  }
}