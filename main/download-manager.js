const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const uuid = require('uuid').v4;
const logger = require('electron-log');

class DownloadManager extends EventEmitter {
  constructor(maxConcurrent = 3) {
    super();
    this.maxConcurrent = maxConcurrent;
    this.taskQueue = []; // 等待中的任务
    this.runningTasks = new Map(); // 正在运行的任务
    this.taskHistory = new Map(); // 历史任务
  }

  /**
   * 设置最大并发数
   * @param {number} max - 最大并发数
   */
  setMaxConcurrent(max) {
    this.maxConcurrent = max;
    this.processQueue();
  }

  /**
   * 添加下载任务
   * @param {Object} taskInfo - 任务信息
   * @param {string} savePath - 保存路径
   * @param {Object} apiClient - API客户端
   * @param {Object} ffmpegManager - FFmpeg管理器
   * @returns {Object} - 任务对象
   */
  addTask(taskInfo, savePath, apiClient, ffmpegManager) {
    const task = {
      id: uuid(),
      status: 'pending',
      progress: 0,
      speed: 0,
      startTime: null,
      endTime: null,
      error: null,
      controls: null,
      apiClient: apiClient,
      ffmpegManager: ffmpegManager,
      savePath: savePath,
      ...taskInfo
    };

    this.taskQueue.push(task);
    this.taskHistory.set(task.id, task);
    
    // 创建可序列化的任务对象（不包含无法序列化的apiClient和ffmpegManager）
    const serializableTask = {
      id: task.id,
      status: task.status,
      progress: task.progress,
      speed: task.speed,
      startTime: task.startTime,
      endTime: task.endTime,
      error: task.error,
      title: task.live_info?.title || '未命名直播回放',
      live_info: task.live_info,
      video_info: task.video_info,
      live_key: task.live_key,
      start_time: task.start_time,
      end_time: task.end_time,
      uid: task.uid,
      room_id: task.room_id
    };
    
    // 触发任务添加事件，传递可序列化的任务对象
    this.emit('download-task-added', serializableTask);
    
    // 尝试处理队列
    this.processQueue();
    
    return serializableTask;
  }

  /**
   * 处理下载队列
   */
  processQueue() {
    // 如果正在运行的任务数小于最大并发数，且队列中有任务
    while (this.runningTasks.size < this.maxConcurrent && this.taskQueue.length > 0) {
      const task = this.taskQueue.shift();
      this.startTask(task);
    }
  }

  /**
   * 开始下载任务
   * @param {Object} task - 任务对象
   */
  async startTask(task) {
    try {
      task.status = 'downloading';
      task.startTime = new Date();
      logger.info(`Task ${task.id} started at: ${task.startTime}`);
      task.progress = 0;
      
      this.runningTasks.set(task.id, task);
      
      // 触发任务开始事件，传递可序列化的任务对象
      const taskStartedEvent = {
        id: task.id,
        status: task.status,
        progress: task.progress,
        speed: task.speed,
        title: task.live_info?.title || '未命名直播回放',
        startTime: task.startTime
      };
      this.emit('download-task-started', taskStartedEvent);
      
      // 进度回调
      const progressCallback = (progressInfo) => {
        task.progress = progressInfo.progress || 0;
        task.duration = progressInfo.duration || 0;
        task.currentTime = progressInfo.currentTime || 0;
        task.speed = progressInfo.speed || 0;
        
        // 触发进度更新事件
        this.emit('download-progress', task.id, task.progress);
        
        // 触发任务更新事件，传递可序列化的任务对象
        const taskUpdatedEvent = {
          id: task.id,
          status: task.status,
          progress: task.progress,
          speed: task.speed,
          title: task.live_info?.title || '未命名直播回放',
          currentTime: task.currentTime,
          duration: task.duration
        };
        this.emit('download-task-updated', taskUpdatedEvent);
      };
      
      // 获取直播流信息
      const streamInfo = await task.apiClient.fetchVodStreamInfo(
        task.live_key,
        task.start_time,
        task.end_time,
        task.uid
      );
      
      // 设置流地址
      const streamUrl = streamInfo.data?.list?.[0]?.stream?.trim()?.replace(/^`|`$/g, '')?.replace(/\.*$/, '') || '';
      if (!streamUrl) {
        throw new Error('获取直播流地址失败');
      }
      
      // 设置输出路径
      const title = task.live_info?.title || '未命名直播回放';
      const safeTitle = title.replace(/[<>\/\|\?\*:"\\]/g, '_');
      const outputFilename = `${safeTitle}.mp4`;
      const outputPath = path.join(task.savePath, outputFilename);
      
      // 构建HTTP请求头（与Python版本保持一致）
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
        'Origin': 'https://live.bilibili.com',
        'Referer': 'https://live.bilibili.com/',
        'Accept-Encoding': 'gzip, deflate',
        'Accept': '*/*',
        'Connection': 'keep-alive'
      };
      
      // 执行下载并保存控制对象
      task.controls = task.ffmpegManager.downloadStream(
        streamUrl,
        outputPath,
        task.options || {},
        progressCallback,
        headers
      );
      
      // 等待下载完成
      task.outputPath = await task.controls.promise;
      
      // 下载完成
      task.status = 'completed';
      task.endTime = new Date();
      
      // 触发任务完成事件，传递可序列化的任务对象
      const taskCompletedEvent = {
        id: task.id,
        status: task.status,
        progress: task.progress,
        speed: task.speed,
        title: task.live_info?.title || '未命名直播回放',
        endTime: task.endTime
      };
      this.emit('download-task-completed', taskCompletedEvent);
      this.emit('download-task-updated', taskCompletedEvent);
      
    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      task.endTime = new Date();
      
      // 触发任务失败事件
      this.emit('download-task-failed', task.id, error.message);
      
      // 触发任务更新事件，传递可序列化的任务对象
      const taskFailedEvent = {
        id: task.id,
        status: task.status,
        progress: task.progress,
        speed: task.speed,
        title: task.live_info?.title || '未命名直播回放',
        error: task.error,
        endTime: task.endTime
      };
      this.emit('download-task-updated', taskFailedEvent);
      
    } finally {
      this.runningTasks.delete(task.id);
      
      // 继续处理队列
      this.processQueue();
    }
  }

  

  /**
   * 取消下载任务
   * @param {string} taskId - 任务ID
   * @returns {boolean} - 是否成功
   */
  cancelTask(taskId) {
    // 检查是否在运行中
    const task = this.runningTasks.get(taskId);
    
    if (task) {
      task.status = 'cancelled';
      task.endTime = new Date();
      
      // 取消ffmpeg进程
      if (task.controls && typeof task.controls.cancel === 'function') {
        task.controls.cancel();
      }
      
      this.runningTasks.delete(taskId);
      
      // 触发任务取消事件
      this.emit('download-task-cancelled', { taskId: taskId });
      
      // 创建可序列化的任务对象
      const serializableTask = {
        id: task.id,
        status: task.status,
        progress: task.progress,
        speed: task.speed,
        title: task.live_info?.title || '未命名直播回放'
      };
      this.emit('download-task-updated', serializableTask);
      
      // 继续处理队列
      this.processQueue();
      
      return true;
    }
    
    // 检查是否在队列中
    const queueIndex = this.taskQueue.findIndex(t => t.id === taskId);
    if (queueIndex !== -1) {
      const [task] = this.taskQueue.splice(queueIndex, 1);
      task.status = 'cancelled';
      
      // 触发任务取消事件
      this.emit('download-task-cancelled', taskId);
      
      // 创建可序列化的任务对象
      const serializableTask = {
        id: task.id,
        status: task.status,
        progress: task.progress,
        speed: task.speed,
        title: task.live_info?.title || '未命名直播回放'
      };
      this.emit('download-task-updated', serializableTask);
      
      return true;
    }
    
    return false;
  }

  /**
   * 获取任务状态
   * @param {string} taskId - 任务ID
   * @returns {Object|null} - 任务信息
   */
  getTaskStatus(taskId) {
    return this.taskHistory.get(taskId) || null;
  }

  /**
   * 获取所有任务
   * @returns {Array} - 所有任务列表
   */
  getAllTasks() {
    return Array.from(this.taskHistory.values());
  }

  /**
   * 获取正在运行的任务
   * @returns {Array} - 正在运行的任务列表
   */
  getRunningTasks() {
    return Array.from(this.runningTasks.values());
  }

  /**
   * 获取等待中的任务
   * @returns {Array} - 等待中的任务列表
   */
  getPendingTasks() {
    return [...this.taskQueue];
  }

  

  /**
   * 取消所有任务
   */
  cancelAll() {
    // 取消正在运行的任务
    this.runningTasks.forEach((task) => {
      this.cancelTask(task.id);
    });
    
    // 清空队列
    this.taskQueue.forEach((task) => {
      task.status = 'cancelled';
      this.emit('download-task-cancelled', { taskId: task.id });
      this.emit('download-task-updated', task);
    });
    this.taskQueue = [];
  }

  /**
   * 清理完成的任务
   */
  cleanupCompletedTasks() {
    const completedTasks = Array.from(this.taskHistory.values())
      .filter(task => task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled');
    
    completedTasks.forEach(task => {
      this.taskHistory.delete(task.id);
    });
    
    this.emit('download-tasks-cleaned-up', completedTasks.length);
  }

  /**
   * 移除任务
   * @param {string} taskId - 任务ID
   * @returns {boolean} - 是否成功
   */
  removeTask(taskId) {
    if (this.taskHistory.has(taskId)) {
      // 如果任务正在运行或等待中，先取消任务
      this.cancelTask(taskId);
      
      // 从历史记录中删除
      this.taskHistory.delete(taskId);
      
      // 触发任务移除事件
      this.emit('download-task-removed', { taskId: taskId });
      
      return true;
    }
    
    return false;
  }
}

module.exports = DownloadManager;