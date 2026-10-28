# ncm-Yotiman

网易云音乐 PC / BetterNCM 的独立 Yomitan 歌词词典插件。导入自己的词典，按住 **Shift 拖选歌词**，松开鼠标打开独立查词窗口；通过 Yomitan 原生 Anki integration 制卡，可附加 ShareX 录制的音频。

**当前为 0.1.0 实验版。** 源码独立维护，不更新 `jp-furigana` 的现有 PR，不替代振假名插件。仓库名按项目命名使用 `Yotiman`，集成的词典项目名称为 **Yomitan**。

## 功能

- 在 RefinedNowPlayingNext 3.0.2 设置中增加“词典”，优先放在“注音”后；没有注音插件时放在“歌词”后。
- 开关控制按需查词；独立窗口使用原版 Yomitan 的词典导入、设置和 Anki 功能。
- 用坐标对应的 DOM Range 处理 Shift 拖选，减少客户端禁止原生文字选择造成的失败；拦截同次点击，防止跳转播放进度。
- 捕获整行原文时同时快照当前振假名，读取人工纠音后的当前读音，跳过划掉的旧读音、译文、隐藏括号和逐字高亮副本。
- `{sentence}` 和 `{sentence-furigana}` 制卡时继承快照中的振假名；`{sentence-furigana-plain}` 可用于 Anki 方括号注音。查词词条本身仍使用词典原始释义。
- 手动选择 ShareX 已录制的音频，填写 Anki 音频字段名；点击 Yomitan 添加按钮时才上传。不自动录音、不读取剪贴板和 ShareX 任务。
- “运行检查”显示组件、歌曲信息和选词流程状态，不记录整首歌词或 Anki 密钥。

## 使用条件

- Windows x64、.NET Framework 4.8、Microsoft Edge WebView2 Runtime。
- 网易云音乐 3.x + BetterNCM/chromatic 1.3.4；播放页适配 RefinedNowPlayingNext 3.0.2。
- 可选：[日语歌词振假名 Plus](https://github.com/CarrotLouis/jp-furigana/tree/standalone)。当前读音直接从页面读取，包含网易云音译、外部网站读音和人工纠音。
- 制卡需要运行 Anki 并安装 AnkiConnect。词典 ZIP 由用户自行导入，不包含在插件中。

## 安装与设置

从本地构建得到 `.plugin` 后，使用 BetterNCM 安装并在合适时重启网易云。不要同时保留多个 `ncm-yotiman` 版本。

1. 在播放页“词典”开启功能，点击“打开 Yomitan 设置”。
2. 在 Dictionaries 中导入 Yomitan 格式 ZIP，并确认词典已启用。
3. 按住 Shift，从歌词的**原文字面**拖选同一行中的词语，松开鼠标。
4. 如果制卡，在 Yomitan → Anki 中启用连接，再进入 Configure Anki flashcards，**选牌组、笔记类型，映射字段**。仅打开 Enable Anki integration 还不能制卡。
5. 句子字段可用 `{sentence}` 或 `{sentence-furigana}`，歌曲信息用 `{document-title}`，释义可用 `{glossary}`。字段名取决于自己的笔记类型。
6. 附加歌曲音频时，先用 ShareX 录好片段，在查词窗口选择文件，并填写实际音频字段名。默认值 `SentenceAudio` 只是示例，笔记中必须有同名字段。支持 MP3/WAV/OGG/M4A/AAC/FLAC/WebM，单文件最多 20 MB。

同一次拖选保留当时整行文字和读音，之后歌词滚动或切歌不会改变这张卡片的上下文。再次查词会清除上次选择的音频。

## 与早期合并实验版的关系

独立版检测到 `jp-furigana-plus` 的旧词典适配器时，关闭旧适配器，避免同一次拖选打开两次窗口；振假名功能继续由 Plus 管理。已有 PR 跟踪的 `main` / `standalone` 分支不包含这些新改动。

独立版的数据保存在 `<BetterNCM 数据目录>/ncm-yotiman/`，不会删除旧实验版的 profile。首次迁移需要重新导入词典 ZIP；Anki 等设置可先在旧 Yomitan 的 Backup 中导出，再在新窗口导入。安装目录中的组件会复制到固定的数据目录，避免 BetterNCM 重建插件工作目录导致扩展路径失效。

功能默认关闭；仅打开设置或查词时启动辅助进程。独立窗口全部关闭后最多 30 秒退出。WebView2 和大词典导入会占用额外内存，项目不打包 Electron，也不再携带振假名插件的离线分词词典。

## 开发构建

需要 Node.js 22+、.NET SDK 8，以及 Windows 构建环境。
从 [Yomitan 官方 26.10.12.0 release](https://github.com/yomidevs/yomitan/releases/tag/26.10.12.0) 下载 `yomitan-chrome.zip`，脚本会核验固定 SHA256。

```powershell
npm ci
npm test
powershell -NoProfile -File tools/build-yomitan.ps1 -YomitanArchive C:\Downloads\yomitan-chrome.zip
npm run build
```

生成 `builds/ncm-yotiman-0.1.0.plugin`。构建不会自动安装、重启网易云或发布 Release。
仓库仅包含源码和测试，不包含第三方词典、用户 profile、Anki 卡片和运行时歌词。

## 故障定位

在 BetterNCM 的本插件设置页点击“运行检查”：

- `helperExists: false`：只安装了源码，未构建原生组件。
- `hasTrack: false`：未取得当前歌曲信息；打开播放页后再试。
- `gesture.down: 0`：拖选没有进入事件处理，检查功能开关和目标是否为原文。
- `selected: 0`：没有形成有效的同一行选区；从字面开始拖，不跨译文或相邻行。
- `sent` 增加但没有窗口：查看返回错误；设置页必须能打开，系统也需要 WebView2 Runtime。
- 有查词窗口但没有释义：在独立 Yomitan 设置中检查词典是否已导入并启用。
- 有释义但不能制卡：检查 AnkiConnect、牌组、笔记类型和字段映射；音频字段名必须存在。

## 调研与验证

2026-10-28 检查了 GitHub 仓库搜索、BetterNCM 商店代码及中英文网页索引，未找到覆盖这套离线词典/Yomitan 查词流程的网易云插件；这不表示一定不存在。
相近的 [LyricLens](https://github.com/yoruuuchan/LyricLens) 是 AI 歌词学习浮层，需要 LLM 服务，仓库已于 2026-09-15 归档。

自动测试覆盖当前读音快照、人工纠音、隐藏/重复文本过滤、正反向拖选、原生选择被阻止的场景、独立配置、旧适配器交接与 RNP 菜单位置。原生集成测试使用模拟 AnkiConnect，禁止向真实 Anki 自动添加测试笔记。

Windows 原生测试已验证：

- 明镜 1.4.4 导入 139,462 个词条，约 44 秒；释义保留原样式。
- 在 `pointerdown` / `selectstart` 被拦截的浏览器环境中，旧鼠标事件路径未产生选区，新路径成功选中“戀人”，并取得 `あなた` 的当前读音。
- 原版 Yomitan 添加按钮的 `{sentence}`、`{sentence-furigana}`、`{sentence-furigana-plain}` 均保留人工读音，音频经模拟 AnkiConnect 保存并附加。
- 修复欢迎页被 WebView2 错标为用户操作、覆盖查词页的问题。

可通过 `companion/pointer-smoke/Pointer.csproj` 重跑浏览器拖选回归，通过 `companion/yomitan-smoke/Smoke.csproj` 和 `tests/yomitan-anki-mock.cjs` 重跑原生集成测试。测试数据必须保存在仓库外的专用目录。

完整客户端鼠标交互仍需在实际网易云/RNP 中验证；该版本不宣称已通过所有环境验证。

## 许可

本仓库自行编写的代码为 MIT；Yomitan 为独立的 GPL-3.0-or-later 组件，WebView2 SDK 使用微软许可。详见 [NOTICE.md](NOTICE.md)。公开分发组合二进制前须包含精确对应的 Yomitan 源代码与所需许可；不重新分发用户词典。
