# 5G SIB8 Warning Transmission and Cross-Cell Verification

This repository contains a Network Management System (NMS) and patch files that extend the OpenAirInterface project to support:
- SIB8 emergency alert transmission from the gNB side,
- Cross Cell Verification (CCV) from the UE side.

The SIB8 warning transmission patch is based on OpenAirInterface commit:
`102965a669b9444857c27843ec8ce62780bf9d37`

The Cross-Cell Verification patch is based on OpenAirInterface commit:
`bf325466b38cb7c2560a8fc86de799bfc6799167`


## Overview

### SIB8 warning transmission
- Construction of SIB8 warning messages in the RRC layer,
- Support for segmented SIB8 transmission using multiple System Information messages,
- Support for multiple data coding schemes (GSM 7-bit and UCS2),
- Support for runtime updates of SIB8 parameters.

### Cross-Cell Verification
- UE-side verification of received SIB8 warnings by scanning neighboring cells,
- Comparison of warning contents across cells to help detect spoofed alerts,
- Configurable verification behavior.
- Return to the original carrier configuration after verification,
- Exclusion of the original cell based on its PCI (Physical Cell Identity) if the warning is not verified.

### The NMS allows users to:
- Modify SIB8 warning message parameters, including the transmission mode.
- Configure key gNB parameters (e.g. PLMN, cell identity..).
- Manage basic subscriber data in the core network.

## Tutorial

> **Note:**
> - This setup was tested on **Ubuntu 24.04** with an **USRP B210 SDR**.
> - The commands below are a **tested version** of the steps described in the official OAI documentation: [OAI NR SA Tutorial for COTS UE](https://gitlab.eurecom.fr/oai/openairinterface5g/-/blob/develop/doc/NR_SA_Tutorial_COTS_UE.md).
> - Users are encouraged to explore the official documentation for additional background and advanced configurations.


Clone the current repository:
```bash
git clone https://github.com/5gattacks/5g-sib8-alert.git ~/5g-sib8-alert
```

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
cd ~/openairinterface5g
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
cd ~/5g-sib8-alert/
./start-nms.sh
```
The web interface is accessible at http://localhost:3000/.

Stop:
```bash
cd ~/5g-sib8-alert/
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

### Build UE for Cross-Cell Verification

The Cross Cell Verification patch is built the same way as the gNB patch. The only differences are:
- use the CCV-compatible OpenAirInterface commit,
- apply the CCV patch,
- run the UE instead of the gNB.

```bash
git clone https://gitlab.eurecom.fr/oai/openairinterface5g.git ~/cross-cell-verification
cd ~/cross-cell-verification
git checkout bf325466b38cb7c2560a8fc86de799bfc6799167
git apply ~/5g-sib8-alert/cross-cell.patch

# Install OAI dependencies
cd ~/cross-cell-verification/cmake_targets
sudo ./build_oai -I

# Build OAI
cd ~/cross-cell-verification/cmake_targets
sudo ./build_oai -w USRP --ninja --nrUE --gNB --build-lib "nrscope" -C
```

#### Configure neighboring carriers and scan parameters for Cross-Cell Verification

Before compilation, update ccv_carrier_table and CCV_CARRIERS_NUM in `mac_defs.h` with the neighboring cells that the UE should scan.

These carrier frequencies must be chosen so that they do not overlap.

Each neighboring cell should also use a different PCI to allow proper distinction during verification.

```c
#define CCV_CARRIERS_NUM 9
static const ccv_carrier_entry_t ccv_carrier_table[] = {
    { 3444600, 78, 1, 106 }, // center = 3463680000 Hz
    { 3483480, 78, 1, 106 }, // center = 3502560000 Hz
    { 3522360, 78, 1, 106 }, // center = 3541440000 Hz
    { 3561240, 78, 1, 106 }, // center = 3580320000 Hz
    { 3600120, 78, 1, 106 }, // center = 3619200000 Hz
    { 3639000, 78, 1, 106 }, // center = 3658080000 Hz
    { 3677880, 78, 1, 106 }, // center = 3696960000 Hz
    { 3716760, 78, 1, 106 }, // center = 3735840000 Hz
    { 3755640, 78, 1, 106 }  // center = 3774720000 Hz
};
```

You can also configure the verification behavior in `nr_common.h` through the following parameters:

```c
#define SIB8_MAX_SCAN_CELLS  3
#define SIB8_TARGET_CELLS    1
#define SIB8_SCAN_TIMEOUT_MS 10000
```

#### Start UE

Start:
```bash
cd ~/cross-cell-verification/cmake_targets/ran_build/build
sudo ./nr-uesoftmodem -r 106 --numerology 1 --band 78 -C 3619200000 --ue-fo-compensation -E --uicc0.imsi 001010000000001
```
Press Ctrl+C to stop the UE.

> **Note on SDR retuning**
>
> The current implementation performs a soft reset when changing the SDR frequency in `usrp_lib.cpp`.
> This behavior is not part of the Cross-Cell Verification logic itself. It is a practical workaround related to SDR retuning limitations observed during frequency switching.
>
> As a result, users may see repeated logs related to sleep or restart behavior while the UE scans neighboring carriers.
