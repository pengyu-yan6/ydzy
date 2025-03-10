#!/bin/bash

# 日志函数
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "证书管理服务启动中..."

# 初始化证书
log "执行初始证书更新..."
/app/cert-refresh.sh

# 启动cron服务
log "启动定时任务服务..."
crond -f -l 8