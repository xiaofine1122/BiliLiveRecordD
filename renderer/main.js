const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// 全局变量
let vodList = [];
let downloadTasks = {};
let selectedTaskId = null;

// 页面加载完成后初始化
$(function() {
  console.log('页面加载完成');
  
  // 初始化事件监听
  initEventListeners();
  
  // 加载本地数据
  loadLocalData();
  
  // 恢复上次输入的UID
  const lastUid = localStorage.getItem('lastQueryUid');
  if (lastUid) {
    $('#uidInput').val(lastUid);
  }
  
  // 从存储中加载Cookie并填充到输入框
  ipcRenderer.on('cookies-returned', (event, cookies) => {
    if (cookies && Object.keys(cookies).length > 0) {
      // 如果有多个Cookie，组合成字符串
      const cookieString = Object.entries(cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
      $('#cookieInput').val(cookieString);
    }
  });
  

});

/**
 * 初始化事件监听
 */
function initEventListeners() {
  // UID查询事件
  $('#queryUidBtn').on('click', () => queryUid());
  $('#uidInput').on('keypress', (e) => {
    if (e.which === 13) queryUid();
  });
  
  // Cookie管理事件
  $('#cookieInput').on('input', () => {
    const cookieText = $('#cookieInput').val()?.trim();
    if (!cookieText) {
      // 输入框为空时，不做任何操作
      return;
    }
    ipcRenderer.send('load-cookie-from-text', cookieText);
  });
  
  // 回放列表事件
  $('#searchInput').on('keyup', () => filterVodList());
  $('#refreshVodBtn').on('click', () => refreshVodList());
  
  // 下载队列事件
  $('#cancelAllBtn').on('click', () => cancelAllTasks());
  
  // 设置事件
  $('#browsePathBtn').on('click', () => browseSavePath());
  $('#browseFfmpegBtn').on('click', () => browseFfmpegPath());
  $('#checkFfmpegBtn').on('click', () => checkFfmpegVersion());
  
  // 自动保存下载保存路径修改
  $('#savePath').on('input change', async () => {
    await saveSettings();
  });
  
  // 日志事件
  $('#clearLogBtn').on('click', () => clearLog());
  
  // IPC事件监听
  initIpcListeners();
}

/**
 * 初始化IPC事件监听
 */
function initIpcListeners() {
  
  // Cookie管理
  ipcRenderer.on('cookie-loaded', (event, result) => {
    if (result.success) {
      log(`Cookie加载成功`);
    } else {
      log(`Cookie加载失败: ${result.error}`, 'error');
    }
  });
  
  // B站API
  ipcRenderer.on('vod-list-fetched', (event, result) => {
    if (result.success) {
      // 合并回放列表
      const newVods = result.data.data.list.map(vod => ({
        ...vod,
        uid: result.uid
      }));
      
      // 去重
      vodList = [...new Set([...vodList, ...newVods].map(v => JSON.stringify(v)))].map(v => JSON.parse(v));
      
      refreshVodTable();
      log(`获取主播${result.uid}的回放列表成功，共${newVods.length}条记录`);
    } else {
      log(`获取主播${result.uid}的回放列表失败: ${result.error}`, 'error');
    }
  });
  
  // 下载管理
  ipcRenderer.on('download-task-added', (event, result) => {
    if (result.task) {
      downloadTasks[result.task.id] = result.task;
      refreshDownloadTable();
      log(`添加下载任务: ${result.task.title}`);
    }
  });
  
  ipcRenderer.on('download-task-removed', (event, result) => {
    if (downloadTasks[result.taskId]) {
      delete downloadTasks[result.taskId];
      refreshDownloadTable();
      log(`移除下载任务: ${result.taskId}`);
      
      // 清除选中的任务详情
      if (selectedTaskId === result.taskId) {
        selectedTaskId = null;
        $('#taskDetails').html('<p>请选择一个下载任务查看详情</p>');
      }
    }
  });
  
  ipcRenderer.on('download-task-started', (event, result) => {
    if (downloadTasks[result.taskId]) {
      downloadTasks[result.taskId].status = 'downloading';
      downloadTasks[result.taskId].startTime = result.startTime || Date.now();
      refreshDownloadTable();
      log(`开始下载: ${downloadTasks[result.taskId].title}`);
      
      // 如果当前显示的是这个任务的详情，需要更新显示
      if (selectedTaskId === result.taskId) {
        showTaskDetails(result.taskId);
      }
    }
  });
  
  ipcRenderer.on('download-task-progress', (event, result) => {
    if (downloadTasks[result.taskId]) {
      downloadTasks[result.taskId].progress = result.progress;
      downloadTasks[result.taskId].speed = result.speed || 0;
      refreshDownloadTable();
    }
  });
  
  ipcRenderer.on('download-task-completed', (event, result) => {
    if (downloadTasks[result.taskId]) {
      downloadTasks[result.taskId].status = 'completed';
      downloadTasks[result.taskId].endTime = result.endTime || Date.now();
      refreshDownloadTable();
      log(`下载完成: ${downloadTasks[result.taskId].title}`);
      
      // 如果当前显示的是这个任务的详情，需要更新显示
      if (selectedTaskId === result.taskId) {
        showTaskDetails(result.taskId);
      }
    }
  });
  
  ipcRenderer.on('download-task-failed', (event, result) => {
    if (downloadTasks[result.taskId]) {
      downloadTasks[result.taskId].status = 'failed';
      downloadTasks[result.taskId].error = result.error;
      downloadTasks[result.taskId].endTime = result.endTime || Date.now();
      refreshDownloadTable();
      log(`下载失败: ${downloadTasks[result.taskId].title}, 错误: ${result.error}`, 'error');
      
      // 如果当前显示的是这个任务的详情，需要更新显示
      if (selectedTaskId === result.taskId) {
        showTaskDetails(result.taskId);
      }
    }
  });
  

  
  ipcRenderer.on('download-task-retrying', (event, result) => {
    if (downloadTasks[result.taskId]) {
      log(`重试下载: ${downloadTasks[result.taskId].title}, 第${result.retryCount}次`);
    }
  });
  
  ipcRenderer.on('download-task-cancelled', (event, result) => {
    if (downloadTasks[result.taskId]) {
      downloadTasks[result.taskId].status = 'cancelled';
      downloadTasks[result.taskId].endTime = result.endTime || Date.now();
      refreshDownloadTable();
      log(`取消下载: ${downloadTasks[result.taskId].title}`);
      
      // 如果当前显示的是这个任务的详情，需要更新显示
      if (selectedTaskId === result.taskId) {
        showTaskDetails(result.taskId);
      }
    }
  });
  
  // 设置
  ipcRenderer.on('settings-returned', (event, settings) => {
    $('#savePath').val(settings.savePath);
  });
  
  ipcRenderer.on('settings-saved', (event, result) => {
    if (result.success) {
      log('设置保存成功');
    } else {
      log('设置保存失败', 'error');
    }
  });
  
  // 文件对话框
  ipcRenderer.on('open-dialog-closed', async (event, result) => {
    if (!result.canceled && result.filePaths) {
      const filePath = result.filePaths[0];
      
      // 根据触发的操作处理文件路径
      const dialogType = result.dialogType;
      if (dialogType === 'cookieFile') {
        $('#cookieFileInput').val(filePath);
      } else if (dialogType === 'savePath') {
        $('#savePath').val(filePath);
        // 手动触发保存设置
        await saveSettings();
      } else if (dialogType === 'ffmpegPath') {
        $('#ffmpegPath').val(filePath);
      }
    }
  });
}

/**
 * 加载本地数据
 */
async function loadLocalData() {
  // 获取设置
  try {
    const settings = await ipcRenderer.invoke('settings:get');
    $('#savePath').val(settings.savePath);
    $('#retryCount').val(settings.retryCount || 3);
    $('#ffmpegPath').val(settings.ffmpegPath);
  } catch (error) {
    log('获取设置失败: ' + error.message, 'error');
  }
  
  // 获取Cookie
  ipcRenderer.send('get-cookies');
}

/**
 * 查询UID的回放列表
 */
function queryUid() {
  const uid = $('#uidInput').val()?.trim();
  if (!uid) {
    log('请输入用户uid', 'warning');
    return;
  }
  
  if (!/^\d+$/.test(uid)) {
    log('UID必须是数字', 'warning');
    return;
  }
  
  // 保存上次输入的UID
  localStorage.setItem('lastQueryUid', uid);
  
  log('正在查询UID...');
  queryUidVodList(uid);
}

/**
 * 从文本加载Cookie
 */
function loadCookieFromText() {
  const cookieText = $('#cookieInput').val()?.trim();
  if (!cookieText) {
    log('请输入Cookie内容', 'warning');
    return;
  }
  
  ipcRenderer.send('load-cookie-from-text', cookieText);
}

// 文件导入功能已移除

/**
 * 刷新回放列表
 */
async function refreshVodList() {
  if (uidList.length === 0) {
    log('请先添加主播UID', 'warning');
    // 显示UI提示
    const $tableBody = $('#vodTableBody');
    $tableBody.html('<tr><td colspan="4" class="text-center text-warning">请先添加主播UID</td></tr>');
    return;
  }
  
  // 清空回放列表
  vodList = [];
  refreshVodTable();
  
  // 显示加载中
  log('正在获取回放列表...');
  
  // 获取每个UID的回放列表
  for (const uid of uidList) {
    try {
      const result = await ipcRenderer.invoke('api:fetch-vod-list', uid, 1);
      const newVods = result.data.replay_info.map(vod => ({ ...vod, uid: uid }));
      if (newVods && newVods.length > 0) {
        vodList.push(...newVods);
        refreshVodTable();
        log(`获取到 ${uid} 的回放列表，共 ${newVods.length} 个视频`);
      } else {
        log(`未找到 ${uid} 的回放视频`);
        // 显示无视频提示
        const $tableBody = $('#vodTableBody');
        $tableBody.append(`<tr><td colspan="4" class="text-center text-info">主播${uid}暂无回放视频</td></tr>`);
      }
    } catch (error) {
      log(`获取 ${uid} 的回放列表失败: ${error.message}`, 'error');
      // 显示失败提示
      const $tableBody = $('#vodTableBody');
      $tableBody.append(`<tr><td colspan="4" class="text-center text-danger">主播${uid}回放获取失败: ${error.message}</td></tr>`);
    }
  }
}

/**
 * 查询单个UID的回放列表
 */
async function queryUidVodList(uid) {
  if (!uid) {
    return;
  }
  
  // 保存UID到本地存储
  localStorage.setItem('lastQueryUid', uid);
  
  // 清空当前回放列表
  vodList = [];
  refreshVodTable();
  
  // 显示查询中日志
  log(`正在查询UID ${uid} 的回放列表...`);
  
  try {
    const result = await ipcRenderer.invoke('api:fetch-vod-list', uid, 1);
    const newVods = result.data.replay_info.map(vod => ({ ...vod, uid: uid }));
    if (newVods && newVods.length > 0) {
      vodList = newVods;
      refreshVodTable();
      log(`成功获取UID ${uid} 的回放列表，共 ${newVods.length} 个视频`);
    } else {
      log(`未找到UID ${uid} 的回放视频`);
      // 显示无视频提示
      const $tableBody = $('#vodTableBody');
      $tableBody.append(`<tr><td colspan="4" class="text-center text-info">主播${uid}暂无回放视频</td></tr>`);
    }
  } catch (error) {
    log(`查询UID ${uid} 的回放列表失败: ${error.message}`, 'error');
    // 显示失败提示
    const $tableBody = $('#vodTableBody');
    $tableBody.append(`<tr><td colspan="4" class="text-center text-danger">主播${uid}回放获取失败: ${error.message}</td></tr>`);
  }
}

/**
 * 刷新回放表格
 */
function refreshVodTable() {
  const $tableBody = $('#vodTableBody');
  $tableBody.empty();
  
  vodList.forEach(vod => {
    const $row = createVodTableRow(vod);
    $tableBody.append($row);
  });
}

/**
 * 创建回放表格行
 * @param {object} vod - 回放信息
 * @returns {jQuery} 表格行元素
 */
function createVodTableRow(vod) {
  const startTime = new Date(vod.start_time * 1000).toLocaleString();
  const duration = formatDuration(vod.video_info.duration);
  
  const $row = $('<tr>');
  
  $row.append($('<td>', { text: vod.live_info.title || '无标题' }));
  $row.append($('<td>', { text: startTime }));
  $row.append($('<td>', { text: duration }));
  
  const $downloadBtn = $('<button>', {
      class: 'btn btn-primary btn-sm',
      text: '下载'
    }).on('click', (event) => {
      event.stopPropagation(); // 阻止事件冒泡到行元素
      downloadVod(vod);
    });
  
  const $actionsTd = $('<td>').append($downloadBtn);
  $row.append($actionsTd);
  
  return $row;
}

/**
 * 过滤回放列表
 */
function filterVodList() {
  const searchText = $('#searchInput').val()?.trim()?.toLowerCase();
  
  $('#vodTableBody tr').each((index, row) => {
    const title = $(row).find('td:first').text().toLowerCase();
    if (title.includes(searchText)) {
      $(row).show();
    } else {
      $(row).hide();
    }
  });
}

/**
 * 下载回放
 * @param {object} vod - 回放信息
 */
async function downloadVod(vod) {
  try {
    const task = await ipcRenderer.invoke('download:add', vod);
    log(`成功添加下载任务: ${task.title}`);
    // 刷新下载列表
    refreshDownloadTable();
  } catch (error) {
    log(`添加下载任务失败: ${error.message}`, 'error');
  }
}

/**
 * 刷新下载表格
 */
function refreshDownloadTable() {
  const $tableBody = $('#downloadTableBody');
  
  // 检查是否已经有表格行，如果有则只更新现有行，否则创建新行
  if ($tableBody.children().length > 0) {
    // 更新现有行
    $tableBody.children('tr').each(function() {
      const $row = $(this);
      const taskId = $row.data('task-id');
      const task = downloadTasks[taskId];
      
      if (task) {
        // 更新进度条
        const $progressBar = $row.find('.progress-bar');
        if ($progressBar.length) {
          $progressBar.css('width', `${task.progress}%`)
                   .attr('aria-valuenow', task.progress)
                   .text(`${task.progress.toFixed(0)}%`);
        }
        
        // 更新状态
        const $statusBadge = $row.find('.badge');
        if ($statusBadge.length) {
          const statusText = getStatusText(task.status);
          const statusClass = getStatusClass(task.status);
          $statusBadge.text(statusText)
                      .removeClass().addClass(`badge badge-${statusClass}`);
        }
        
        // 更新操作按钮
        const $actionsTd = $row.find('td:last');
        if ($actionsTd.length) {
          $actionsTd.empty();
          addActionButtons($actionsTd, task);
        }
      }
    });
    
    // 检查是否有新任务需要添加
    const existingTaskIds = $tableBody.children('tr').map(function() {
      return $(this).data('task-id');
    }).get();
    
    Object.values(downloadTasks).forEach(task => {
      if (!existingTaskIds.includes(task.id)) {
        const $row = createDownloadTableRow(task);
        $tableBody.append($row);
      }
    });
    
    // 移除已不存在的任务行
    $tableBody.children('tr').each(function() {
      const $row = $(this);
      const taskId = $row.data('task-id');
      if (!downloadTasks[taskId]) {
        $row.remove();
      }
    });
  } else {
    // 创建新行
    Object.values(downloadTasks).forEach(task => {
      const $row = createDownloadTableRow(task);
      $tableBody.append($row);
    });
  }
  
  // 更新任务详情
  if (selectedTaskId && downloadTasks[selectedTaskId]) {
    showTaskDetails(selectedTaskId);
  }
}

/**
 * 为任务行添加操作按钮
 */
function addActionButtons($actionsTd, task) {
  // 根据任务状态显示不同的按钮
  if (task.status === 'downloading') {
    const $cancelBtn = $('<button>', {
      class: 'btn btn-danger btn-sm',
      text: '取消'
    }).on('click', (event) => {
      event.stopPropagation(); // 阻止事件冒泡到行元素
      cancelTask(task.id);
    });
    
    $actionsTd.append($cancelBtn);
  } else if (task.status === 'paused') {
    const $cancelBtn = $('<button>', {
      class: 'btn btn-danger btn-sm',
      text: '取消'
    }).on('click', (event) => {
      event.stopPropagation(); // 阻止事件冒泡到行元素
      cancelTask(task.id);
    });
    
    $actionsTd.append($cancelBtn);
  } else if (task.status === 'pending') {
    const $cancelBtn = $('<button>', {
      class: 'btn btn-danger btn-sm',
      text: '取消'
    }).on('click', (event) => {
      event.stopPropagation(); // 阻止事件冒泡到行元素
      cancelTask(task.id);
    });
    
    $actionsTd.append($cancelBtn);
  } else if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
    const $removeBtn = $('<button>', {
      class: 'btn btn-secondary btn-sm',
      text: '移除'
    }).on('click', (event) => {
      event.stopPropagation(); // 阻止事件冒泡到行元素
      removeTask(task.id);
    });
    
    $actionsTd.append($removeBtn);
  }
}

/**
 * 创建下载表格行
 * @param {object} task - 下载任务信息
 * @returns {jQuery} 表格行元素
 */
function createDownloadTableRow(task) {
  const $row = $('<tr>').data('task-id', task.id);
  
  // 标题
  $row.append($('<td>', { text: task.title || '无标题' }));
  
  // 进度条
  const $progressBar = $('<div>', {
    class: 'progress-bar',
    role: 'progressbar',
    style: `width: ${task.progress}%`,
    'aria-valuenow': task.progress,
    'aria-valuemin': 0,
    'aria-valuemax': 100
  }).text(`${task.progress.toFixed(0)}%`);
  
  const $progress = $('<div>', {
    class: 'progress'
  }).append($progressBar);
  
  $row.append($('<td>').append($progress));
  
  // 状态
  const statusText = getStatusText(task.status);
  const statusClass = getStatusClass(task.status);
  
  $row.append($('<td>').append($('<span>', {
    class: `badge badge-${statusClass}`,
    text: statusText
  })));
  
  // 操作按钮
  const $actionsTd = $('<td>');
  addActionButtons($actionsTd, task);
  
  $row.append($actionsTd);
  
  // 点击行显示任务详情
  $row.on('click', () => showTaskDetails(task.id));
  
  return $row;
}

/**
 * 显示任务详情
 * @param {string} taskId - 任务ID
 */
function showTaskDetails(taskId) {
  const task = downloadTasks[taskId];
  if (!task) return;
  
  selectedTaskId = taskId;
  
  const $details = $('#taskDetails');
  $details.empty();
  
  const detailsHtml = `
    <h5>任务详情</h5>
    <div class="row">
      <div class="col-md-6">
        <p><strong>任务ID:</strong> ${task.id}</p>
        <p><strong>标题:</strong> ${task.title}</p>
        <p><strong>状态:</strong> <span class="badge badge-${getStatusClass(task.status)}">${getStatusText(task.status)}</span></p>
        <p><strong>进度:</strong> ${task.progress.toFixed(0)}%</p>

      </div>
      <div class="col-md-6">
        <p><strong>开始时间:</strong> ${task.startTime ? new Date(task.startTime).toLocaleString() : '未开始'}</p>
        <p><strong>结束时间:</strong> ${task.endTime ? new Date(task.endTime).toLocaleString() : '未结束'}</p>
        <p><strong>重试次数:</strong> ${task.retryCount || 0}</p>
        ${task.error ? `<p><strong>错误信息:</strong> ${task.error}</p>` : ''}
      </div>
    </div>
  `;
  
  $details.html(detailsHtml);
}

/**
 * 获取状态文本
 * @param {string} status - 状态
 * @returns {string} 状态文本
 */
function getStatusText(status) {
  const statusMap = {
    'pending': '等待中',
    'downloading': '下载中',
    'paused': '已暂停',
    'completed': '已完成',
    'failed': '下载失败',
    'cancelled': '已取消',
    'retrying': '重试中'
  };
  
  return statusMap[status] || status;
}

/**
 * 获取状态样式类
 * @param {string} status - 状态
 * @returns {string} 样式类
 */
function getStatusClass(status) {
  const classMap = {
    'pending': 'secondary',
    'downloading': 'primary',
    'paused': 'warning',
    'completed': 'success',
    'failed': 'danger',
    'cancelled': 'dark',
    'retrying': 'info'
  };
  
  return classMap[status] || 'secondary';
}



/**
 * 取消任务
 * @param {string} taskId - 任务ID
 */
async function cancelTask(taskId) {
  await ipcRenderer.invoke('download:cancel', taskId);
}

/**
 * 移除任务
 * @param {string} taskId - 任务ID
 */
function removeTask(taskId) {
  ipcRenderer.send('remove-download-task', taskId);
  
  // 清除选中的任务详情
  if (selectedTaskId === taskId) {
    selectedTaskId = null;
    $('#taskDetails').empty();
  }
}



/**
 * 取消所有任务
 */
function cancelAllTasks() {
  Object.keys(downloadTasks).forEach(taskId => {
    cancelTask(taskId);
  });
}

/**
 * 浏览保存路径
 */
function browseSavePath() {
  ipcRenderer.send('show-open-dialog', {
    dialogType: 'savePath',
    properties: ['openDirectory']
  });
}

/**
 * 浏览FFmpeg路径
 */
function browseFfmpegPath() {
  ipcRenderer.send('show-open-dialog', {
    dialogType: 'ffmpegPath',
    properties: ['openFile'],
    filters: [
      { name: '可执行文件', extensions: ['exe'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  });
}

/**
 * 检查FFmpeg版本
 */
function checkFfmpegVersion() {
  // 这里需要调用主进程的FFmpeg管理器来检查版本
  // 暂时简化处理
  log('检查FFmpeg版本功能暂未实现');
}



/**
 * 保存设置
 */
async function saveSettings() {
  const settings = {
    savePath: $('#savePath').val()?.trim()
  };
  
  try {
    const result = await ipcRenderer.invoke('settings:save', settings);
    if (result) {
      log('设置保存成功');
      // 如果修改了下载保存路径，单独记录日志
      if (settings.savePath) {
        log(`下载保存路径已设置为: ${settings.savePath}`);
      }
    } else {
      log('设置保存失败', 'error');
    }
  } catch (error) {
    log('保存设置失败: ' + error.message, 'error');
  }
}

/**
 * 清空日志
 */
function clearLog() {
  $('#logTextarea').val('');
}

/**
 * 记录日志
 * @param {string} message - 日志消息
 * @param {string} level - 日志级别 ('info', 'warning', 'error')
 */
function log(message, level = 'info') {
  const timestamp = new Date().toLocaleString();
  const logText = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
  
  const $logTextarea = $('#logTextarea');
  $logTextarea.val($logTextarea.val() + logText);
  
  // 滚动到底部
  $logTextarea.scrollTop($logTextarea[0].scrollHeight);
  
  // 确保level是有效的console方法
  const validLevels = ['log', 'info', 'warn', 'error', 'debug'];
  let consoleLevel = level;
  
  // 将常用的别名转换为标准方法名
  if (level === 'warning') {
    consoleLevel = 'warn';
  }
  
  // 如果level不是有效的console方法，则使用'log'
  if (!validLevels.includes(consoleLevel)) {
    consoleLevel = 'log';
  }
  
  // 在控制台输出
  console[consoleLevel](message);
}

/**
 * 格式化时长
 * @param {number} seconds - 时长（秒）
 * @returns {string} 格式化后的时长字符串
 */
function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '00:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  } else {
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
}