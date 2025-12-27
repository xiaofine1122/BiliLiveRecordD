class LogView {
  constructor() {
    this.maxLogLines = 1000;
  }

  init() {
    this.bindEvents();
  }

  bindEvents() {
    $('#clearLogBtn').on('click', () => this.clearLog());
  }

  /**
   * 记录日志
   * @param {string} message - 日志消息
   * @param {string} level - 日志级别 ('info', 'warning', 'error')
   */
  log(message, level = 'info') {
    const timestamp = new Date().toLocaleString();
    const logText = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;

    const $logTextarea = $('#logTextarea');
    let currentLogs = $logTextarea.val();
    currentLogs += logText;

    // 限制日志行数
    const logLines = currentLogs.split('\n');
    if (logLines.length > this.maxLogLines) {
      currentLogs = logLines.slice(-this.maxLogLines).join('\n');
    }

    $logTextarea.val(currentLogs);

    // 滚动到底部
    $logTextarea.scrollTop($logTextarea[0].scrollHeight);

    // 在控制台输出
    console[level](message);
  }

  /**
   * 清空日志
   */
  clearLog() {
    $('#logTextarea').val('');
  }

  /**
   * 设置最大日志行数
   * @param {number} maxLines - 最大日志行数
   */
  setMaxLogLines(maxLines) {
    this.maxLogLines = maxLines;
  }
}