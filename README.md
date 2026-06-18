# 智慧教育平台课本下载助手

Chrome MV3 扩展脚手架，用 TypeScript + Vite 构建。它会在国家中小学智慧教育平台的课本详情页插入下载按钮，并在后台解析 PDF 资源后调用 Chrome 下载。

## 致谢与来源

本项目受 [happycola233/tchMaterial-parser](https://github.com/happycola233/tchMaterial-parser) 启发，并在理解其资源解析思路的基础上，尝试以 Chrome 扩展的形式做一次更贴近浏览器使用场景的二次开发。

原项目用 Python 桌面端把国家中小学智慧教育平台课本资源的解析、下载、书签处理等流程整理得非常清楚，也为本项目验证接口、理解资源结构和设计浏览器侧体验提供了重要参考。这里特别感谢原作者的探索、整理和开源分享。

原项目采用 MIT License 授权。本项目会保留并尊重原项目的授权信息与版权声明：

```text
MIT License
Copyright (c) 2026 肥宅水水呀
```

如果后续代码中直接引用或改写原项目实现，也应在对应文件或文档中继续保留原项目的 MIT License 与版权声明。

## 非官方声明

本项目不是 `tchMaterial-parser` 的官方版本，也不代表原作者立场；同时，本项目也不是国家中小学智慧教育平台或任何教育平台的官方工具。它只是一个面向浏览器使用场景的学习型、实验型二开项目。

## 开源许可

本项目采用 MIT License 开源，详见 [LICENSE](./LICENSE)。

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

## 发布

本项目版本号需要同时更新两处：

- `package.json` 的 `version`
- `public/manifest.json` 的 `version`

本地生成 Chrome Web Store 可上传的 zip：

```sh
nvm use
pnpm release:build
```

产物会输出到 `release/` 目录，zip 内只包含 `dist/` 中的扩展运行文件，不包含 source map。

### GitHub Actions

推送形如 `v0.2.0` 的 tag 会触发 `.github/workflows/release.yml`：

- 安装依赖
- 执行 `pnpm typecheck`
- 执行 `pnpm build`
- 生成扩展 zip
- 上传 workflow artifact
- 创建 GitHub Release 并附加 zip
- 如果已配置 Chrome Web Store secrets，则上传到 Chrome Web Store 并提交审核

Chrome Web Store 发布需要在 GitHub 仓库 secrets 中配置：

- `CWS_PUBLISHER_ID`
- `CWS_EXTENSION_ID`
- `CWS_CLIENT_ID`
- `CWS_CLIENT_SECRET`
- `CWS_REFRESH_TOKEN`

首次上架仍需要先在 Chrome Web Store Developer Dashboard 中创建条目，并完成商店详情、隐私声明、权限用途说明等信息。API 流程只负责上传新版本并提交审核。

## 当前能力

- 未登录时在课本详情页和扩展 popup 中显示登录引导，不提供下载入口。
- 已登录时在 `https://basic.smartedu.cn/tchMaterial/detail*` 页面右下角注入“下载 PDF”按钮。
- 在扩展 popup 中支持按学段、学科、年级、出版社/版本、册次筛选课本并直接下载。
- 在扩展 popup 中支持下载当前标签页 PDF。
- 在 `https://auth.smartedu.cn/*` 页面自动捕获当前会话的 Access Token。
- 使用 MV3 service worker 解析资源 JSON，并通过 `chrome.downloads.download` 携带授权头发起下载。

PDF 书签写入还没有实现，后续可以在浏览器侧引入 PDF 处理库，或者把它设计成可选的离线处理流程。
