const fs = require('fs');
const electronStore = require('electron-store');
const logger = require('electron-log');

class CookieManager {
  constructor() {
    this.store = new electronStore();
  }

  // 手动设置Cookie
  setCookie(key, value) {
    const cookies = this.getCookies();
    cookies[key] = value;
    this.saveCookies(cookies);
    logger.info(`设置Cookie: ${key}`);
  }

  // 从字符串加载Cookie
  loadFromText(cookieText) {
    const cookies = {};
    
    // 支持多种格式：
    // 1. "SESSDATA=xxx; bili_jct=yyy"
    // 2. 只包含SESSDATA
    
    if (cookieText && cookieText.includes('=')) {
      // 解析Cookie字符串
      const pairs = cookieText.split(';');
      pairs.forEach(pair => {
        const [key, value] = pair.trim().split('=');
        if (key && value) {
          cookies[key] = value;
          logger.info(`从文本加载Cookie: ${key}`);
        }
      });
    } else if (cookieText && cookieText.trim()) {
      // 仅SESSDATA
      cookies['SESSDATA'] = cookieText.trim();
      logger.info('从文本加载Cookie: SESSDATA');
    }
    
    this.saveCookies(cookies);
    return cookies;
  }

  // 从Netscape格式文件加载
  loadFromFile(filePath) {
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
          logger.error('读取Cookie文件失败:', err);
          reject(err);
          return;
        }

        const cookies = {};
        const lines = data.split('\n');

        for (const line of lines) {
          // 忽略注释和空行
          if (line.startsWith('#') || line.trim() === '') {
            continue;
          }

          // Netscape格式: domain, flag, path, secure, expiration, name, value
          const parts = line.split('\t');
          if (parts.length >= 7) {
            const name = parts[5].trim();
            const value = parts[6].trim();
            if (name && value) {
              cookies[name] = value;
              logger.info(`从文件加载Cookie: ${name}`);
            }
          }
        }

        this.saveCookies(cookies);
        resolve(cookies);
      });
    });
  }

  // 获取所有Cookie
  getCookies() {
    return this.store.get('cookies', {});
  }

  // 保存Cookie到存储
  saveCookies(cookies) {
    this.store.set('cookies', cookies);
    logger.info('Cookie保存成功');
  }

  // 清除所有Cookie
  clearAll() {
    this.store.delete('cookies');
    logger.info('所有Cookie已清除');
  }

  // 检查Cookie是否有效（简单检查是否包含SESSDATA）
  isValid() {
    const cookies = this.getCookies();
    return !!cookies['SESSDATA'];
  }
}

module.exports = CookieManager;
