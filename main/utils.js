/**
 * 工具函数模块
 */

/**
 * 格式化时间戳为可读日期时间
 * @param {number} timestamp - 时间戳
 * @param {string} format - 格式
 * @returns {string} - 格式化后的日期时间
 */
export function formatDateTime(timestamp, format = 'YYYY-MM-DD HH:mm:ss') {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

/**
 * 格式化秒数为时分秒格式
 * @param {number} seconds - 秒数
 * @returns {string} - 格式化后的时分秒
 */
export function formatDuration(seconds) {
  if (isNaN(seconds)) return '00:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  } else {
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} - 格式化后的文件大小
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 生成安全的文件名
 * @param {string} filename - 原始文件名
 * @returns {string} - 安全的文件名
 */
export function sanitizeFilename(filename) {
  // 替换Windows不允许的字符
  return filename.replace(/[\\/:*?"<>|]/g, '_').trim();
}

/**
 * 验证UID格式
 * @param {string} uid - 用户ID
 * @returns {boolean} - 是否有效
 */
export function isValidUid(uid) {
  return /^\d+$/.test(uid);
}

/**
 * 生成随机字符串
 * @param {number} length - 字符串长度
 * @returns {string} - 随机字符串
 */
export function generateRandomString(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 休眠指定时间
 * @param {number} ms - 毫秒数
 * @returns {Promise} - Promise对象
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 重试函数
 * @param {Function} fn - 要执行的函数
 * @param {number} maxRetries - 最大重试次数
 * @param {number} delay - 重试间隔（毫秒）
 * @returns {Promise} - Promise对象
 */
export async function retry(fn, maxRetries = 3, delay = 1000) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.log(`重试 ${i + 1}/${maxRetries}...`);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * 解析Cookie字符串为对象
 * @param {string} cookieString - Cookie字符串
 * @returns {Object} - Cookie对象
 */
export function parseCookieString(cookieString) {
  const cookies = {};
  
  if (!cookieString) return cookies;
  
  const pairs = cookieString.split(';');
  pairs.forEach(pair => {
    const [key, value] = pair.trim().split('=');
    if (key && value) {
      cookies[key] = value;
    }
  });
  
  return cookies;
}

/**
 * 格式化Cookie对象为字符串
 * @param {Object} cookies - Cookie对象
 * @returns {string} - Cookie字符串
 */
export function formatCookieObject(cookies) {
  return Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}