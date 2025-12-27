// 导入ipcRenderer
const { ipcRenderer } = require('electron');

class UidManager {
  constructor() {
    this.uidList = [];
    this.onUidChange = null;
  }

  init() {
    this.bindEvents();
    this.loadUidList();
  }

  bindEvents() {
    $('#addUidBtn').on('click', () => this.addUid());
    $('#uidInput').keypress((e) => {
      if (e.which === 13) this.addUid();
    });
  }

  loadUidList() {
    ipcRenderer.send('get-uid-list');
    ipcRenderer.on('uid-list-returned', (event, list) => {
      this.uidList = list;
      this.refreshUidList();
      // 初始化加载时不触发回调，避免自动刷新回放列表
    });
  }

  addUid() {
    const uid = $('#uidInput').val().trim();
    if (!uid) {
      log('请输入用户uid', 'warning');
      return;
    }

    if (!/^\d+$/.test(uid)) {
      log('UID必须是数字', 'warning');
      return;
    }

    ipcRenderer.send('add-uid', uid);
    $('#uidInput').val('');

    ipcRenderer.on('uid-added', (event, newUidList) => {
      this.uidList = newUidList;
      this.refreshUidList();
      if (this.onUidChange) this.onUidChange(this.uidList);
    });
  }

  removeUid(uid) {
    ipcRenderer.send('remove-uid', uid);
    ipcRenderer.on('uid-removed', (event, newUidList) => {
      this.uidList = newUidList;
      this.refreshUidList();
      if (this.onUidChange) this.onUidChange(this.uidList);
    });
  }

  refreshUidList() {
    const $uidList = $('#uidList');
    $uidList.empty();

    this.uidList.forEach(uid => {
      const $uidTag = $('<div>', {
        class: 'uid-tag',
        text: uid
      });

      const $closeBtn = $('<span>', {
        class: 'close-btn',
        text: '×'
      }).on('click', () => this.removeUid(uid));

      $uidTag.append($closeBtn);
      $uidList.append($uidTag);
    });
  }

  getUidList() {
    return this.uidList;
  }

  setOnUidChange(callback) {
    this.onUidChange = callback;
  }
}