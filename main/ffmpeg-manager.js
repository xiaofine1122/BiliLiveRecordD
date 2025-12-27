const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const logger = require('electron-log');

class FfmpegManager {
  constructor(ffmpegPath) {
    this.ffmpegPath = ffmpegPath;
    this.ffprobePath = path.join(path.dirname(ffmpegPath), 'ffprobe.exe');
    
    logger.info(`FFmpegManager初始化 - ffmpegPath: ${ffmpegPath}`);
    logger.info(`FFmpegManager初始化 - ffprobePath: ${this.ffprobePath}`);
    
    // 检查ffmpeg路径是否存在
    if (!fs.existsSync(ffmpegPath)) {
      logger.error(`FFmpeg可执行文件不存在: ${ffmpegPath}`);
      throw new Error(`FFmpeg可执行文件不存在: ${ffmpegPath}`);
    }
    
    // 检查ffprobe路径是否存在
    if (!fs.existsSync(this.ffprobePath)) {
      logger.error(`FFprobe可执行文件不存在: ${this.ffprobePath}`);
      throw new Error(`FFprobe可执行文件不存在: ${this.ffprobePath}`);
    }
    
    // 设置ffmpeg和ffprobe路径
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(this.ffprobePath);
    logger.info(`FFmpegManager初始化成功`);
  }

  /**
   * 下载流媒体
   * @param {string} streamUrl - 流媒体URL
   * @param {string} outputPath - 输出文件路径
   * @param {Object} options - 下载选项
   * @param {Function} progressCallback - 进度回调函数
   * @returns {Object} - 返回包含promise和控制方法的对象
   */
  downloadStream(streamUrl, outputPath, options = {}, progressCallback, headers = {}) {
    let duration = 0;
    let process;
    let resolvePromise, rejectPromise;
    
    // 创建Promise
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    
    logger.info(`开始下载流媒体 - 原始URL: ${streamUrl}`);
    
    // 确保输出目录存在
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      logger.info(`创建输出目录: ${outputDir}`);
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 清理流媒体URL（确保移除反引号、末尾点号等无效字符）
    const cleanStreamUrl = streamUrl
      .trim()
      .replace(/^`|`$/g, '') // 移除首尾反引号
      .replace(/\.*$/, '')    // 移除末尾所有点号
      .replace(/[\s\uFEFF\u00A0]+/g, ''); // 移除各种空白字符
    
    // 配置ffmpeg命令
    logger.info(`清理后的流媒体URL: ${cleanStreamUrl}`);
    logger.info(`输出文件路径: ${outputPath}`);
    
    // 构建请求头字符串
    const headersString = Object.entries(headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\r\n');
    
    logger.info(`使用的HTTP请求头: ${headersString}`);
    
    // 创建临时文件路径
    const tempOutputPath = `${outputPath}.tmp`;
    
    // 配置ffmpeg命令 - 先创建基础命令，再添加输入和选项
    const command = ffmpeg()
      .input(cleanStreamUrl) // 明确指定输入URL
      .inputOption('-headers', headersString) // 输入选项应该在输入URL之后
      .inputOption('-timeout', '10') // 输入超时设置
      .inputOption('-reconnect', '1') // 输入重连设置
      .inputOption('-reconnect_at_eof', '1')
      .inputOption('-reconnect_streamed', '1')
      .inputOption('-reconnect_delay_max', '5')
      .inputOption('-loglevel', 'info') // 增加日志级别，获取更详细的输出
      .addOption('-c', 'copy') // 输出选项
      .addOption('-bsf:a', 'aac_adtstoasc')
      .addOption('-f', 'mp4') // 显式指定输出格式
      .addOption('-y') // 覆盖已有文件
      .output(tempOutputPath)
      .on('stderr', (stderrLine) => {
        // 解析进度信息
        if (stderrLine.includes('Duration:')) {
          const durationMatch = stderrLine.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
          if (durationMatch) {
            const hours = parseInt(durationMatch[1]);
            const minutes = parseInt(durationMatch[2]);
            const seconds = parseFloat(durationMatch[3]);
            duration = hours * 3600 + minutes * 60 + seconds;
          }
        } else if (stderrLine.includes('time=')) {
          const timeMatch = stderrLine.match(/time=(\d+):(\d+):(\d+\.\d+)/);
          const bitrateMatch = stderrLine.match(/bitrate=\s*([\d.]+)kbits\/s/);
          
          if (timeMatch && duration > 0) {
            const hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            const seconds = parseFloat(timeMatch[3]);
            const currentTime = hours * 3600 + minutes * 60 + seconds;
            const progress = (currentTime / duration) * 100;
            
            // 计算下载速度（MB/s）
            let speed = 0;
            if (bitrateMatch) {
              const bitrateKBits = parseFloat(bitrateMatch[1]);
              speed = (bitrateKBits / 8 / 1024).toFixed(2); // 转换为MB/s并保留两位小数
            }
            
            if (progressCallback) {
              progressCallback({
                currentTime,
                duration,
                progress: Math.min(progress, 100),
                speed: parseFloat(speed) // 转换为数字类型
              });
            }
          }
        }
      })
      .on('end', () => {
        logger.info(`FFmpeg下载完成: ${tempOutputPath}`);
        
        // 将临时文件重命名为最终文件
        try {
          if (fs.existsSync(tempOutputPath)) {
            fs.renameSync(tempOutputPath, outputPath);
            logger.info(`文件重命名成功: ${tempOutputPath} -> ${outputPath}`);
            resolvePromise(outputPath);
          } else {
            rejectPromise(new Error('临时文件不存在'));
          }
        } catch (renameError) {
          logger.error(`文件重命名失败: ${renameError.message}`);
          rejectPromise(renameError);
        }
      })
      .on('error', (err) => {
        logger.error(`FFmpeg下载失败: ${err.message}`);
        
        // 清理临时文件
        try {
          if (fs.existsSync(tempOutputPath)) {
            fs.unlinkSync(tempOutputPath);
            logger.info(`清理临时文件: ${tempOutputPath}`);
          }
        } catch (cleanupError) {
          logger.error(`清理临时文件失败: ${cleanupError.message}`);
        }
        
        rejectPromise(err);
      });
    
    // 运行命令
    logger.info(`执行FFmpeg命令: ${command._getArguments().join(' ')}`);
    process = command.run();
    
    // 返回包含promise和控制方法的对象
    return {
      promise,
      cancel: () => {
        if (process && !process.killed) {
          logger.info('取消FFmpeg进程');
          process.kill();
          // 删除未完成的文件
          try {
            if (fs.existsSync(tempOutputPath)) {
              fs.unlinkSync(tempOutputPath);
              logger.info(`清理临时文件: ${tempOutputPath}`);
            }
          } catch (cleanupError) {
            logger.error(`清理临时文件失败: ${cleanupError.message}`);
          }
          rejectPromise(new Error('下载已取消'));
        }
      }
    };
  }

  /**
   * 获取视频时长
   * @param {string} videoPath - 视频文件路径
   * @returns {Promise<number>} - 返回视频时长（秒）
   */
  async getVideoDuration(videoPath) {
    logger.info(`获取视频时长: ${videoPath}`);
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          logger.error(`获取视频时长失败: ${err.message}`);
          reject(err);
          return;
        }
        logger.info(`视频时长: ${metadata.format.duration}秒`);
        resolve(metadata.format.duration);
      });
    });
  }

  /**
   * 验证视频完整性
   * @param {string} videoPath - 视频文件路径
   * @param {number} expectedDuration - 期望时长（秒）
   * @param {number} tolerance - 容差（0-1）
   * @returns {Promise<boolean>} - 返回是否完整
   */
  async verifyVideoIntegrity(videoPath, expectedDuration, tolerance = 0.01) {
    logger.info(`验证视频完整性: ${videoPath}`);
    logger.info(`预期时长: ${expectedDuration}秒, 容差: ${tolerance}`);
    try {
      const actualDuration = await this.getVideoDuration(videoPath);
      const durationDiff = Math.abs(actualDuration - expectedDuration);
      const toleranceSeconds = expectedDuration * tolerance;
      
      logger.info(`实际时长: ${actualDuration}秒, 差异: ${durationDiff}秒, 容差阈值: ${toleranceSeconds}秒`);
      const isIntegrity = durationDiff <= toleranceSeconds;
      logger.info(`视频完整性验证结果: ${isIntegrity}`);
      
      return isIntegrity;
    } catch (error) {
      logger.error('验证视频完整性失败:', error.message);
      return false;
    }
  }

  /**
   * 检查ffmpeg是否可用
   * @returns {Promise<boolean>} - 返回是否可用
   */
  async checkFfmpegAvailable() {
    logger.info(`检查FFmpeg是否可用 - ffmpegPath: ${this.ffmpegPath}`);
    logger.info(`检查FFmpeg是否可用 - ffprobePath: ${this.ffprobePath}`);
    
    // 先检查路径是否存在
    if (!fs.existsSync(this.ffmpegPath) || !fs.existsSync(this.ffprobePath)) {
      logger.error('FFmpeg或FFprobe路径不存在');
      return false;
    }
    
    // 再检查是否能正常运行ffprobe
    return new Promise((resolve) => {
      ffmpeg.ffprobe(__filename, (err) => {
        const isAvailable = !err;
        logger.info(`FFmpeg可用性检查结果: ${isAvailable}`);
        resolve(isAvailable);
      });
    });
  }
  
  /**
   * 设置ffmpeg路径
   * @param {string} ffmpegPath - 新的ffmpeg路径
   */
  setFfmpegPath(ffmpegPath) {
    logger.info(`设置FFmpeg路径 - 新路径: ${ffmpegPath}`);
    this.ffmpegPath = ffmpegPath;
    this.ffprobePath = path.join(path.dirname(ffmpegPath), 'ffprobe.exe');
    logger.info(`设置FFmpeg路径 - 新ffprobe路径: ${this.ffprobePath}`);
    
    // 检查ffmpeg路径是否存在
    if (!fs.existsSync(ffmpegPath)) {
      logger.error(`FFmpeg可执行文件不存在: ${ffmpegPath}`);
      throw new Error(`FFmpeg可执行文件不存在: ${ffmpegPath}`);
    }
    
    // 检查ffprobe路径是否存在
    if (!fs.existsSync(this.ffprobePath)) {
      logger.error(`FFprobe可执行文件不存在: ${this.ffprobePath}`);
      throw new Error(`FFprobe可执行文件不存在: ${this.ffprobePath}`);
    }
    
    // 更新ffmpeg和ffprobe路径
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(this.ffprobePath);
    logger.info(`FFmpeg路径设置成功`);
  }
}

module.exports = FfmpegManager;