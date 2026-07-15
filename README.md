# 同路行 TongDao V1

同路行是面向自驾用户的微信小程序，围绕“找同路车队、路上沟通、沿途拼团、到店核销”形成完整业务闭环。本仓库对应《自驾社交技术开发文档3 - 方案+UI+MVP增强版-发送5》的 V1 范围。

当前状态应准确表述为：V1 功能代码、离线演示和真实服务端接口均已完成；正式上线仍需公司提供微信、高德、腾讯云、身份认证和对象存储等企业凭证，并完成部署、隐私合规和小程序审核。

## 交付组成

- 微信原生小程序：4 个 Tab、26 个页面。
- Node.js API：Fastify、MySQL、Redis、WebSocket，共 4 个数据库迁移。
- 商家后台：入驻、商品、订单详情、订单/券核销、结算、拉新券、推广、救援、考核、通知和客服。
- 运营后台：用户/资质/商家审核、拼团、订单详情、退款、订单分账、券结算、考核、券、邀请、成长规则、地点内容、安全上报、客服、救援和审计。
- 支付、高德、腾讯云 IM/短信、OCR/活体、对象存储的生产适配器。
- 内存演示仓库、MySQL 仓库、自动化测试、验收清单和微信 CI 预览二维码。

`cloudfunctions/` 下的 5 个目录是早期云开发迁移入口，不是当前真实服务端。正式服务端位于 `server/`。

## 用户端功能

- 登录与认证：微信登录、手机号验证码、邀请归因、行驶证 OCR 会话和活体认证。
- 地图：本队位置/路线/终点、其他车队和个人司机、沿途 POI、拼团、路况、地点话题、安全 POI、天气、海拔、聚合与图层开关。
- 安全：位置共享、道路风险上报、运营审核后上图、补能提醒、按住 SOS、车队和紧急联系人通知。
- 行程：三步发布、路线规划、顺路率、10km 推荐、申请/审批、出发、行进、完成、退出审批、移除成员和脱队任务。
- 下一趟：保存路线草稿、备注、匹配现有车队或转为正式组队。
- 消息：车队、地点、私信、系统通知统一列表，未读计数和地图消息预览。
- 聊天：文字、图片、真实录音/上传/播放、位置和拼团卡片；完成后永久保留。
- 社交：关注个人/车队、粉丝、黑名单、同队/互关/单向关注 3 条私信规则和发现隐私。
- 地点聊天室：创建、关注、发言/发图、事件自动话题、静默、24 小时归档和参与后保留。
- 拼团与交易：阶梯价、发起新团、分享、支付、库存预占、重复下单保护、自动退款、核销和分账。
- 券：券包分类、支付抵扣、到店券码、商家核销和平台独立结算。
- 成长与增长：同路值流水、等级、勋章、轨迹、邀请二维码/链接/手机号弱兜底和合作商家奖励券。
- 我的：订单、退款、认证、社交、安全设置、客服工单和个人资料。

## 本地运行

需要 Node.js 20 以上。

```bash
cd /home/lin/workspace/tongdao-v2/server
npm install
npm run demo
```

演示服务启动后：

- 商家后台：<http://127.0.0.1:8790/merchant/?preview=1>
- 运营后台：<http://127.0.0.1:8790/ops/?preview=1>
- 健康检查：<http://127.0.0.1:8790/health>

微信开发者工具导入 `miniprogram/`。开发者工具环境默认连接 `http://127.0.0.1:8790`，可以验证小程序与两个后台共享同一套服务端数据。

手机扫描 `preview-qrcode.png` 时默认使用设备内离线演示数据，因为手机不能访问电脑的 `127.0.0.1`。若要在手机上联调真实服务端，需要部署 HTTPS API 域名并在小程序后台加入合法域名。

## 数据库模式

本地生产结构验证：

```bash
cd /home/lin/workspace/tongdao-v2
podman compose up -d mysql redis

cd server
MYSQL_URL=mysql://tongdao:tongdao_dev@127.0.0.1:3306/tongdao npm run migrate
SEED_DEMO=true MYSQL_URL=mysql://tongdao:tongdao_dev@127.0.0.1:3306/tongdao npm run seed
MYSQL_URL=mysql://tongdao:tongdao_dev@127.0.0.1:3306/tongdao \
REDIS_URL=redis://127.0.0.1:6379/0 npm run test:integration
```

复制 `server/.env.example` 为部署环境变量时，不要提交 `.env`、支付证书或私钥。

## 验证结果

2026-07-15 已完成：

```text
server API tests                 18/18 passed
node scripts/verify.js           passed
npm run check                    passed
npm audit --omit=dev             0 vulnerabilities
MySQL 8.4 + Redis 7.4 smoke      passed
Chromium desktop/mobile          passed, runtime errors 0
WeChat miniprogram-ci            passed, 83 code files, 453239 bytes
```

微信 CI 已更新 `preview-qrcode.png`。预览码不是永久公开码：它可能过期，且只有该 AppID 的管理员、开发者或体验成员能进入。给 HR 测试前应在微信公众平台添加其微信号为体验成员，或现场重新生成预览码。

## 正式上线依赖

- 微信认证小程序 AppID、登录权限、隐私接口声明和合法 HTTPS 域名。
- 微信支付商户号、API v3 证书、回调域名、退款、分账和财务付款流水。
- 高德 Web/小程序 Key 及路线、POI、天气、交通服务权限。
- 腾讯云短信和 IM 账号，或公司指定的等价服务。
- 行驶证 OCR、人脸活体和对象存储账号。
- 生产 MySQL/Redis、定时任务、监控、备份、RBAC 和审计保留策略。
- 商家真实资质、商品内容、用户协议、隐私政策和小程序审核发布。

需求对应关系见 [HR-CHECKLIST.md](./HR-CHECKLIST.md)，人工测试步骤见 [BOSS-ACCEPTANCE.md](./BOSS-ACCEPTANCE.md)，提交说明见 [SUBMISSION.md](./SUBMISSION.md)。
