# 开发约定

- 本仓库独立维护网易云 Yomitan 查词功能；不得修改或推送 jp-furigana 的 main/standalone 或现有 PR。
- 改动后运行相关测试、完整 npm test 和打包验证，再按一轮完整修改同步本仓库。
- outputs、运行时 profile、用户词典、歌曲歌词、Anki 卡片、API key 和配置备份不得进入 Git。
- 用合成短句和模拟 AnkiConnect 测试；不得向真实 Anki 自动创建测试笔记。
- 保留 MIT 来源说明及 Yomitan GPL 声明；不把第三方词典打进插件。
- 不自动重启正在使用的网易云；需要运行验证时先形成可回滚的测试包。
