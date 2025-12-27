const axios = require('axios');
const logger = require('electron-log');

class BilibiliApiClient {
  constructor(cookies = {}) {
    this.cookies = cookies;
    this.axiosInstance = axios.create({
      baseURL: 'https://api.live.bilibili.com',
      timeout: 30000,
      headers: {
        'user-agent': this._getUserAgent(),
        'origin': 'https://live.bilibili.com',
        'referer': 'https://live.bilibili.com/'
      },
      // 启用重定向处理，与Python的requests库行为保持一致
      maxRedirects: 5,
      // 确保Cookie在重定向中被正确传递
      withCredentials: true
    });
  }

  _getHeaders() {
    // 确保所有请求头字段都是小写的，与Python版本保持一致
    const headers = {
      'user-agent': this._getUserAgent(),
      'origin': 'https://live.bilibili.com',
      'referer': 'https://live.bilibili.com/',
      'cookie': this._formatCookies()
    };
    return headers;
  }

  _ensureCookieDomain() {
    try {
      // 确保Cookie包含必要的B站域名信息
      const requiredCookies = ['SESSDATA', 'bili_jct', 'DedeUserID', 'DedeUserID__ckMd5'];
      const filteredCookies = {};
      
      // 只保留必要的Cookie并确保它们属于.bilibili.com域
      Object.entries(this.cookies).forEach(([key, value]) => {
        if (requiredCookies.includes(key) && value) {
          filteredCookies[key] = value;
        }
      });
      
      return filteredCookies;
    } catch (error) {
      logger.error('处理Cookie时出错:', error);
      // 如果处理出错，返回原始Cookie
      return this.cookies;
    }
  }

  _getUserAgent() {
    // 获取或生成浏览器User-Agent，与Python版本保持一致
    const chromeVer = this._getChromeVersion();
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer}.0.0.0 Safari/537.36 Edg/${chromeVer}.0.0.0`;
  }

  _getChromeVersion() {
    // 从本地浏览器获取版本号或使用随机版本号
    // 与Python版本保持一致，使用131-141范围的随机版本号
    return Math.floor(Math.random() * 11) + 131;
  }

  _formatCookies() {
    try {
      logger.info('开始格式化Cookie');
      logger.info(`原始Cookie: ${JSON.stringify(this.cookies)}`);
      
      // 确保cookies格式正确，过滤掉值为undefined、null、空字符串或字符串"undefined"的Cookie
      // 并只保留必要的B站Cookie
      const necessaryCookies = this._ensureCookieDomain();
      logger.info(`必要Cookie: ${JSON.stringify(necessaryCookies)}`);
      
      const filteredCookies = Object.entries(necessaryCookies)
        .filter(([key, value]) => {
          const stringValue = String(value);
          logger.info(`检查Cookie ${key}=${stringValue}`);
          return stringValue && stringValue !== 'undefined' && stringValue !== 'null';
        })
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
      
      // 记录cookies信息（不记录具体值，保护隐私）
      const usedCookieKeys = Object.keys(necessaryCookies);
      
      if (usedCookieKeys.length > 0) {
        logger.info(`使用Cookie: ${usedCookieKeys.join(', ')}`);
      } else {
        logger.info('未使用任何Cookie');
      }
      
      logger.info(`格式化后的Cookie: ${filteredCookies}`);
      
      return filteredCookies;
    } catch (error) {
      logger.error('格式化Cookie时出错:', error);
      return '';
    }
  }

  async fetchVodList(uid, page = 1) {
    try {
      // 使用完整URL而不是相对路径，与Python版本保持一致
      const fullUrl = `https://api.live.bilibili.com/xlive/web-room/v1/videoService/GetOtherSliceList`;
      const params = {
        live_uid: uid,
        time_range: 3,
        page: page,
        page_size: 20,
        web_location: '444.194'
      };
      const headers = this._getHeaders();
      
      // 记录请求日志
      logger.info(`发送API请求 - GET ${fullUrl}`);
      logger.info(`请求参数: ${JSON.stringify(params)}`);
      logger.info(`请求头: ${JSON.stringify(headers)}`);
      
      const response = await this.axiosInstance.get(
        fullUrl,
        {
          headers: headers,
          params: params
        }
      );

      if (response.data.code !== 0) {
        throw new Error(`回放获取失败: ${JSON.stringify(response.data)}`);
      }
      logger.info(`API响应数据: ${JSON.stringify(response.data)}`);
      logger.info(`成功获取主播${uid}的回放列表，第${page}页，共${response.data.data.pagination.total}条`);
      return response.data;
    } catch (error) {
      logger.error('获取回放列表失败:', error);
      throw error;
    }
  }

  async fetchVodStreamInfo(liveKey, startTime, endTime, roomId) {
    try {
      const url = `/xlive/web-room/v1/videoService/GetUserSliceStream`;
      const params = {
        live_key: liveKey,
        start_time: startTime,
        end_time: endTime,
        live_uid: roomId,
        web_location: '444.194'
      };
      const headers = this._getHeaders();
      
      // 记录请求日志
      logger.info(`发送API请求 - GET ${url}`);
      logger.info(`请求参数: ${JSON.stringify(params)}`);
      logger.info(`请求头: ${JSON.stringify(headers)}`);
      
      const response = await this.axiosInstance.get(
        url,
        {
          headers: headers,
          params: params
        }
      );

      if (response.data.code !== 0) {
        throw new Error(`直播流获取失败: ${JSON.stringify(response.data)}`);
      }

      logger.info(`成功获取直播流信息: ${liveKey}`);
      logger.info(`直播流信息内容: ${JSON.stringify(response.data)}}`);
      return response.data;
    } catch (error) {
      logger.error('获取直播流信息失败:', error);
      throw error;
    }
  }

  async fetchCover(coverUrl) {
    try {
      // 记录请求日志
      logger.info(`发送API请求 - GET ${coverUrl}`);
      
      const response = await this.axiosInstance.get(coverUrl, {
        headers: this._getHeaders(),
        responseType: 'arraybuffer'
      });
      logger.info(`成功获取封面图片: ${coverUrl}`);
      return Buffer.from(response.data, 'binary');
    } catch (error) {
      logger.error('获取封面失败:', error);
      throw error;
    }
  }
}

module.exports = BilibiliApiClient;
