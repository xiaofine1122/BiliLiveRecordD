# B站直播回放下载器

[![GitHub Repo](https://img.shields.io/badge/GitHub-Project-blue.svg)](https://github.com/xiaofine1122/BiliLiveRecordD)

B站直播回放下载器是一款基于Electron开发的Windows客户端工具，用于下载B站（哔哩哔哩）直播回放视频。

项目地址：[https://github.com/xiaofine1122/BiliLiveRecordD](https://github.com/xiaofine1122/BiliLiveRecordD)

## 功能特性

- ✅ 支持通过主播UID批量获取直播回放列表
- ✅ 支持选择性下载指定回放视频
- ✅ 实时显示下载进度和状态
- ✅ 支持下载队列管理（暂停、继续、移除任务）
- ✅ 支持自定义下载路径
- ✅ 自动合并分段视频文件
- ✅ 支持Cookie持久化存储
- ✅ 实时日志查看功能

## 从源码运行

1. 克隆或下载项目源码
2. 安装依赖：
   ```bash
   npm install
   ```
3. 启动开发模式：
   ```bash
   npm run dev
   ```
4. 或启动生产模式：
   ```bash
   npm start
   ```

## 使用方法

### 1. 配置Cookie

由于B站API需要登录认证，您需要先配置Cookie：

1. 点击界面左上角的「Cookie设置」按钮
2. 在弹出的窗口中输入您的B站Cookie（主要需要`SESSDATA`）
3. 点击「保存Cookie」

### 2. 添加主播UID

1. 在界面左侧的「UID管理」区域，输入主播的UID
2. 点击「添加」按钮
3. 可以添加多个UID进行管理

### 3. 获取直播回放列表

1. 选择一个已添加的UID
2. 点击「获取直播回放列表」按钮
3. 程序将获取该主播的所有直播回放视频

### 4. 下载直播回放

1. 在回放列表中选择要下载的视频
2. 点击「下载选中」按钮
3. 或点击单个视频右侧的「下载」按钮
4. 下载任务将添加到右侧的下载队列中

### 5. 管理下载队列

- **查看进度**：下载队列中会显示每个任务的下载进度
- **暂停/继续**：点击任务行的「暂停」/「继续」按钮
- **移除任务**：点击任务行的「移除」按钮
- **设置下载路径**：点击界面右上角的「设置」按钮，在弹出的窗口中设置下载路径

## 技术栈

- **主框架**：Electron 26.3.0
- **开发语言**：JavaScript
- **UI框架**：原生HTML/CSS + jQuery
- **HTTP客户端**：Axios
- **视频处理**：FFmpeg + fluent-ffmpeg
- **持久化存储**：electron-store
- **打包工具**：electron-builder
- **日志管理**：electron-log
- **其他依赖**：uuid

## 项目结构

```
BiliLiveRecordD/
├── assets/              # 静态资源文件
│   └── icons/           # 应用图标
├── build/               # 构建相关配置
├── dist/                # 打包输出目录
├── ffmpeg/              # FFmpeg工具
├── main/                # 主进程代码
│   ├── api-client.js    # B站API客户端
│   ├── cookie-manager.js # Cookie管理
│   ├── download-manager.js # 下载管理
│   ├── ffmpeg-manager.js # FFmpeg管理
│   ├── main.js          # 主入口文件
│   ├── preload.js       # 预加载脚本
│   └── utils.js         # 工具函数
├── renderer/            # 渲染进程代码
│   ├── components/      # UI组件
│   ├── images/          # 界面图片
│   ├── app.js           # 渲染进程主文件
│   ├── index.html       # 主界面
│   ├── main.js          # 界面逻辑
│   └── style.css        # 样式文件
└── package.json         # 项目配置
```

## 配置说明

### Cookie配置

Cookie用于B站API认证，主要需要`SESSDATA`字段。您可以通过以下方式获取：

1. 登录B站网页版
2. 按F12打开开发者工具
3. 切换到「网络」标签
4. 刷新页面，找到任意B站请求
5. 在请求头中找到「Cookie」字段，复制其中的`SESSDATA`部分

### 下载路径配置

默认下载路径为应用程序目录下的`downloads`文件夹，您可以通过界面右上角的「设置」按钮自定义下载路径。

### FFmpeg配置

程序已内置FFmpeg工具，用于视频文件处理。如果需要使用自定义的FFmpeg，可以替换`ffmpeg/`目录下的`ffmpeg.exe`和`ffprobe.exe`文件。

## 常见问题

### 1. 无法获取直播回放列表

**原因**：可能是Cookie配置不正确或已过期。
**解决方法**：重新配置有效的Cookie。

### 2. 下载失败或速度慢

**原因**：可能是网络问题或B站服务器限制。
**解决方法**：
- 检查网络连接
- 尝试减少同时下载的任务数量
- 等待一段时间后重新下载

### 3. 程序无法启动

**原因**：可能是缺少依赖文件或系统环境问题。
**解决方法**：
- 尝试使用绿色版程序
- 确保系统已安装最新的Visual C++ Redistributable

## 数据存储位置

### Cookie存储

Cookie数据使用`electron-store`存储在用户数据目录：
```
%APPDATA%\bilibili-vod-downloader\config.json
```

### 下载文件存储

默认存储在应用程序目录下的`downloads`文件夹，可通过设置自定义路径。

### 日志文件存储

日志文件存储在：
```
%APPDATA%\bilibili-vod-downloader\logs
```

## 许可证

本项目采用MIT许可证，详情请查看LICENSE文件。

## 更新日志

### v1.0.0 (2025-12-27)
- 首次发布
- 实现基本的直播回放下载功能
- 支持多任务管理
- 支持Cookie持久化

## 联系方式

如果您有任何问题或建议，欢迎通过以下方式联系：

- 提交Issue
- 发送邮件

---

**声明**：本工具仅用于学习和研究目的，请勿用于非法用途。下载的视频内容请遵守B站的相关规定。