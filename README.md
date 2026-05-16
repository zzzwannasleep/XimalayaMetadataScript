# XimalayaMetadataScript

一个给喜马拉雅专辑页用的浏览器脚本，目标先收敛在一件事上：生成符合 Audiobookshelf / 整理规范习惯的 `metadata.json`。

当前版本已经实现：

- 在喜马拉雅专辑页一键生成 `metadata.json`
- 自动抓取专辑标题、简介、分类、封面来源账号等基础信息
- 自动尝试从标题和章节信息里提取作者、演播
- 导出前弹出可编辑面板，允许你手工修正字段后再下载
- 输出结构对齐 `https://wiki.wenjian.de/zh/audio` 里的 `metadata.json` 示例

## 文件

- [ximalaya-metadata.user.js](./ximalaya-metadata.user.js)

## 使用方式

1. 安装 Tampermonkey 或 Violentmonkey
2. 新建脚本，把 [ximalaya-metadata.user.js](./ximalaya-metadata.user.js) 内容粘进去保存
3. 打开喜马拉雅专辑页，例如 `https://www.ximalaya.com/album/40121646`
4. 点击右下角的 `导出 metadata.json`
5. 检查弹窗里的作者、演播、系列等字段，确认后下载

## 当前抓取逻辑

- 专辑主信息：`https://www.ximalaya.com/revision/search`
  - 直接用 `albumId` 作为关键词查询，可以精确命中当前专辑
- 章节第一页：`https://mobwsa.ximalaya.com/mobile/playlist/album/page`
  - 主要用于辅助提取演播、统计集数、给后续文件命名留信息

## 输出格式

输出的 `metadata.json` 结构如下：

```json
{
  "title": "",
  "subtitle": "",
  "authors": [],
  "narrators": [],
  "series": [],
  "publishedYear": "",
  "genres": [],
  "description": "",
  "language": "zh",
  "publisher": ""
}
```

## 已知限制

- 喜马拉雅没有稳定公开的“作者 / 出版社 / 系列”结构化字段，当前版本是“自动推断 + 手工确认”
- `publishedYear` 目前默认取专辑在喜马拉雅的创建年份，不一定等于原书出版年份
- 简介优先使用搜索接口返回内容，部分专辑可能仍带有平台宣传语，需要你在导出前手改一下

## 参考

- `qilishidai/ximalaya-API`
- `shanyan-wcx/Abs-Ximalaya`
- `https://wiki.wenjian.de/zh/audio`
