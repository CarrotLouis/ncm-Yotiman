# 商店分发与维护

提交准则：[BetterNCM 插件商店上架插件方式及准则](https://github.com/std-microblock/chromatic/wiki/插件商店上架插件方式及准则)。

## 来源与构建

源码维护在 `main`。`Store build` 工作流在 Windows 上执行完整 JavaScript 回归、编译 .NET 4.8 辅助程序、下载并核验固定 SHA256 的 Yomitan 26.10.12.0、保留 WebView2 SDK 和 Yomitan 许可，再打包和检查。只有主分支的成功构建可以将完整产物发布到 `store` 分支。PR 构建不发布。

商店登记使用 `CarrotLouis/ncm-Yotiman`，分支 `store`，子目录 `/plugin`。目录内仅有运行文件、预览图与许可/源码获取说明。可执行程序由 GitHub Actions 编译，不从开发者机器上传。原生宿主的编译步骤及源码全部公开。`build-info.json` 位于商店分支根目录，记录对应主分支提交、Actions 链接、依赖和运行文件的 SHA256。

维护更新时提交 `main`，同步修改 package/manifest/诊断版本号。Actions 成功后更新 `store`；商店定时脚本再抓取版本并提出更新审核。失败构建不会更新商店分支，不强推旧构建，不自动重启用户客户端。更新仍需商店维护者审核。

## 开源与分发

- 本项目适配器和原生宿主为 MIT，保留源自 jp-furigana 的 Redux 查找和 ZIP 工具的来源声明。
- Yomitan 为独立、未修改的 GPL-3.0-or-later 组件。对应固定提交 `e7334a96106a6c74e6fa75bd33a5ea1219d92712` 的完整源码归档与插件同时发布到 `store/sources`，无需登录即可下载。`/plugin/CORRESPONDING-SOURCE.txt` 和分支 README 指明免费源码下载位置；Yomitan 原有许可证及第三方依赖说明保留在插件内部。
- 同目录还提供本次插件/宿主的完整源码 ZIP；维护者应长期保留对应旧版本源码，可通过 `store` 分支历史取回。
- WebView2 SDK 为 1.0.2903.40，随所需 DLL 分发微软的 LICENSE 和 NOTICE；系统 WebView2 Runtime 不随包分发。
- 用户词典、词典 ZIP、整首歌词、人工纠音文件、Anki 数据、密钥和个人配置都不进入源码或商店产物。示例和测试均使用合成短句；原生回归只连接隔离的模拟 Anki 服务。

## 功能、依赖与数据流

独立提供 Yomitan 查词，不替代振假名插件，也不修改其原有商店 PR。可读取页面上振假名和人工纠音作为当前句子快照。独立 ID 为 `ncm-yotiman`，名称为「Yomitan 歌词词典」。仅复用少量 MIT 工具函数，不以振假名变体的身份登记，避免商店把不同用途的两个插件视为互斥变体。

支持 Windows x64、.NET Framework 4.8、WebView2 Runtime、BetterNCM 1.3.4 及网易云 3.x。硬依赖 `RefinedNowPlayingNext`，已验证版本 3.0.2；商店只能按插件 ID 声明依赖，无法锁定版本。安装/更新后需要用户择时重启。

词典功能默认关闭。启用后预热并按需打开本地辅助程序，运行时数据在 `<BetterNCM 数据目录>/ncm-yotiman`。插件通过临时文件向自己的辅助程序发送一次选词、该行原文/当前读音/译文、歌名/歌手/链接；请求处理后删除。辅助程序空闲且没有可见窗口时退出。

本插件不向外部歌词网站检索或上传歌词。Yomitan 的词典 ZIP 由用户自行导入。点击原生制卡按钮时，按用户配置通过 AnkiConnect 发送字段；联网发音等 Yomitan 功能由其设置控制。插件自身不附带在线翻译、自动录音、遥测或远程代码下载。剪贴板自动监控在查词页关闭。

设置页提供可通过外部浏览器打开的[源码仓库](https://github.com/CarrotLouis/ncm-Yotiman)与[反馈入口](https://github.com/CarrotLouis/ncm-Yotiman/issues)。
