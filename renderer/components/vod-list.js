// 导入ipcRenderer
const { ipcRenderer } = require('electron');

class VodList {
  constructor() {
    this.vodList = [];
    this.filteredList = [];
    this.onDownloadClick = null;
  }

  init() {
    this.bindEvents();
  }

  bindEvents() {
    $('#searchInput').keyup(() => this.filterVodList());
    $('#refreshVodBtn').on('click', () => this.refreshVodList());
  }

  async refreshVodList() {
    // 从全局变量获取UID管理器实例
    if (typeof uidManager === 'undefined' || uidManager === null) {
      log('UID管理器未初始化', 'error');
      return;
    }
    
    const uidList = uidManager.getUidList();

    if (uidList.length === 0) {
      log('请先添加主播UID', 'warning');
      return;
    }

    // 清空回放列表
    this.vodList = [];
    this.refreshVodTable();

    // 获取每个UID的回放列表
    for (const uid of uidList) {
      try {
        const result = await ipcRenderer.invoke('api:fetch-vod-list', uid);
        // 合并回放列表
        const newVods = result.data.replay_info.map(vod => ({
          ...vod,
          uid: uid
        }));

        // 去重
        this.vodList = [...new Set([...this.vodList, ...newVods].map(v => JSON.stringify(v)))].map(v => JSON.parse(v));
        // 更新过滤列表，确保表格能正确渲染
        this.filteredList = [...this.vodList];

        this.refreshVodTable();
        log(`获取主播${uid}的回放列表成功，共${newVods.length}条记录`);
      } catch (error) {
        log(`获取主播${uid}的回放列表失败: ${error.message}`, 'error');
      }
    }
  }

  refreshVodTable() {
    const $tableBody = $('#vodTable tbody');
    $tableBody.empty();

    this.filteredList.forEach(vod => {
      const $row = this.createVodTableRow(vod);
      $tableBody.append($row);
    });
  }

  createVodTableRow(vod) {
    const startTime = new Date(vod.start_time * 1000).toLocaleString();
    const duration = this.formatDuration(vod.video_info.duration);

    const $row = $('<tr>');

    $row.append($('<td>', { text: vod.live_info.title || '无标题' }));
    $row.append($('<td>', { text: startTime }));
    $row.append($('<td>', { text: duration }));

    const $downloadBtn = $('<button>', {
      class: 'btn btn-primary btn-sm',
      text: '下载'
    }).on('click', (event) => {
      event.stopPropagation(); // 阻止事件冒泡到行元素
      if (this.onDownloadClick) {
        this.onDownloadClick(vod);
      } else {
        this.downloadVod(vod);
      }
    });

    const $actionsTd = $('<td>').append($downloadBtn);
    $row.append($actionsTd);

    return $row;
  }

  filterVodList() {
    const searchText = $('#searchInput').val().trim().toLowerCase();
    
    if (!searchText) {
      this.filteredList = this.vodList;
    } else {
      this.filteredList = this.vodList.filter(vod => 
        (vod.live_info.title || '').toLowerCase().includes(searchText)
      );
    }
    
    this.refreshVodTable();
  }

  downloadVod(vod) {
    const task = {
      title: vod.live_info.title || `主播${vod.uid}的直播回放`,
      vod: vod,
      status: 'pending',
      progress: 0
    };

    ipcRenderer.send('add-download-task', task);
  }

  formatDuration(seconds) {
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

  setOnDownloadClick(callback) {
    this.onDownloadClick = callback;
  }
}