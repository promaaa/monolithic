# Running the 5G Stack

This guide covers starting the Core Network and gNB from a fresh state.

## Prerequisites

- Server: `serber@serber-firecell`
- All source code already downloaded to `~/monolithic/`
- UHD and OAI gNB already built

---

## Step 1 — Clean Up Leftover Directories

Remove any orphaned `oai-cn5g` / `openairinterface5g` directories in `$HOME`:

```bash
sudo rm -rf ~/oai-cn5g ~/openairinterface5g
```

---

## Step 2 — Start Core Network

```bash
cd ~/monolithic/oai-cn5g
docker compose down
docker compose up -d
```

Wait ~20 seconds, then verify all containers are healthy:

```bash
docker compose ps
```

Expected: all 10 containers show **healthy**.

Verify the SIM card is registered:

```bash
docker exec mysql mysql -u root -plinux -D oai_db -e \
  "SELECT * FROM AuthenticationSubscription WHERE supi='001010000059449';"
```

---

## Step 3 — Start gNB

```bash
cd ~/monolithic/openairinterface5g/cmake_targets/ran_build/build
sudo ./nr-softmodem \
  -O ../../../targets/PROJECTS/GENERIC-NR-5GC/CONF/gnb.sa.band78.fr1.106PRB.usrpb210.conf \
  -E --continuous-tx
```

Press `Ctrl+C` to stop the gNB.

---

## Step 4 — Verify Operation

### gNB Log

```bash
grep -i "sib8\|write_replace_warning\|cell in service" /tmp/gnb.log
```

Expected output at startup:
```
[SIB8] segments numer:0 and number of segments:1 total_pages: 1
[MAC] received Write Replace Warning Request from CU
[SIB8][HEX] 01 00 48 00 65 00 6C ...
```

### Check Active UEs

```bash
grep "UE.*RNTI\|in-sync" /tmp/gnb.log | tail -20
```

### Check CN Containers

```bash
docker compose ps
```

### SIB8 Configuration

The SIB8 warning message is configured in:

```
~/monolithic/openairinterface5g/sib8.conf
```

Key parameters:

```ini
messageIdentifier=1112   # 3GPP message ID for emergency alert
serialNumber=FF00        # Serial number for this warning
dataCodingScheme=48      # GSM 7-bit alphabet
text=Hello this is a test warning message.  # Warning text
mode=0                   # 0=etws, 1=cmas
```

Edit this file and restart the gNB to change the warning message.

---

## SIB8 / Public Warning System

The `oai-warning.patch` enables the gNB to send SIB8 (System Information Block type 8)
as part of the Public Warning System (PWS). SIB8 is transmitted immediately after the
F1 Setup exchange between the DU and CU.

The warning is sent **once** at gNB startup and contains:
- `messageIdentifier=1112` — identifies the alert type
- `serialNumber=FF00` — distinguishes this instance
- Text content defined in `sib8.conf`

To re-trigger SIB8 manually without restarting the gNB:

```bash
# Send ETWS control message from AMF (if supported)
# Or restart the gNB (Step 3)
```

---

## Quick Reference — Full Stack Restart

```bash
# 1. Clean up
sudo rm -rf ~/oai-cn5g ~/openairinterface5g

# 2. Start Core Network
cd ~/monolithic/oai-cn5g && docker compose down && docker compose up -d
sleep 20

# 3. Start gNB
cd ~/monolithic/openairinterface5g/cmake_targets/ran_build/build
sudo ./nr-softmodem \
  -O ../../../targets/PROJECTS/GENERIC-NR-5GC/CONF/gnb.sa.band78.fr1.106PRB.usrpb210.conf \
  -E --continuous-tx
```

---

## Troubleshooting

### No 5G connection on UE
```bash
# Check gNB is running
ps aux | grep nr-softmodem | grep -v grep

# Check CN health
docker compose ps

# Verify SIM card in DB
docker exec mysql mysql -u root -plinux -D oai_db -e \
  "SELECT * FROM AuthenticationSubscription WHERE supi='001010000059449';"
```

### gNB crashes immediately
```bash
# Check log
tail -50 /tmp/gnb.log

# Try running in foreground for debug output
cd ~/monolithic/openairinterface5g/cmake_targets/ran_build/build
sudo ./nr-softmodem \
  -O ../../../targets/PROJECTS/GENERIC-NR-5GC/CONF/gnb.sa.band78.fr1.106PRB.usrpb210.conf \
  -E --continuous-tx --log_config.global_log_level debug
```

### USRP not found
```bash
sudo uhd_find_devices
# If not found, unplug and replug the USB cable
```

### PWS / SIB8 not transmitted
```bash
# Verify sib8.conf exists
cat ~/monolithic/openairinterface5g/sib8.conf

# Check for SIB8 in log
grep -i "sib8\|write_replace" /tmp/gnb.log
```
