# 安全策略 / Security Policy

## 支持版本

| 版本 | 支持 |
| --- | --- |
| 最新 tag（见 [Releases](https://github.com/dongzhang777-source/fati-tavern/releases)） | ✅ |
| 更早版本 | ❌（纯前端应用，请直接使用线上最新版或自行构建） |

## 隐私模型（这个项目的安全边界是什么）

- **零后端**：没有应用服务器，对话数据不经过本项目任何服务器。
- **BYOK 模式**：API Key 只存浏览器 localStorage，请求由浏览器直连你选择的模型提供商。
- **免 Key 模式**：WebLLM 在浏览器内用 WebGPU 本地推理，模型权重从公共 CDN 下载。
- **分享链接**：数据编码在 URL `#` fragment 中，fragment 不会发送到服务器。
- 匿名功能使用计数（PostHog）不含对话内容，未配置时静默不上报；详见 README「内容与合规」。

## 报告漏洞

请使用 GitHub 的 **私密漏洞报告**（仓库 Security 标签页 → Report a vulnerability），不要开公开 issue。

- 一般一周内响应。
- 修复后会随下一个 tag 发布，并在 CHANGELOG 中致谢（除非你希望匿名）。

## 不在范围内

- 用户自行导入的第三方角色卡的内容问题（导入时的分级标记是尽力而为的辅助，不构成托管或审核）。
- 用户所选模型提供商自身的数据/安全问题。
- 用户设备本身已被攻破的情形（本地方案无法防御端点沦陷）。
