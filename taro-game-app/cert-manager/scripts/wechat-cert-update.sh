#!/bin/bash

# 微信支付证书自动更新脚本
# 参考文档: https://pay.weixin.qq.com/wiki/doc/apiv3/wechatpay/wechatpay5_0.shtml

# 日志函数
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# 配置文件路径
CONFIG_FILE="/config/wechat.json"

# 证书存储路径
CERT_DIR="/certs/wechat"
PRIVATE_KEY="${CERT_DIR}/apiclient_key.pem"
MERCHANT_CERT="${CERT_DIR}/apiclient_cert.pem"
SERIAL_FILE="${CERT_DIR}/serial_no.txt"

# 确保证书目录存在
mkdir -p "${CERT_DIR}"

# 检查配置文件是否存在
if [ ! -f "${CONFIG_FILE}" ]; then
  log "错误: 微信支付配置文件不存在: ${CONFIG_FILE}"
  exit 1
fi

# 读取配置
MCH_ID=$(jq -r '.mch_id' "${CONFIG_FILE}")
MCH_API_KEY=$(jq -r '.api_key' "${CONFIG_FILE}")
API_V3_KEY=$(jq -r '.api_v3_key' "${CONFIG_FILE}")

if [ -z "${MCH_ID}" ] || [ -z "${API_V3_KEY}" ]; then
  log "错误: 微信支付配置不完整"
  exit 1
fi

# 检查私钥是否存在
if [ ! -f "${PRIVATE_KEY}" ]; then
  log "错误: 商户私钥不存在: ${PRIVATE_KEY}"
  exit 1
fi

# 获取当前证书序列号
CURRENT_SERIAL=""
if [ -f "${SERIAL_FILE}" ]; then
  CURRENT_SERIAL=$(cat "${SERIAL_FILE}")
fi

# 生成随机字符串
generate_nonce_str() {
  openssl rand -hex 16
}

# 生成时间戳
generate_timestamp() {
  date +%s
}

# 生成签名
generate_signature() {
  local method=$1
  local url_path=$2
  local body=$3
  local timestamp=$4
  local nonce_str=$5
  
  # 签名串
  local sign_str="${method}\n${url_path}\n${timestamp}\n${nonce_str}\n${body}\n"
  
  # 使用商户私钥对签名串进行签名
  echo -n "${sign_str}" | openssl dgst -sha256 -sign "${PRIVATE_KEY}" | openssl base64 -A
}

# 获取证书列表
get_certificates() {
  local timestamp=$(generate_timestamp)
  local nonce_str=$(generate_nonce_str)
  local url_path="/v3/certificates"
  local signature=$(generate_signature "GET" "${url_path}" "" "${timestamp}" "${nonce_str}")
  
  # 构建认证头
  local auth_header="WECHATPAY2-SHA256-RSA2048 mchid=\"${MCH_ID}\",nonce_str=\"${nonce_str}\",signature=\"${signature}\",timestamp=\"${timestamp}\",serial_no=\"${CURRENT_SERIAL}\""
  
  # 发送请求获取证书列表
  curl -s -H "Authorization: ${auth_header}" -H "Accept: application/json" -H "Content-Type: application/json" "https://api.mch.weixin.qq.com${url_path}"
}

# 解密证书
decrypt_certificate() {
  local encrypted_cert=$1
  local associated_data=$2
  local nonce=$3
  
  # 使用API V3密钥解密
  # 这里使用简化的解密方法，实际生产环境应使用更安全的方法
  echo "${encrypted_cert}" | openssl enc -d -aes-256-gcm -iv "${nonce}" -K "$(echo -n "${API_V3_KEY}" | xxd -p)" -auth "${associated_data}"
}

# 主函数
main() {
  log "开始更新微信支付证书"
  
  # 获取证书列表
  local cert_response=$(get_certificates)
  
  # 解析响应
  local data=$(echo "${cert_response}" | jq -r '.data[0]')
  local serial_no=$(echo "${data}" | jq -r '.serial_no')
  local effective_time=$(echo "${data}" | jq -r '.effective_time')
  local expire_time=$(echo "${data}" | jq -r '.expire_time')
  local encrypt_certificate=$(echo "${data}" | jq -r '.encrypt_certificate')
  
  # 检查是否需要更新
  if [ "${serial_no}" = "${CURRENT_SERIAL}" ]; then
    log "当前证书序列号 ${serial_no} 已是最新，无需更新"
    return 0
  fi
  
  # 解析加密信息
  local algorithm=$(echo "${encrypt_certificate}" | jq -r '.algorithm')
  local nonce=$(echo "${encrypt_certificate}" | jq -r '.nonce')
  local associated_data=$(echo "${encrypt_certificate}" | jq -r '.associated_data')
  local ciphertext=$(echo "${encrypt_certificate}" | jq -r '.ciphertext')
  
  # 解密证书
  local certificate=$(decrypt_certificate "${ciphertext}" "${associated_data}" "${nonce}")
  
  # 保存新证书
  echo "${certificate}" > "${MERCHANT_CERT}"
  echo "${serial_no}" > "${SERIAL_FILE}"
  
  log "微信支付证书已更新，序列号: ${serial_no}"
  log "证书有效期: ${effective_time} 至 ${expire_time}"
  
  return 0
}

# 执行主函数
main
exit $?