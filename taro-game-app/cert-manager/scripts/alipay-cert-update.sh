#!/bin/bash

# 支付宝证书自动更新脚本
# 参考文档: https://opendocs.alipay.com/common/02kipl

# 日志函数
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# 配置文件路径
CONFIG_FILE="/config/alipay.json"

# 证书存储路径
CERT_DIR="/certs/alipay"
APP_PRIVATE_KEY="${CERT_DIR}/app_private_key.pem"
ALIPAY_PUBLIC_KEY="${CERT_DIR}/alipay_public_key.pem"
APP_CERT="${CERT_DIR}/app_cert.crt"
ALIPAY_CERT="${CERT_DIR}/alipay_cert.crt"
ALIPAY_ROOT_CERT="${CERT_DIR}/alipay_root_cert.crt"

# 确保证书目录存在
mkdir -p "${CERT_DIR}"

# 检查配置文件是否存在
if [ ! -f "${CONFIG_FILE}" ]; then
  log "错误: 支付宝配置文件不存在: ${CONFIG_FILE}"
  exit 1
fi

# 读取配置
APP_ID=$(jq -r '.app_id' "${CONFIG_FILE}")
ALIPAY_GATEWAY=$(jq -r '.gateway' "${CONFIG_FILE}")
ALIPAY_API_VERSION=$(jq -r '.api_version' "${CONFIG_FILE}")

if [ -z "${APP_ID}" ] || [ -z "${ALIPAY_GATEWAY}" ]; then
  log "错误: 支付宝配置不完整"
  exit 1
fi

# 检查私钥是否存在
if [ ! -f "${APP_PRIVATE_KEY}" ]; then
  log "错误: 应用私钥不存在: ${APP_PRIVATE_KEY}"
  exit 1
fi

# 生成随机字符串
generate_nonce_str() {
  openssl rand -hex 16
}

# 生成时间戳
generate_timestamp() {
  date -u +"%Y-%m-%d %H:%M:%S"
}

# 生成签名
generate_signature() {
  local params_str=$1
  
  # 使用应用私钥对参数进行签名
  echo -n "${params_str}" | openssl dgst -sha256 -sign "${APP_PRIVATE_KEY}" | openssl base64 -A
}

# 构建请求参数
build_request_params() {
  local method=$1
  local timestamp=$(generate_timestamp)
  local nonce=$(generate_nonce_str)
  
  # 构建业务参数
  local biz_content='{"app_id":"'"${APP_ID}"'"}'
  
  # 构建公共参数
  local params="app_id=${APP_ID}&method=${method}&format=JSON&charset=utf-8&sign_type=RSA2&timestamp=${timestamp}&version=${ALIPAY_API_VERSION}&biz_content=${biz_content}"
  
  # 生成签名
  local sign=$(generate_signature "${params}")
  
  # 添加签名到参数
  params="${params}&sign=${sign}"
  
  echo "${params}"
}

# 发送请求获取证书
get_alipay_cert() {
  local method="alipay.open.app.alipaycert.download"
  local params=$(build_request_params "${method}")
  
  # 发送请求
  curl -s -X POST "${ALIPAY_GATEWAY}" \
       -H "Content-Type: application/x-www-form-urlencoded;charset=utf-8" \
       -d "${params}"
}

# 检查证书是否需要更新
check_cert_expiry() {
  local cert_file=$1
  local days_threshold=30
  
  if [ ! -f "${cert_file}" ]; then
    return 0  # 证书不存在，需要更新
  fi
  
  # 获取证书过期时间
  local expire_date=$(openssl x509 -in "${cert_file}" -noout -enddate | cut -d= -f2)
  local expire_epoch=$(date -d "${expire_date}" +%s)
  local current_epoch=$(date +%s)
  
  # 计算剩余天数
  local seconds_left=$((expire_epoch - current_epoch))
  local days_left=$((seconds_left / 86400))
  
  if [ "${days_left}" -lt "${days_threshold}" ]; then
    log "证书将在 ${days_left} 天后过期，需要更新"
    return 0  # 需要更新
  else
    log "证书有效期还剩 ${days_left} 天，无需更新"
    return 1  # 不需要更新
  fi
}

# 主函数
main() {
  log "开始检查支付宝证书"
  
  # 检查证书是否需要更新
  if check_cert_expiry "${ALIPAY_CERT}"; then
    log "开始更新支付宝证书"
    
    # 获取证书
    local cert_response=$(get_alipay_cert)
    
    # 解析响应
    local success=$(echo "${cert_response}" | jq -r '.alipay_open_app_alipaycert_download_response.code')
    
    if [ "${success}" = "10000" ]; then
      # 提取证书内容
      local alipay_cert_content=$(echo "${cert_response}" | jq -r '.alipay_open_app_alipaycert_download_response.alipay_cert_content')
      local alipay_root_cert_content=$(echo "${cert_response}" | jq -r '.alipay_open_app_alipaycert_download_response.alipay_root_cert_content')
      
      # 保存证书
      echo "${alipay_cert_content}" | base64 -d > "${ALIPAY_CERT}"
      echo "${alipay_root_cert_content}" | base64 -d > "${ALIPAY_ROOT_CERT}"
      
      log "支付宝证书已更新"
      
      # 验证证书
      local cert_info=$(openssl x509 -in "${ALIPAY_CERT}" -noout -text)
      local subject=$(echo "${cert_info}" | grep "Subject:" | head -1)
      local issuer=$(echo "${cert_info}" | grep "Issuer:" | head -1)
      local validity=$(echo "${cert_info}" | grep -A 2 "Validity")
      
      log "证书信息:"
      log "${subject}"
      log "${issuer}"
      log "${validity}"
      
      return 0
    else
      local error_msg=$(echo "${cert_response}" | jq -r '.alipay_open_app_alipaycert_download_response.sub_msg // "未知错误"')
      log "更新支付宝证书失败: ${error_msg}"
      return 1
    fi
  fi
  
  return 0
}

# 执行主函数
main
exit $?