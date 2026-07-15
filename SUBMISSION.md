# 同路行 V1 提交说明

## 仓库

公开仓库：<https://github.com/meovv-w/Side-by-Side>

提交前应确认 `main` 已包含本地最新提交，且仓库中没有 HR DOCX、`.env`、支付证书、私钥或访问 token。

## 交付材料

- 源码：小程序、Node.js API、商家后台、运营后台。
- 数据库：`server/migrations/001-004`、MySQL/Redis 配置和演示种子。
- 适配器：微信登录/支付、腾讯短信/IM、高德、OCR/活体、对象存储。
- 文档：README、需求覆盖表、老板验收清单、审计结论。
- 小程序预览：`preview-qrcode.png`。
- 建议额外提供：7-10 分钟功能演示视频和 4-6 张关键流程截图。

## 体验入口

先运行：

```bash
cd /home/lin/workspace/tongdao-v2/server
npm install
npm run demo
```

然后打开：

- 商家后台：<http://127.0.0.1:8790/merchant/?preview=1>
- 运营后台：<http://127.0.0.1:8790/ops/?preview=1>
- 小程序：微信开发者工具导入 `miniprogram/`，或授权微信号扫描 `preview-qrcode.png`。

预览二维码会过期，并且普通微信号不能进入开发版。交给 HR 前，需要在微信公众平台把 HR 微信号添加为体验成员；若无法添加，就提交演示视频并现场用开发者账号扫码。

## 已验证

```text
18/18 server API tests passed
Product structure and workflow verify passed
Server and frontend JavaScript syntax checks passed
npm audit: 0 vulnerabilities
MySQL 8.4 migrations 001-004 passed
MySQL + Redis integration smoke passed
Chromium desktop/mobile all views passed, runtime errors 0
WeChat miniprogram-ci passed: 83 files, 453239-byte full package
```

## 对 HR/Boss 的准确说明

可以说：

> 已按最终方案完成 V1 用户端、商家端和运营端的功能代码与完整演示闭环，并提供 Node.js + MySQL + Redis 真实后端、自动测试和部署适配器。

不能说：

> 已经正式上线，所有真实支付、地图、短信和身份认证都可直接商用。

正式上线还需要公司提供企业账号、密钥、域名、商户资质、隐私政策和审核发布权限。

## HR 建议提交包

1. GitHub 仓库链接。
2. `README.md` 和 `HR-CHECKLIST.md`。
3. 功能演示视频。
4. 有权限的最新预览二维码。
5. 一页说明：已完成项、验证结果、上线所需公司资源。
