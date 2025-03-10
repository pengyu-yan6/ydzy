#!/bin/bash

# 日志函数
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "开始证书刷新流程"

# 执行微信证书更新
log "更新微信支付证书..."
/app/wechat-cert-update.sh
if [ $? -eq 0 ]; then
  log "微信支付证书更新成功"
else
  log "微信支付证书更新失败"
fi

# 执行支付宝证书更新
log "更新支付宝证书..."
/app/alipay-cert-update.sh
if [ $? -eq 0 ]; then
  log "支付宝证书更新成功"
else
  log "支付宝证书更新失败"
fi

# 检查是否存在抖音证书更新脚本
if [ -f "/app/tt-cert-update.sh" ]; then
  log "更新抖音证书..."
  /app/tt-cert-update.sh
  if [ $? -eq 0 ]; then
    log "抖音证书更新成功"
  else
    log "抖音证书更新失败"
  fi
fi

log "证书刷新流程完成"