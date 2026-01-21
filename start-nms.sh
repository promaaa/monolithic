#!/bin/bash

CN="-f docker-compose.cn.yml"

NET_NAME="oai-cn5g-public-net"
NMS_HOME="$HOME/5g-sib8-alert/configuration"

network_exists() {
  docker network inspect "$NET_NAME" >/dev/null 2>&1
}

cd $NMS_HOME

if network_exists; then
  echo "Network $NET_NAME exists. Starting NMS WITH CN attachment"
  docker compose $CN up -d
else
  echo "Network $NET_NAME not found. Starting NMS WITHOUT CN attachment"
  docker compose up -d
fi
