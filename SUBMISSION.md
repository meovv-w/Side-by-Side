# 同路行 V1 提交说明

目前交付的是按方案 UI 重做后的 V1 完整交互版，不再是只有页面和占位按钮的初版。

## 交付内容

- 微信小程序用户端：4 个 Tab，合计 24 个页面。
- 商家中心：商品、订单、核销、结算、券、推广、救援和考核。
- 运营平台：审核、订单退款、结算、券预算、邀请奖励、成长规则、内容和客服投诉。
- 自动验收脚本、需求覆盖表、老板人工验收清单和微信预览二维码。
- 公开仓库：<https://github.com/meovv-w/Side-by-Side>

## 体验入口

- 小程序二维码：`/home/lin/workspace/tongdao-v2/preview-qrcode.png`
- 商家中心：`/home/lin/workspace/tongdao-v2/admin-merchant/index.html`
- 运营平台：`/home/lin/workspace/tongdao-v2/admin-ops/index.html`
- 人工验收清单：`/home/lin/workspace/tongdao-v2/BOSS-ACCEPTANCE.md`

## 已验证

```text
node scripts/verify.js
TongDao-v2 product verify ok

微信 miniprogram-ci
76 个代码文件编译成功，预览二维码生成成功
```

两个后台已用 Chromium 检查 1365×900 桌面尺寸和 390×844 手机尺寸，无控件重叠和页面溢出。

## 对完成度的准确描述

方案中的 UI、入口和用户业务流程已完整呈现，所有主要操作都有状态和本地持久化。当前不应对外称为“生产上线完成”：微信支付、高德实时服务、腾讯云 IM、OCR/活体、生产数据库、后台权限、回调验签、正式隐私协议和小程序审核仍需要公司账号、密钥和部署环境。
