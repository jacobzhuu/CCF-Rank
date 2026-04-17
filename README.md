# CCF Rank for Zotero

Zotero CCF 分级助手

[![zotero target version](https://img.shields.io/badge/Zotero-7%20%7C%208-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)
[![GitHub stars](https://img.shields.io/github/stars/jacobzhuu/CCF-Rank?style=social)](https://github.com/jacobzhuu/CCF-Rank)
[![License](https://img.shields.io/badge/License-AGPL%203.0--or--later-blue?style=flat-square)](./LICENSE)

一个面向 Zotero 的 CCF 刊会分级插件。它会根据文献元数据自动匹配中国计算机学会推荐国际学术会议和期刊目录，并在文献列表中直接显示等级、分类、来源和匹配等级。

当前版本基于《中国计算机学会推荐国际学术会议和期刊目录第七版（2026 年 3 月更新）》整理，离线可用，不依赖在线查询服务。

## 功能概览

- 自动识别 `conferencePaper`、`journalArticle` 等条目的 CCF 等级
- 在 Zotero 条目列表中显示 `CCF 等级`、`CCF 分类`、`CCF 来源`、`CCF 置信度`
- 可选显示 `CCF 会议/期刊` 列，直接展示匹配到的官方简称
- 自动扫描新增或编辑后的条目，避免修改元数据后结果陈旧
- 支持右键手动设置 `A / B / C`、清除手动设置、忽略条目
- 支持右键重新扫描选中条目，或在设置页重扫当前集合 / 当前库
- 支持查看匹配详情，定位命中字段、匹配策略和结果来源
- 支持自定义别名规则，处理非常见简称、数据库导入别名和历史写法
- 支持将结果写入 `Extra` 作为持久缓存，并自动校验指纹、数据版本、阈值和别名规则变更

## 安装

### 直接安装

1. 如果仓库已经发布 Release，从 [Releases](https://github.com/jacobzhuu/CCF-Rank/releases) 下载最新 `.xpi`
2. 打开 Zotero，进入 `工具 -> 插件`
3. 点击右上角齿轮按钮，选择 `Install Add-on From File...`
4. 选择下载的 `.xpi` 文件并重启 Zotero

如果当前仓库还没有发布 Release，请按下面的“从源码构建”步骤生成本地安装包。

### 从源码构建

```bash
npm install
npm run build
```

构建完成后，`npm run build` 会自动同步根目录测试包，可导入以下任一文件：

- 根目录下的 `ccf-rank-for-zotero.xpi`
- `.scaffold/build/ccf-rank-for-zotero.xpi`

## 快速开始

### 1. 打开列

在 Zotero 文献列表表头右键，勾选以下列：

- `CCF 等级`
- `CCF 分类`
- `CCF 来源`
- `CCF 置信度`
- `CCF 会议/期刊`（可选）

### 2. 导入或编辑文献

插件会优先从以下字段中识别刊会名称：

- `proceedingsTitle`
- `publicationTitle`
- `conferenceName`
- `title`

新增或编辑条目后，插件会自动重新计算匹配结果。

### 3. 使用右键菜单修正结果

选中文献后右键，可以使用：

- `设置 CCF 等级 -> A / B / C`
- `清除手动设置`
- `忽略此条目（不显示等级）`
- `重新扫描选中条目`
- `查看匹配详情`

## 设置项

插件设置页提供以下选项：

- `自动扫描新增或编辑后的条目`
- `将匹配结果写入 Extra 字段作为持久缓存`
- `显示 “CCF 会议/期刊” 列`
- `开启调试日志`
- `最低匹配分数`
- `自定义别名规则`
- `重新扫描当前集合`
- `重新扫描当前库`

### 最低匹配分数

- 取值范围 `600 - 1000`
- 值越高越保守，越低越容易接受模糊匹配
- 修改后当前视图会按新阈值重新计算

### 自定义别名规则

每行一条，支持以下格式：

```text
Neural Information Processing Systems => NeurIPS
IEEE Symposium on Security and Privacy = S&P
# 以 # 开头的行会被忽略
```

左侧是导入元数据中可能出现的别名，右侧是 CCF 官方简称或官方全称。

## 匹配机制

插件会综合使用以下策略：

- 自定义别名命中
- 官方简称精确匹配
- 标题或文本中提取简称
- 官方全称精确匹配
- 模糊匹配

`CCF 来源` 列表示结果来自哪里：

- `手动`：用户手动覆盖
- `缓存`：来自 `Extra` 中的有效持久缓存
- `实时`：当前会话中即时计算得到

`CCF 置信度` 目前显示为分档，而不是概率：

- `高`
- `中`
- `低`

如果你想确认某一条结果是怎么来的，可以使用右键菜单里的 `查看匹配详情`。

## 缓存与一致性

当启用 `写入 Extra` 时，插件会把匹配结果写回条目的 `Extra` 字段，用于跨会话复用。缓存不会盲目复用，而是会校验：

- 条目源字段指纹
- CCF 数据版本
- 当前最低匹配分数
- 当前自定义别名规则哈希

这意味着以下情况会自动失效并重算：

- 你编辑了文献的刊会相关字段
- 你更新了匹配阈值
- 你修改了自定义别名规则
- 插件内置的 CCF 数据版本发生变化

如果你批量导入、批量修正元数据，或者想彻底重建缓存，可以使用：

- 右键 `重新扫描选中条目`
- 设置页 `重新扫描当前集合`
- 设置页 `重新扫描当前库`

## 数据来源

- 结构化数据文件：`src/data/ccf-conferences.json`
- 原始参考文件：`src/data/中国计算机学会推荐国际学术会议和期刊目录第七版（2026年3月更新）.pdf`
- 官方页面：[中国计算机学会推荐国际学术会议和期刊目录](https://www.ccf.org.cn/Academic_Evaluation/By_category/)

如果官方目录后续更新，仓库中的数据文件也需要同步更新。

## 开发

### 本地开发

```bash
npm install
npm run start
```

### 构建

```bash
npm run build
```

### 代码检查

```bash
npm run lint:check
```

### 测试

```bash
npm test
```

说明：测试依赖本机可用的 Zotero 可执行程序。

## 项目结构

```text
src/
  data/                  CCF 数据与原始参考文件
  modules/
    ccf/
      matcher.ts         匹配器
      resolver.ts        解析与会话缓存
      cache.ts           Extra 持久缓存
      manualOverrideStore.ts
                          手动设置与忽略规则
      columns.ts         Zotero 列注册与渲染
      notifier.ts        新增 / 编辑通知
      settings.ts        设置读取与别名规则解析
    ccfRank.ts           插件协调层与右键入口
addon/
  content/preferences.xhtml
                          设置页
  locale/zh-CN/preferences.ftl
                          中文设置文案
```

## 适用范围与限制

- 主要面向 CCF 收录的国际会议和期刊
- 依赖条目元数据质量；导入信息越完整，结果越稳定
- 对 workshop、非标准简称、历史刊名等情况，建议配合自定义别名规则使用
- `CCF 置信度` 是规则匹配的可靠性分档，不表示统计意义上的概率

## 致谢

当前版本基于原始 [CCF-Rank](https://github.com/GroundbreakerLhy/CCF-Rank) 项目继续修改与扩展，同时参考并借鉴了以下 Zotero 插件与项目：

- [CCF-Rank](https://github.com/GroundbreakerLhy/CCF-Rank)
- [Zotero-Scholar-Rank](https://github.com/SiriusXT/Zotero-Scholar-Rank)
- [zotero-ccf-info](https://github.com/TimeTrapzz/zotero-ccf-info)

## 许可证

[AGPL-3.0-or-later](./LICENSE)
