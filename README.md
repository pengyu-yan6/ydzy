# 跃升之路 - 策略竞技游戏

"跃升之路"是一款基于Vue3的Web端策略竞技游戏，类似《云顶之弈》的自动战斗棋类游戏。

## 项目结构

- `/client` - 前端代码（Vue3）
- `/server` - 后端代码（Node.js + Express）

## 核心模块

1. **支付网关接口** - 处理游戏内购买和交易
   - 支持多种支付方式（支付宝、微信、信用卡）
   - 安全的支付验证机制
   - 订单管理和查询功能

2. **CDK管理系统** - 管理游戏激活码和礼品码
   - 多种类型CDK（礼品码、激活码、VIP码、活动码）
   - 批量生成CDK功能
   - CDK使用记录和统计

3. **游戏数据API** - 提供游戏逻辑和数据
   - 英雄、装备、技能数据
   - 游戏匹配和战斗逻辑
   - 排行榜和统计数据

4. **用户认证中心** - 处理用户登录、注册和认证
   - JWT认证机制
   - 角色权限控制
   - 用户资料管理

5. **安全防护层** - 保护游戏免受攻击和作弊
   - API请求限流
   - 数据验证和过滤
   - 敏感操作日志记录

## 技术特点

- **前端**：Vue3 + Pinia + Vue Router + Element Plus
- **后端**：Node.js + Express + MongoDB + Socket.io
- **认证**：JWT (JSON Web Token)
- **实时通信**：WebSocket
- **支付集成**：支持多种支付渠道
- **安全性**：请求限流、数据验证、防SQL注入

## 已完成的功能

- [x] 用户注册和登录系统
- [x] JWT认证和权限控制
- [x] CDK生成和兑换系统
- [x] 支付订单创建和处理
- [x] 商城系统和商品管理
- [x] 游戏主界面UI
- [x] 安全防护措施

## 安装和运行

### 前端

```bash
cd client
npm install
npm run dev
```

### 后端

```bash
cd server
npm install
npm run dev
```

## 环境要求

- Node.js 14.0+
- MongoDB 4.0+
- 现代浏览器（Chrome, Firefox, Safari, Edge）

## 技术栈

- 前端：Vue3、Pinia、Vue Router、Axios、Element Plus
- 后端：Node.js、Express、MongoDB、JWT、Socket.io 