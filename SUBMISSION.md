# 同路行 TongDao-v2 MVP 提交说明

您好，我已完成「同路行」自驾社交平台 V1 MVP 增强版演示版本。

## 项目说明

本项目以 HR 文档中的 MVP 要求为目标，完成了用户端小程序、商家后台、运营后台的可演示闭环。当前版本采用 mock 数据和 mock 接口优先，重点验证产品结构、业务流程、页面交互和后台管理能力。

## 体验入口

- 小程序预览二维码：`/home/lin/workspace/tongdao-v2/preview-qrcode.png`
- 小程序项目目录：`/home/lin/workspace/tongdao-v2/miniprogram`
- 商家后台：`/home/lin/workspace/tongdao-v2/admin-merchant/index.html`
- 运营后台：`/home/lin/workspace/tongdao-v2/admin-ops/index.html`
- HR 需求覆盖清单：`/home/lin/workspace/tongdao-v2/HR-CHECKLIST.md`

## 已覆盖功能

- 用户端 4 个 Tab：地图、消息、行程、我的。
- 地图：队友位置、路线、图层开关、拼团、安全 POI、路况、地点聊天室、SOS。
- 消息：车队群聊、地点聊天室、私信入口。
- 行程：发布行程、行程列表、行程详情、加入行程。
- 拼团：拼团列表、详情、阶梯价、进度条、模拟下单。
- 订单：核销码展示。
- 我的：用户资料、同路值、等级、车主认证、邀请、券包、下一趟行程、客服。
- 商家后台：店铺信息、商品管理、订单、核销、结算、拉新券、推广码、修车救援。
- 运营后台：数据看板、用户审核、商家审核、订单/退款、结算、商家考核、券、邀请、等级规则、地点聊天室、客服/投诉。

## 验证结果

已运行：

```bash
cd /home/lin/workspace/tongdao-v2
node scripts/verify.js
```

结果：

```text
TongDao-v2 verify ok
```

## 当前边界

当前版本是 MVP 演示版。真实上线前仍需接入微信真实登录、手机号验证码、高德地图 SDK、真实定位、实时 IM、微信支付、退款、分账、商家扫码核销、云数据库权限和后台账号体系。
