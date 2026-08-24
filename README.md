# 智慧教育平台课本下载助手

Chromium MV3 扩展，用 TypeScript + Vite 构建，可发布到 Chrome Web Store 和 Microsoft Edge Add-ons。它支持在国家中小学智慧教育平台筛选课本、查看封面、批量下载 PDF，并在平台教材列表和详情页直接下载。

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

## 隐私政策

详见 [PRIVACY.md](./PRIVACY.md)。

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

本地生成 Chrome Web Store 和 Microsoft Edge Add-ons 共用的 zip：

```sh
nvm use
pnpm release:build
```

产物会输出到 `release/` 目录，zip 内只包含 `dist/` 中的扩展运行文件，不包含 source map。

### GitHub Actions

推送形如 `v0.3.0` 的 tag 会触发 `.github/workflows/release.yml`：

- 安装依赖
- 执行 `pnpm typecheck`
- 执行 `pnpm test`
- 执行 `pnpm build`
- 生成扩展 zip
- 上传 workflow artifact
- 创建 GitHub Release 并附加 zip

构建完成后，同一次 workflow 的流程图中会显示 Chrome Web Store 和 Microsoft Edge Add-ons 两个发布节点。两个节点分别受 `chrome-web-store` 和 `edge-addons` Environment 保护，状态为 `Waiting`；只有 required reviewer 在 workflow 页面点击 `Review deployments` 并批准对应环境后，发布节点才会开始执行。

tag 触发时两个发布节点都会进入等待审批状态。手动运行 `Actions > Release > Run workflow` 时，可先选择本次需要显示的发布节点：

- `publish_chrome`：发布到 Chrome Web Store。
- `publish_edge`：发布到 Microsoft Edge Add-ons。

每次 workflow 只构建一次，选中的商店发布 job 会下载并复用同一个构建产物。两个发布节点独立审批、独立执行；任一商店失败不会阻止另一个已批准的商店尝试发布。两个选项均不启用时只验证构建，不显示发布节点。

Chrome Web Store 发布需要在 GitHub 仓库 secrets 中配置：

- `CWS_PUBLISHER_ID`
- `CWS_EXTENSION_ID`
- `CWS_CLIENT_ID`
- `CWS_CLIENT_SECRET`
- `CWS_REFRESH_TOKEN`

Microsoft Edge Add-ons 发布需要在 GitHub 仓库 secrets 中配置：

- `EDGE_PRODUCT_ID`
- `EDGE_CLIENT_ID`
- `EDGE_API_KEY`
- `EDGE_CERTIFICATION_NOTES`

获取和配置方式：

- `EDGE_PRODUCT_ID`：在 Microsoft Partner Center 中进入 `Microsoft Edge > Overview`，打开对应扩展，在 `Extension identity` 中复制 Product ID。它也是扩展管理页面 URL 中 `microsoftedge/` 与 `/packages` 之间的 GUID。
- `EDGE_CLIENT_ID`、`EDGE_API_KEY`：进入 `Microsoft Edge > Publish API`，启用新体验（v1.1），点击 `Create API credentials`。记录生成的 Client ID、API key 及 API key 到期时间。
- `EDGE_CERTIFICATION_NOTES`：自行编写的私密审核说明，应包含登录地址、专用测试账号和密码、完整测试步骤及第三方平台依赖说明。不要把这些内容提交到源码或 README。

在 GitHub 仓库进入 `Settings > Environments > edge-addons`，将维护者配置为 required reviewer，并在 `Environment secrets` 中分别创建上述四项 Secret。Chrome 凭据可继续使用现有 repository secrets，也可以迁移到 `chrome-web-store` Environment。微软的详细操作见 [Microsoft Edge Add-ons API 文档](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api#enable-the-update-rest-api-at-partner-center)。

本地已有 release zip 时，也可以只上传 Edge 草稿或上传后提交审核：

```sh
pnpm edge:upload
pnpm edge:publish
```

首次上架仍需要分别在 Chrome Web Store Developer Dashboard 和 Microsoft Partner Center 中创建条目，并完成商店详情、隐私声明、权限用途说明等信息。Edge 的首个版本必须先通过 Partner Center 发布；API 流程只负责更新已有条目、上传新版本并提交审核，不会等待商店的人工审核完成。

## 当前能力

- 未登录时在课本详情页和扩展 popup 中显示登录引导，不提供下载入口。
- 已登录时在 `https://basic.smartedu.cn/tchMaterial/detail*` 页面右下角注入“下载 PDF”按钮。
- 已登录时在 `https://basic.smartedu.cn/tchMaterial` 教材列表的每张课本卡片中增加“下载 PDF”按钮，无需进入详情页。
- 在扩展 popup 中显示课本封面，支持按学段、学科、年级、出版社/版本、册次筛选课本并直接下载。
- 在扩展 popup 中支持跨筛选勾选课本，并以最多 3 个并发解析任务批量启动下载。
- 在扩展 popup 中支持下载当前标签页 PDF。
- 在需要恢复授权时，通过后台非激活标签短暂访问 `https://auth.smartedu.cn/*`，自动捕获当前登录会话的 Access Token，完成或超时后关闭该标签。
- 使用 MV3 service worker 解析资源 JSON，并通过 `chrome.downloads.download` 携带授权头发起下载。

PDF 书签写入还没有实现，后续可以在浏览器侧引入 PDF 处理库，或者把它设计成可选的离线处理流程。
