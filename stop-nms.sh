#!/bin/bash

CN="-f docker-compose.cn.yml"

NET_NAME="oai-cn5g-public-net"
NMS_HOME="$HOME/5g-sib8-alert/configuration"

network_exists() {
  docker network inspect "$NET_NAME" >/dev/null 2>&1
}

cd $NMS_HOME

if network_exists; then
  docker compose $CN down
else
  docker compose down
fi

