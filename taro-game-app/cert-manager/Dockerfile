FROM alpine:3.18

# 安装必要的工具
RUN apk add --no-cache curl bash openssl jq cron tzdata ca-certificates

# 设置时区为亚洲/上海
RUN cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

# 创建工作目录
WORKDIR /app

# 创建证书目录
RUN mkdir -p /certs/wechat
RUN mkdir -p /certs/alipay
RUN mkdir -p /certs/tt

# 复制脚本
COPY scripts/cert-refresh.sh /app/cert-refresh.sh
COPY scripts/wechat-cert-update.sh /app/wechat-cert-update.sh
COPY scripts/alipay-cert-update.sh /app/alipay-cert-update.sh

# 设置脚本权限
RUN chmod +x /app/*.sh

# 设置定时任务
RUN echo "0 2 * * * /app/cert-refresh.sh >> /var/log/cron.log 2>&1" > /etc/crontabs/root

# 创建日志文件
RUN touch /var/log/cron.log

# 启动脚本
COPY scripts/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]