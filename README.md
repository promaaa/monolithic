# 5G SIB8 Warning Transmission

This repository contains a Network Management System (NMS) and a patch file that extend the OpenAirInterface project to support SIB8 emergency alert transmission.

The implementation is based on OpenAirInterface commit: `102965a669b9444857c27843ec8ce62780bf9d37`

## Overview

The provided patch implements:
- Construction of SIB8 warning messages in the RRC layer
- Support for segmented SIB8 transmission using multiple System Information messages
- Support for multiple data coding scheme (GSM 7-bit and UCS2)
- Support for dynamic changes of SIB8 parameters.

The NMS allows users to:
- Modify SIB8 warning message parameters
- Configure key gNB parameters (e.g. PLMN, cell identity..)
- Manage basic subscriber data in the core network

## Tutorial

> **Note:**
> - This setup was tested on **Ubuntu 24.04** with an **USRP B210 SDR**.
> - The commands below are a **tested version** of the steps described in the official OAI documentation: [OAI NR SA Tutorial for COTS UE](https://gitlab.eurecom.fr/oai/openairinterface5g/-/blob/develop/doc/NR_SA_Tutorial_COTS_UE.md).
> - Users are encouraged to explore the official documentation for additional background and advanced configurations.

### Core Network

pre-requisites:
```
sudo apt install -y git net-tools putty

# https://docs.docker.com/engine/install/ubuntu/
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add your username to the docker group, otherwise you will have to run in sudo mode.
sudo usermod -a -G docker $(whoami)
reboot
```

Download and copy configuration files:
```
wget -O ~/oai-cn5g.zip https://gitlab.eurecom.fr/oai/openairinterface5g/-/archive/develop/openairinterface5g-develop.zip?path=doc/tutorial_resources/oai-cn5g
unzip ~/oai-cn5g.zip
mv ~/openairinterface5g-develop-doc-tutorial_resources-oai-cn5g/doc/tutorial_resources/oai-cn5g ~/oai-cn5g
rm -r ~/openairinterface5g-develop-doc-tutorial_resources-oai-cn5g ~/oai-cn5g.zip
```

Pull docker images
```
cd ~/oai-cn5g
docker compose pull
```

Clone the current repository:
```bash
git clone https://github.com/5gattacks/5g-sib8-alert.git ~/5g-sib8-alert
```

### gNB

#### Build UHD from source:
```
sudo apt install -y autoconf automake build-essential ccache cmake cpufrequtils doxygen ethtool g++ git inetutils-tools libboost-all-dev libncurses-dev libusb-1.0-0 libusb-1.0-0-dev libusb-dev python3-dev python3-mako python3-numpy python3-requests python3-scipy python3-setuptools python3-ruamel.yaml

git clone https://github.com/EttusResearch/uhd.git ~/uhd
cd ~/uhd
git checkout v4.8.0.0
cd host
mkdir build
cd build
cmake ../
make -j $(nproc)
make test # This step is optional
sudo make install
sudo ldconfig
sudo uhd_images_downloader
```

To check if uhd driver was successfully installed, run this command:
```
sudo uhd_find_devices
```
It should show the SDR you are using. 
You may need to unplug the SDR then re-plug it.

#### Build gNB
```
# Get openairinterface5g source code
git clone https://gitlab.eurecom.fr/oai/openairinterface5g.git ~/openairinterface5g
git checkout 102965a669b9444857c27843ec8ce62780bf9d37
git apply ~/5g-sib8-alert/oai-warning.patch

# Install OAI dependencies
cd ~/openairinterface5g/cmake_targets
sudo ./build_oai -I

# Build OAI gNB
cd ~/openairinterface5g/cmake_targets
sudo ./build_oai -w USRP --ninja --gNB -C
```

### Run NMS and OAI

#### CN

Start:
```bash
cd ~/oai-cn5g/
docker compose up -d
```

Stop:
```bash
cd ~/oai-cn5g/
docker compose down
```

#### NMS

Start:
```bash
cd ~/5g-sib8-alert/nms
./start-nms.sh
```
The web interface is accessible at http://localhost:3000/.

Stop:
```bash
cd ~/5g-sib8-alert/nms
./stop-nms.sh
```
**NOTE:** You should configure the parameters before running the gNB, except for sib8 parameters, as they can be modified at runtime.

#### gNB:

Start:
```bash
cd ~/openairinterface5g/cmake_targets/ran_build/build
sudo ./nr-softmodem -O ../../../targets/PROJECTS/GENERIC-NR-5GC/CONF/gnb.sa.band78.fr1.106PRB.usrpb210.conf -E --continuous-tx
```
Press `Ctrl+C` to stop the gNB.

