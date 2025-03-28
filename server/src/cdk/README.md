# 跃升之路 - CDK管理系统

本模块实现了具备企业级安全特性的CDK（兑换码）管理系统，集成了双因素认证、完整审计和高级安全防护机制。

## 1. 核心功能

### 数据结构

- **CDK**: 兑换码基础结构，包含类型、价值、状态、使用次数等
- **批次管理**: 实现CDK的批量生成、激活、作废和管理
- **安全配置**: 支持多级安全设置，包括IP限制、设备限制等

### 生命周期管理

- **状态流转**: 生成 -> 激活 -> 使用 -> 过期/作废
- **操作审计**: 记录每个CDK从创建到使用的完整操作记录
- **异常检测**: 自动识别异常使用模式并触发告警

### 双因素认证

- **Google Authenticator集成**: 实现高安全级别CDK的双因素认证
- **多端验证**: 支持在不同设备上设置和使用2FA
- **防篡改机制**: 防止秘钥泄露和认证绕过

## 2. 技术架构

### 模型设计

- `CDK`: 兑换码模型，包含完整的状态、价值和审计信息
- `CDKBatch`: 批次模型，用于批量管理CDK
- `TwoFactorAuth`: 双因素认证服务，提供加密和验证功能

### 服务组件

- `cdkGenerator`: 高安全CDK生成服务，支持多种格式和加密算法
- `excelExporter`: 安全的Excel导出服务，自动清理临时文件
- `auditService`: 完整的审计跟踪服务，检测异常使用模式
- `twoFactorAuth`: Google Authenticator双因素认证集成

### API接口

- 批次管理接口：创建、查询、修改批次
- CDK管理接口：激活、作废、查询CDK
- 用户接口：兑换CDK、验证CDK
- 双因素认证接口：设置、验证、禁用2FA

## 3. 安全特性

### 数据安全

- **价值加密**: 高敏感CDK价值使用AES-256-CBC加密存储
- **哈希验证**: 使用SHA-256/SHA-1/MD5哈希算法验证CDK有效性
- **数据脱敏**: 敏感信息（如用户ID、价值）在日志中自动脱敏

### 访问控制

- **基于角色的权限**: 精细化的CDK操作权限控制
- **IP限制**: 可限制特定CDK仅在指定IP范围内使用
- **设备限制**: 可限制CDK在特定设备上使用

### 双因素认证

- **Google Authenticator**: 使用TOTP算法生成一次性验证码
- **安全秘钥存储**: 秘钥使用安全算法加密存储
- **临时令牌**: 设置过程使用临时令牌保护，30分钟自动过期

### 审计与异常检测

- **全面审计**: 记录所有CDK操作，包含操作者、时间、IP等信息
- **异常检测**: 自动分析使用模式，检测异常行为
- **实时告警**: 对高风险操作实时记录并可配置告警

## 4. 最佳实践

### 批次管理

- 合理设置CDK格式，避免易混淆字符
- 使用适当的过期策略，避免长期有效CDK
- 敏感CDK启用双因素认证和IP限制

### 安全配置

- 高价值CDK启用高安全级别，加密存储价值
- 使用适当的IP和设备限制策略
- 为管理员账号启用双因素认证

### 审计与监控

- 定期查看批次使用分析，了解使用趋势
- 关注异常使用警报，及时处理可疑活动
- 导出数据时使用密码保护，避免信息泄露

## 5. 性能优化

- 批量操作使用批处理机制，避免数据库压力
- 大批量CDK生成使用异步任务，提升响应速度
- Excel导出文件自动清理，避免磁盘资源占用

## 开发团队

- 架构设计: 跃升之路开发团队
- 安全审核: 安全专家团队
- 版本: 1.0.0
- 更新日期: 2024-03-10 