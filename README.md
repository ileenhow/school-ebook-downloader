# 智慧教育平台课本下载助手

Chrome MV3 扩展脚手架，用 TypeScript + Vite 构建。它会在国家中小学智慧教育平台的课本详情页插入下载按钮，并在后台解析 PDF 资源后调用 Chrome 下载。

## 开发

```sh
nvm use
pnpm install
pnpm dev
```

开发模式会持续构建到 `dist/`。打开 Chrome 扩展管理页，启用开发者模式，选择“加载已解压的扩展程序”，加载本项目的 `dist/` 目录。

## 构建

```sh
nvm use
pnpm build
```

## 当前能力

- 在 `https://basic.smartedu.cn/tchMaterial/detail*` 页面右下角注入“下载 PDF”按钮。
- 在扩展 popup 中支持下载当前标签页 PDF。
- 在 `https://auth.smartedu.cn/*` 页面自动捕获当前会话的 Access Token。
- 使用 MV3 service worker 解析资源 JSON，并通过 `chrome.downloads.download` 发起下载。

PDF 书签写入还没有实现，后续可以在浏览器侧引入 PDF 处理库，或者把它设计成可选的离线处理流程。

