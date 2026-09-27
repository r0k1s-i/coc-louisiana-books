# 路易斯安那系列 · 克苏鲁跑团 Replay 文字整理

克苏鲁的呼唤（Call of Cthulhu）跑团 Replay「路易斯安那系列」三部曲的 OCR 校对 + 排版文字版，来源是 [歌味觉死](https://www.bilibili.com) 的 B 站视频 Replay。

| 书名 | 系列 | 原视频 |
| --- | --- | --- |
| 《低电》LOW POWER | 上篇 | <https://www.bilibili.com/video/BV1V24y177sX> |
| 《短见》SHORT-SIGHTED | 中篇 | <https://www.bilibili.com/video/BV1sY4y1Q7Gv> |
| 《畅梦人》OPEN DREAMER | 下篇·完结 | <https://www.bilibili.com/video/BV1K2TbzFEVB> |


## 仓库内容

```
低电_排版版.md      低电_排版版.md
短见_排版版.md      短见_排版版.md
畅梦人_排版版.md    畅梦人_排版版.md
tools/              排版 md -> epub 的生成工具
```

正文是纯 Markdown：旁白、对话、招牌、引用资料、骰子检定卡片、注释都有各自的排版约定（见文件内实例，无需额外说明文档，读几段就能看懂）。

## 一起校对

文字是从视频字幕 OCR 逐句抠出来再整理的，纸浆天赋、检定、人名地名这些细节还没有精力逐字复核，欢迎一起挑错：

- **改文字**：直接编辑对应的 `*_排版版.md`，提 PR。小到一个错别字、一处人名不一致，都欢迎。
- **提问题**：不确定原意、找到疑似 OCR 误读但不确定怎么改，开 Issue 讨论。
- 提交前不需要跑任何工具或搭建环境——文字本身才是仓库的价值所在。

## 从 md 生成 epub

`tools/` 里是把排版版 md 渲染成 epub 的工具，纯 Node.js（无 npm 依赖）+ 系统 `zip` 命令：

```bash
node tools/低电_02_build_epub.js      # 低电.epub
node tools/短见_02_build_epub.js      # 短见.epub
node tools/畅梦人_02_build_epub.js    # 畅梦人.epub
```

- `tools/common_epub.js`：三本书共用的排版/打包引擎。
- `tools/<书名>_02_build_epub.js`：每本书的封面、简介、免责声明等元数据。
- `tools/images/`：封面图与作者头像。

未来如果要给正文加插图，直接在对应 `*_排版版.md` 里用 `![说明](tools/images/xxx.png)` 引用、图片放进 `tools/images/`；`common_epub.js` 打包时会一并收进 epub（参考 `短见_02_build_epub.js` 里 `images` 字段的用法）。

## 版本发布

只想读书的话，直接去 [Releases](https://github.com/r0k1s-i/coc-louisiana-books/releases) 下载最新的三本 epub。

epub 由 GitHub Actions（`.github/workflows/epub.yml`）自动构建，不进 git 仓库：

- 每个 PR / 每次推到 `main` 都会构建一遍，确认改动没有把 epub 解析弄崩；构建产物可以在该次 Actions 运行页面的 Artifacts 里下载预览。
- 校对积累到一定量后，维护者推一个 tag（如 `git tag v0.2 && git push origin v0.2`），Actions 会自动创建对应 Release 并附上三本 epub。

## 给 AI 协作者

如果你是 Claude Code / Gemini CLI 之类的 agent，先读 [`AGENTS.md`](./AGENTS.md)。
