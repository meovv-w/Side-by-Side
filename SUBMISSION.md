# 同路行 V1 提交说明

## 仓库

公开仓库：<https://github.com/meovv-w/Side-by-Side>

`main` 应包含小程序、真实 Node.js 后端、商家/运营后台、迁移、测试和文档。公开仓库不得包含 HR DOCX、`.env`、支付证书、CI 私钥或访问令牌。

## 交付材料

- 用户端：4 Tab、26 页面微信小程序。
- 服务端：Fastify、MySQL、Redis、WebSocket、迁移 `001-008` 和演示种子。
- 后台：商家经营后台与运营管理后台。
- 生产适配器：微信、高德、腾讯短信/IM、OCR/活体和对象存储。
- 文档：README、原始需求覆盖表、老板验收清单、审计结论。
- 预览：`preview-qrcode.png`，以及建议录制的 7-10 分钟演示视频。

## 体验入口

```bash
cd /home/lin/workspace/tongdao-v2/server
npm install
npm run demo
```

- 商家后台：<http://127.0.0.1:8790/merchant/?preview=1>
- 运营后台：<http://127.0.0.1:8790/ops/?preview=1>
- 小程序：微信开发者工具导入 `miniprogram/`，或授权微信号扫描 `preview-qrcode.png`。

预览码不是公开永久码。HR 微信号必须先被添加为该 AppID 的体验成员；否则应提交演示视频，并由项目开发者现场扫码演示。扫码版使用手机本地演示数据，开发者工具版可与两个后台共享本机 API 状态。

## 最终验证

```text
36/36 API business tests passed
3/3 AMap provider tests passed
2/2 UTC/China time tests passed
Product structure and offline workflow verify passed
Server and frontend JavaScript syntax checks passed
npm audit: 0 vulnerabilities
MySQL migrations 001-008, seed and Redis integration passed
Chromium merchant/ops desktop/mobile passed, runtime errors 0
WeChat miniprogram-ci passed: 84 files, 526428-byte package
```

## 对 HR/Boss 的准确说明

可以说：

> 已按最终 DOCX 完成 V1 用户端、商家端和运营端的全部代码与可操作演示闭环，提供 Node.js + MySQL + Redis 真实后端、生产服务适配器和自动化验证。

不能说：

> 已正式上线，真实支付、地图、短信和身份认证可直接商用。

正式上线需要公司提供企业账号、密钥、域名、商户资质、隐私政策及审核发布权限。

## 建议发给 HR

1. GitHub 仓库链接。
2. `README.md` 和 `HR-CHECKLIST.md`。
3. 7-10 分钟演示视频。
4. 已授权体验成员可扫的最新预览二维码。
5. 一页说明：代码完成项、验证结果、企业资源待办。
