// 导入ipcRenderer
const { ipcRenderer } = require('electron');

class DownloadQueue {
  constructor() {
    this.downloadTasks = {};
    this.selectedTaskId = null;
    this.onTaskStatusChange = null;
  }

  async init() {
    this.bindEvents();
    this.initIpcListeners();
    
    // 初始化时获取现有下载任务
    try {
      const allTasks = await ipcRenderer.invoke('download:get-all');
      if (allTasks && Array.isArray(allTasks)) {
        allTasks.forEach(task => {
          this.downloadTasks[task.id] = task;
        });
        this.refreshDownloadTable();
      }
    } catch (error) {
      console.error('获取下载任务列表失败:', error);
    }
  }

  bindEvents() {
    $('#pauseAllBtn').on('click', () => this.pauseAllTasks());
    $('#resumeAllBtn').on('click', () => this.resumeAllTasks());
    $('#cancelAllBtn').on('click', () => this.cancelAllTasks());
  }

  initIpcListeners() {
    // 下载管理IPC事件
    ipcRenderer.on('download-task-added', (event, result) => {
      if (result.task) {
        this.downloadTasks[result.task.id] = result.task;
        this.refreshDownloadTable();
        log(`添加下载任务: ${result.task.title}`);
        if (this.onTaskStatusChange) this.onTaskStatusChange();
      }
    });

    ipcRenderer.on('download-task-removed', (event, result) => {
      console.log('收到下载任务移除事件:', JSON.stringify(result));
      console.log('事件类型:', typeof result);
      console.log('当前downloadTasks:', JSON.stringify(this.downloadTasks));
      
      // 兼容不同格式的事件数据
      let taskId;
      if (typeof result === 'string') {
        taskId = result;
        console.log('检测到字符串格式的taskId:', taskId);
      } else if (result && result.taskId) {
        taskId = result.taskId;
        console.log('检测到对象格式的taskId:', taskId);
      } else {
        console.error('download-task-removed事件格式不正确:', result);
        return;
      }
      
      if (this.downloadTasks[taskId]) {
        delete this.downloadTasks[taskId];
        console.log('从downloadTasks中删除任务:', taskId);
      } else {
        console.log('任务不在downloadTasks中:', taskId, '当前downloadTasks:', Object.keys(this.downloadTasks));
      }
      
      console.log('删除后downloadTasks:', JSON.stringify(this.downloadTasks));
      
      // 强制刷新表格
      this.refreshDownloadTable();
      log(`移除下载任务: ${taskId}`);
      if (this.onTaskStatusChange) this.onTaskStatusChange();
    });

    ipcRenderer.on('download-task-started', (event, result) => {
      if (this.downloadTasks[result.taskId]) {
        this.downloadTasks[result.taskId].status = 'downloading';
        this.refreshDownloadTable();
        log(`开始下载: ${this.downloadTasks[result.taskId].title}`);
        if (this.onTaskStatusChange) this.onTaskStatusChange();
      }
    });

    ipcRenderer.on('download-task-progress', (event, result) => {
      if (this.downloadTasks[result.taskId]) {
        this.downloadTasks[result.taskId].progress = result.progress;
        this.refreshDownloadTable();
        if (this.onTaskStatusChange) this.onTaskStatusChange();
      }
    });

    ipcRenderer.on('download-task-completed', (event, result) => {
      if (this.downloadTasks[result.taskId]) {
        this.downloadTasks[result.taskId].status = 'completed';
        this.refreshDownloadTable();
        log(`下载完成: ${this.downloadTasks[result.taskId].title}`);
        if (this.onTaskStatusChange) this.onTaskStatusChange();
      }
    });

    ipcRenderer.on('download-task-failed', (event, result) => {
      if (this.downloadTasks[result.taskId]) {
        this.downloadTasks[result.taskId].status = 'failed';
        this.downloadTasks[result.taskId].error = result.error;
        this.refreshDownloadTable();
        log(`下载失败: ${this.downloadTasks[result.taskId].title}, 错误: ${result.error}`, 'error');
        if (this.onTaskStatusChange) this.onTaskStatusChange();
      }
    });

    ipcRenderer.on('download-task-paused', (event, result) => {
      if (this.downloadTasks[result.taskId]) {
        this.downloadTasks[result.taskId].status = 'paused';
        this.refreshDownloadTable();
        log(`暂停下载: ${this.downloadTasks[result.taskId].title}`);
        if (this.onTaskStatusChange) this.onTaskStatusChange();
      }
    });

    ipcRenderer.on('download-task-resumed', (event, result) => {
      if (this.downloadTasks[result.taskId]) {
        this.downloadTasks[result.taskId].status = 'pending';
        this.refreshDownloadTable();
        log(`继续下载: ${this.downloadTasks[result.taskId].title}`);
        if (this.onTaskStatusChange) this.onTaskStatusChange();
      }
    });

    ipcRenderer.on('download-task-retrying', (event, result) => {
      if (this.downloadTasks[result.taskId]) {
        log(`重试下载: ${this.downloadTasks[result.taskId].title}, 第${result.retryCount}次`);
        if (this.onTaskStatusChange) this.onTaskStatusChange();
      }
    });

    ipcRenderer.on('download-task-cancelled', (event, result) => {
      if (this.downloadTasks[result.taskId]) {
        this.downloadTasks[result.taskId].status = 'cancelled';
        this.refreshDownloadTable();
        log(`取消下载: ${this.downloadTasks[result.taskId].title}`);
        if (this.onTaskStatusChange) this.onTaskStatusChange();
      }
    });
  }

  refreshDownloadTable() {
    console.log('开始执行refreshDownloadTable');
    const $tableBody = $('#downloadTableBody');
    
    console.log('当前downloadTasks:', JSON.stringify(this.downloadTasks));
    console.log('表格行数:', $tableBody.children('tr').length);

    // 如果downloadTasks为空，直接清空表格
    if (Object.keys(this.downloadTasks).length === 0) {
      console.log('downloadTasks为空，清空表格');
      $tableBody.empty();
      this.updateQueueStatus();
      return;
    }

    // 检查是否已经有表格行，如果有则先移除已不存在的任务行，再更新现有行，否则创建新行
    if ($tableBody.children().length > 0) {
      // 移除已不存在的任务行
      console.log('开始移除已不存在的任务行...');
      const currentTaskIds = Object.keys(this.downloadTasks);
      $tableBody.children('tr').each(function() {
        const $row = $(this);
        const taskId = $row.data('task-id');
        console.log('检查行taskId:', taskId, '是否存在于downloadTasks中:', currentTaskIds.includes(taskId));
        if (!currentTaskIds.includes(taskId)) {
          console.log('移除任务行:', taskId);
          $row.remove();
        }
      });
      console.log('移除任务行完成，当前表格行数:', $tableBody.children('tr').length);
      
      // 更新现有行
      console.log('开始更新现有行...');
      $tableBody.children('tr').each(function() {
        const $row = $(this);
        const taskId = $row.data('task-id');
        const task = this.downloadTasks[taskId];
        
        if (task) {
          console.log('更新任务行:', taskId);
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
            const statusText = this.getStatusText(task.status);
            const statusClass = this.getStatusClass(task.status);
            $statusBadge.text(statusText)
                        .removeClass().addClass(`badge badge-${statusClass}`);
          }
          
          // 更新操作按钮
          const $actionsTd = $row.find('td:last');
          if ($actionsTd.length) {
            $actionsTd.empty();
            this.addActionButtons($actionsTd, task);
          }
        }
      }.bind(this));
      console.log('更新现有行完成');
      
      // 检查是否有新任务需要添加
      console.log('开始添加新任务...');
      const existingTaskIds = $tableBody.children('tr').map(function() {
        return $(this).data('task-id');
      }).get();
      
      Object.values(this.downloadTasks).forEach(task => {
        if (!existingTaskIds.includes(task.id)) {
          console.log('添加新任务行:', task.id);
          const $row = this.createDownloadTableRow(task);
          $tableBody.append($row);
        }
      }, this);
      console.log('添加新任务完成，当前表格行数:', $tableBody.children('tr').length);
    } else {
      // 创建所有行
      console.log('创建所有任务行...');
      Object.values(this.downloadTasks).forEach(task => {
        console.log('创建任务行:', task.id);
        const $row = this.createDownloadTableRow(task);
        $tableBody.append($row);
      });
      console.log('创建所有任务行完成，当前表格行数:', $tableBody.children('tr').length);
    }

    // 更新任务详情
    if (this.selectedTaskId && this.downloadTasks[this.selectedTaskId]) {
      this.showTaskDetails(this.selectedTaskId);
    }

    // 更新队列状态
    this.updateQueueStatus();
  }

  createDownloadTableRow(task) {
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
    const statusText = this.getStatusText(task.status);
    const statusClass = this.getStatusClass(task.status);

    $row.append($('<td>').append($('<span>', {
      class: `badge badge-${statusClass}`,
      text: statusText
    })));

    // 操作按钮
    const $actionsTd = $('<td>');

    // 根据任务状态显示不同的按钮
    if (task.status === 'downloading') {
      const $pauseBtn = $('<button>', {
        class: 'btn btn-warning btn-sm mr-1',
        text: '暂停'
      }).on('click', (event) => {
        event.stopPropagation();
        this.pauseTask(task.id);
      });

      const $cancelBtn = $('<button>', {
        class: 'btn btn-danger btn-sm',
        text: '取消'
      }).on('click', (event) => {
        event.stopPropagation();
        this.cancelTask(task.id);
      });

      $actionsTd.append($pauseBtn, $cancelBtn);
    } else if (task.status === 'paused') {
      const $resumeBtn = $('<button>', {
        class: 'btn btn-success btn-sm mr-1',
        text: '继续'
      }).on('click', (event) => {
        event.stopPropagation();
        this.resumeTask(task.id);
      });

      const $cancelBtn = $('<button>', {
        class: 'btn btn-danger btn-sm',
        text: '取消'
      }).on('click', (event) => {
        event.stopPropagation();
        this.cancelTask(task.id);
      });

      $actionsTd.append($resumeBtn, $cancelBtn);
    } else if (task.status === 'pending') {
      const $cancelBtn = $('<button>', {
        class: 'btn btn-danger btn-sm',
        text: '取消'
      }).on('click', (event) => {
        event.stopPropagation();
        this.cancelTask(task.id);
      });

      $actionsTd.append($cancelBtn);
    } else if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      const $removeBtn = $('<button>', {
        class: 'btn btn-secondary btn-sm',
        text: '移除'
      }).on('click', (event) => {
        event.stopPropagation();
        this.removeTask(task.id);
      });

      $actionsTd.append($removeBtn);
    }

    $row.append($actionsTd);

    // 点击行显示任务详情
    $row.on('click', () => this.showTaskDetails(task.id));

    return $row;
  }

  showTaskDetails(taskId) {
    const task = this.downloadTasks[taskId];
    if (!task) return;

    this.selectedTaskId = taskId;

    const $details = $('#taskDetails');
    $details.empty();

    const detailsHtml = `
      <h5>任务详情</h5>
      <div class="row">
        <div class="col-md-6">
          <p><strong>任务ID:</strong> ${task.id}</p>
          <p><strong>标题:</strong> ${task.title}</p>
          <p><strong>状态:</strong> <span class="badge badge-${this.getStatusClass(task.status)}">${this.getStatusText(task.status)}</span></p>
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

  getStatusText(status) {
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

  getStatusClass(status) {
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

  pauseTask(taskId) {
    ipcRenderer.send('pause-download-task', taskId);
  }

  resumeTask(taskId) {
    ipcRenderer.send('resume-download-task', taskId);
  }

  async cancelTask(taskId) {
    await ipcRenderer.invoke('download:cancel', taskId);
  }

  removeTask(taskId) {
    console.log('开始执行removeTask，taskId:', taskId);
    console.log('执行前downloadTasks:', JSON.stringify(this.downloadTasks));
    
    ipcRenderer.send('remove-download-task', taskId);

    // 立即从本地状态中移除任务并刷新表格，确保界面及时更新
    if (this.downloadTasks[taskId]) {
      delete this.downloadTasks[taskId];
      console.log('从downloadTasks中删除任务，删除后:', JSON.stringify(this.downloadTasks));
      this.refreshDownloadTable();
    } else {
      console.log('任务不在downloadTasks中:', taskId);
    }

    // 清除选中的任务详情
    if (this.selectedTaskId === taskId) {
      this.selectedTaskId = null;
      $('#taskDetails').empty();
    }
    
    console.log('removeTask执行完成');
  }

  pauseAllTasks() {
    Object.keys(this.downloadTasks).forEach(taskId => {
      this.pauseTask(taskId);
    });
  }

  resumeAllTasks() {
    Object.keys(this.downloadTasks).forEach(taskId => {
      this.resumeTask(taskId);
    });
  }

  cancelAllTasks() {
    Object.keys(this.downloadTasks).forEach(taskId => {
      this.cancelTask(taskId);
    });
  }

  updateQueueStatus() {
    const totalTasks = Object.keys(this.downloadTasks).length;
    const downloadingTasks = Object.values(this.downloadTasks).filter(task => task.status === 'downloading').length;
    const pendingTasks = Object.values(this.downloadTasks).filter(task => task.status === 'pending').length;
    const completedTasks = Object.values(this.downloadTasks).filter(task => task.status === 'completed').length;

    const statusText = `队列状态：共${totalTasks}个任务（下载中：${downloadingTasks}，等待中：${pendingTasks}，已完成：${completedTasks}）`;
    $('#queueStatusText').text(statusText);
  }

  setOnTaskStatusChange(callback) {
    this.onTaskStatusChange = callback;
  }
}