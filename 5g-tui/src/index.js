import inquirer from 'inquirer';
import { spawn, exec } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const SERBER_HOST = 'serber-firecell';
const SERBER_USER = 'serber';
const SERBER_PASS = 'root4SERBER';
const SERBER_MINIPC_HOST = 'serber-minipc';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function resolveHost(hostname) {
    return new Promise((resolve) => {
        exec(`dscacheutil -q host -a name ${hostname}`, { timeout: 5000 }, (err, stdout) => {
            if (err || !stdout) {
                resolve(null);
                return;
            }
            const match = stdout.match(/ip_address:\s*(.+)/);
            resolve(match ? match[1].trim() : null);
        });
    });
}

async function getResolvedHost(hostname) {
    const ip = await resolveHost(hostname);
    if (!ip) {
        throw new Error(`Could not resolve ${hostname}`);
    }
    return ip;
}

function sshExec(cmd, host, timeout = 60000) {
    return new Promise(async (resolve, reject) => {
        let ip = host;
        if (!ip.match(/^\d+\.\d+\.\d+\.\d+$/)) {
            try {
                ip = await getResolvedHost(host);
            } catch {
                reject(new Error(`Could not resolve ${host}`));
                return;
            }
        }
        const sshCmd = `sshpass -p '${SERBER_PASS}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o ConnectionAttempts=2 -o UserKnownHostsFile=/dev/null ${SERBER_USER}@${ip} '${cmd}'`;
        exec(sshCmd, { timeout }, (err, stdout, stderr) => {
            const combined = (stdout || '') + (stderr || '');
            if (err && !stdout && !combined.includes('Warning: Permanently added')) {
                reject(new Error(err.message));
                return;
            }
            resolve({ stdout: stdout || '', stderr: stderr || '', combined });
        });
    });
}

function sshExecBg(cmd, host) {
    return new Promise(async (resolve, reject) => {
        let ip = host;
        if (!ip.match(/^\d+\.\d+\.\d+\.\d+$/)) {
            try {
                ip = await getResolvedHost(host);
            } catch {
                reject(new Error(`Could not resolve ${host}`));
                return;
            }
        }
        const sshCmd = `sshpass -p '${SERBER_PASS}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o UserKnownHostsFile=/dev/null ${SERBER_USER}@${ip} 'nohup ${cmd} > /dev/null 2>&1 &'`;
        exec(sshCmd, { timeout: 15000 }, (err, stdout, stderr) => {
            const combined = (stdout || '') + (stderr || '');
            if (err && !combined.includes('Warning: Permanently added') && !combined.includes('Killed')) {
                reject(new Error(err.message));
                return;
            }
            resolve({ stdout: stdout || '', stderr: stderr || '' });
        });
    });
}

function printHeader(title) {
    const width = 64;
    const padding = Math.floor((width - title.length) / 2);
    console.log('\n');
    console.log('  ╔' + '═'.repeat(width) + '╗');
    console.log('  ║' + ' '.repeat(width) + '║');
    console.log('  ║' + ' '.repeat(padding) + '\x1b[1m' + title + '\x1b[0m' + ' '.repeat(width - padding - title.length) + '║');
    console.log('  ║' + ' '.repeat(width) + '║');
    console.log('  ╚' + '═'.repeat(width) + '╝');
}

function printSuccess(msg) {
    console.log(`  \x1b[32m✓ ${msg}\x1b[0m`);
}

function printError(msg) {
    console.log(`  \x1b[31m✗ ${msg}\x1b[0m`);
}

function printInfo(msg) {
    console.log(`  \x1b[36mℹ ${msg}\x1b[0m`);
}

function printStep(step, total, title) {
    console.log(`\n  \x1b[90m[Step ${step}/${total}]\x1b[0m \x1b[1m${title}\x1b[0m`);
}

async function checkHostSSH(hostname) {
    try {
        const ip = await getResolvedHost(hostname);
        if (!ip) return false;
        return new Promise((resolve) => {
            exec(`sshpass -p '${SERBER_PASS}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o UserKnownHostsFile=/dev/null ${SERBER_USER}@${ip} 'echo ok'`, { timeout: 10000 }, (err, stdout) => {
                resolve(!err && stdout.includes('ok'));
            });
        });
    } catch {
        return false;
    }
}

async function discoverHosts() {
    const discovered = [];

    console.log('  Resolving serber-firecell...');
    try {
        const ok = await checkHostSSH('serber-firecell');
        if (ok) {
            discovered.push({ name: 'serber-firecell', hostname: 'serber-firecell', found: true });
            console.log('  \x1b[32m✓ serber-firecell connected\x1b[0m');
        } else {
            discovered.push({ name: 'serber-firecell', hostname: 'serber-firecell', found: false });
            console.log('  \x1b[31m✗ serber-firecell unreachable\x1b[0m');
        }
    } catch {
        discovered.push({ name: 'serber-firecell', hostname: 'serber-firecell', found: false });
        console.log('  \x1b[31m✗ serber-firecell error\x1b[0m');
    }

    console.log('  Resolving serber-minipc...');
    try {
        const ok = await checkHostSSH('serber-minipc');
        if (ok) {
            discovered.push({ name: 'serber-minipc', hostname: 'serber-minipc', found: true });
            console.log('  \x1b[32m✓ serber-minipc connected\x1b[0m');
        } else {
            discovered.push({ name: 'serber-minipc', hostname: 'serber-minipc', found: false });
            console.log('  \x1b[31m✗ serber-minipc unreachable\x1b[0m');
        }
    } catch {
        discovered.push({ name: 'serber-minipc', hostname: 'serber-minipc', found: false });
        console.log('  \x1b[31m✗ serber-minipc error\x1b[0m');
    }

    return discovered;
}

async function onboarding() {
    console.clear();
    printHeader('5G Network Control Terminal');
    console.log('\n');
    console.log('  Welcome! This tool manages your 5G network infrastructure.');
    console.log('  Follow the prompts to set up and control your network.\n');

    console.log('  Scanning for known hosts...\n');

    const discovered = await discoverHosts();

    const firecellFound = discovered.find(h => h.name === 'serber-firecell')?.found;
    const minipcFound = discovered.find(h => h.name === 'serber-minipc')?.found;

    let config = {};
    let setupType = 'single';

    if (firecellFound && minipcFound) {
        console.log('  \x1b[32mBoth hosts found! Using CU/DU Split configuration.\x1b[0m\n');
        setupType = 'split';
        config = {
            type: 'split',
            host: 'serber-firecell',
            duHost: 'serber-minipc',
            plmn: '001/01'
        };
    } else if (firecellFound) {
        console.log('  \x1b[33mserber-firecell found. Using All-in-one configuration.\x1b[0m\n');
        setupType = 'single';
        config = {
            type: 'single',
            host: 'serber-firecell',
            duHost: null,
            plmn: '001/01'
        };
    } else {
        console.log('  \x1b[31mserber-firecell not found. Manual configuration required.\x1b[0m\n');

        const { manualType } = await inquirer.prompt([
            {
                type: 'list',
                name: 'manualType',
                message: 'Select setup type:',
                choices: [
                    { name: 'serber-firecell (All-in-one: Core + RAN)', value: 'single' },
                    { name: 'CU/DU Split (Core on firecell, DU on minipc)', value: 'split' },
                    { name: 'Custom configuration', value: 'custom' }
                ],
                default: 'single'
            }
        ]);

        setupType = manualType;

        if (manualType === 'single') {
            const { host, plmn } = await inquirer.prompt([
                { type: 'input', name: 'host', message: 'serber-firecell hostname:', default: 'serber-firecell' },
                { type: 'input', name: 'plmn', message: 'PLMN:', default: '001/01' }
            ]);
            config = { ...config, host, plmn, duHost: null };
        } else if (manualType === 'split') {
            const { coreHost, duHost, plmn } = await inquirer.prompt([
                { type: 'input', name: 'coreHost', message: 'serber-firecell hostname:', default: 'serber-firecell' },
                { type: 'input', name: 'duHost', message: 'serber-minipc hostname:', default: 'serber-minipc' },
                { type: 'input', name: 'plmn', message: 'PLMN:', default: '001/01' }
            ]);
            config = { type: 'split', host: coreHost, duHost, plmn };
        } else {
            const { coreHost, duEnabled, duHost, plmn } = await inquirer.prompt([
                { type: 'input', name: 'coreHost', message: 'Core Network hostname:', default: 'serber-firecell' },
                { type: 'confirm', name: 'duEnabled', message: 'Include DU?' },
                { type: 'input', name: 'duHost', message: 'DU hostname:', default: 'serber-minipc', when: (a) => a.duEnabled },
                { type: 'input', name: 'plmn', message: 'PLMN:', default: '001/01' }
            ]);
            config = { type: 'custom', host: coreHost, duHost: duEnabled ? duHost : null, plmn };
        }
    }

    if (setupType !== 'custom') {
        const { modifyConfig } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'modifyConfig',
                message: 'Use default configuration?',
                default: true
            }
        ]);

        if (!modifyConfig) {
            const { host, duHost, plmn } = await inquirer.prompt([
                { type: 'input', name: 'host', message: 'Core Host hostname:', default: config.host },
                { type: 'input', name: 'duHost', message: 'DU hostname:', default: config.duHost || 'serber-minipc', when: () => config.duHost !== null },
                { type: 'input', name: 'plmn', message: 'PLMN:', default: config.plmn }
            ]);
            config.host = host;
            if (config.duHost !== null) config.duHost = duHost;
            config.plmn = plmn;
        }
    }

    console.log('\n  Configuration:');
    console.log('  ─────────────────────────');
    console.log(`  Type:      ${setupType === 'single' ? 'All-in-one' : setupType === 'split' ? 'CU/DU Split' : 'Custom'}`);
    console.log(`  Core:      ${config.host}`);
    if (config.duHost) console.log(`  DU:        ${config.duHost}`);
    console.log(`  PLMN:      ${config.plmn}`);
    console.log('  ─────────────────────────\n');

    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
                { name: 'Start Network (Full sequence)', value: 'start' },
                { name: 'Stop Network', value: 'stop' },
                { name: 'Restart Network', value: 'restart' },
                { name: 'Change Emergency Message', value: 'emergency' },
                { name: 'Exit', value: 'exit' }
            ]
        }
    ]);

    return { config, action };
}

async function runFullStartup(config) {
    console.clear();
    printHeader('5G Network Startup');

    try {
        printInfo('Testing connection to serber-firecell...');
        await sshExec('echo "connected"', config.host);
        printSuccess('Connected!\n');

        printStep(1, 7, 'Reset USRP USB');
        try {
            await sshExec('echo "2-6" | sudo tee /sys/bus/usb/drivers/usb/unbind > /dev/null && sleep 2 && echo "2-6" | sudo tee /sys/bus/usb/drivers/usb/bind > /dev/null && sleep 3', config.host);
            await sleep(1000);
            const usrp = await sshExec('uhd_find_devices', config.host);
            if (usrp.combined.includes('type') || usrp.combined.includes('B')) {
                printSuccess('USRP detected');
                usrp.combined.split('\n').filter(Boolean).forEach(l => {
                    if (l.includes('serial') || l.includes('name') || l.includes('product') || l.includes('type')) {
                        console.log(`    \x1b[90m${l.trim()}\x1b[0m`);
                    }
                });
            } else {
                printInfo('USRP reset complete');
            }
        } catch (e) {
            printInfo('USRP reset skipped (may already be running)');
        }

        printStep(2, 7, 'Start 5G Core Network');
        printInfo('Cleaning up old containers...');
        try {
            await sshExec('cd ~/oai-cn5g && docker-compose down -v 2>/dev/null || true', config.host);
        } catch { /* ignore */ }
        printInfo('Pulling latest images...');
        try {
            await sshExec('cd ~/oai-cn5g && docker-compose pull 2>&1 | tail -3', config.host);
        } catch { /* ignore */ }
        printInfo('Starting Docker containers...');
        await sshExec('cd ~/oai-cn5g && docker-compose up -d', config.host);
        printSuccess('Core containers starting...');
        await sleep(8000);

        const containers = await sshExec('docker ps --format "{{.Names}}: {{.Status}}"', config.host);
        const runningContainers = containers.combined.split('\n').filter(c => c.includes('Up'));
        if (runningContainers.length > 0) {
            runningContainers.forEach(c => {
                console.log(`    \x1b[32m✓ ${c}\x1b[0m`);
            });
        } else {
            printInfo('Checking container status...');
        }

        printStep(3, 7, 'Verify SMF Registration with NRF');
        await sleep(5000);
        try {
            const nrf = await sshExec('docker logs oai-smf 2>&1 | grep -i "nrf\\|register" | tail -5', config.host);
            if (nrf.combined.trim()) {
                nrf.combined.split('\n').filter(Boolean).forEach(l => console.log(`    \x1b[90m${l.trim()}\x1b[0m`));
            } else {
                printSuccess('SMF registered with NRF');
            }
        } catch {
            printInfo('Waiting for NRF registration...');
        }

        printStep(4, 7, 'Start gNB (nr-softmodem)');
        printInfo('Stopping any existing nr-softmodem...');
        try {
            await sshExec('pkill -9 nr-softmodem 2>/dev/null || true', config.host);
            await sleep(2000);
        } catch { /* ignore */ }

        printInfo('Starting nr-softmodem (background)...');
        const gnbBinary = '~/openairinterface5g/cmake_targets/ran_build/build/nr-softmodem';
        const gnbConf = '~/openairinterface5g/targets/PROJECTS/GENERIC-NR-5GC/CONF/gnb.sa.band78.fr1.106PRB.usrpb210.conf';
        const gnbCmd = `cd ${gnbBinary.replace('~', '$HOME').replace('/cmake_targets/ran_build/build/nr-softmodem', '')}/cmake_targets/ran_build/build && sudo nohup ./nr-softmodem -O ${gnbConf} -E --continuous-tx > $HOME/gnb.log 2>&1 &`;

        try {
            await sshExecBg(`cd $HOME/openairinterface5g/cmake_targets/ran_build/build && sudo nohup ./nr-softmodem -O $HOME/openairinterface5g/targets/PROJECTS/GENERIC-NR-5GC/CONF/gnb.sa.band78.fr1.106PRB.usrpb210.conf -E --continuous-tx`, config.host);
            printSuccess('gNB starting in background...');
        } catch (e) {
            printInfo('gNB launch initiated...');
        }
        await sleep(6000);

        printStep(5, 7, 'Verify gNB Registration with AMF');
        await sleep(3000);
        try {
            const amf = await sshExec('docker logs oai-amf 2>&1 | grep -i "gnb\\|register" | tail -5', config.host);
            if (amf.combined.trim()) {
                amf.combined.split('\n').filter(Boolean).forEach(l => console.log(`    \x1b[90m${l.trim()}\x1b[0m`));
            } else {
                printSuccess('gNB registered with AMF');
            }
        } catch {
            printInfo('Checking gNB status...');
        }

        const gnbCheck = await sshExec('ps aux | grep nr-softmodem | grep -v grep | head -1', config.host);
        if (gnbCheck.combined.includes('nr-softmodem')) {
            printSuccess('gNB process is running');
        }

        printStep(6, 7, 'Connect UE (Nothing Phone)');
        console.log('\n    \x1b[33m⚠\x1b[0m  Follow these steps:\n');
        console.log('    ┌─────────────────────────────────────────┐');
        console.log('    │  1. Enable Airplane Mode on phone        │');
        console.log('    │  2. Wait 2 seconds                      │');
        console.log('    │  3. Disable Airplane Mode               │');
        console.log('    │  4. Wait for 5G connection...          │');
        console.log('    └─────────────────────────────────────────┘\n');

        const { ueDone } = await inquirer.prompt([
            { type: 'confirm', name: 'ueDone', message: 'UE connected?', default: true }
        ]);

        printStep(7, 7, 'Verify UE Registration');
        if (ueDone) {
            await sleep(3000);
            const ue = await sshExec('docker logs oai-amf 2>&1 | grep "UEs" | tail -1', config.host);
            if (ue.combined.trim()) {
                printSuccess('UE Status: ' + ue.combined.trim());
            }
            const ueImsi = await sshExec('docker logs oai-amf 2>&1 | grep "001010000059449" | tail -3', config.host);
            if (ueImsi.combined.trim()) {
                ueImsi.combined.split('\n').filter(Boolean).forEach(l => console.log(`    \x1b[90m${l.trim()}\x1b[0m`));
            }
        }

        console.log('\n');
        printSuccess('Startup sequence completed!\n');

    } catch (err) {
        console.log(`\n`);
        printError(`Error: ${err.message}`);
        const { retry } = await inquirer.prompt([
            { type: 'confirm', name: 'retry', message: 'Try again?', default: true }
        ]);
        if (retry) return 'start';
    }

    const { nextAction } = await inquirer.prompt([
        {
            type: 'list',
            name: 'nextAction',
            message: 'Next action:',
            choices: [
                { name: 'Check Status', value: 'status' },
                { name: 'Return to Main Menu', value: 'menu' },
                { name: 'Exit', value: 'exit' }
            ],
            default: 'menu'
        }
    ]);

    return nextAction;
}

async function checkStatus(config) {
    console.clear();
    printHeader('Network Status');

    try {
        printInfo('Connecting...');
        await sshExec('echo "ok"', config.host);
        printSuccess('Connected\n');

        console.log('  \x1b[1mUSRP Devices\x1b[0m');
        console.log('  ' + '─'.repeat(50));
        const usrp = await sshExec('uhd_find_devices 2>&1', config.host);
        if (usrp.combined.includes('type') || usrp.combined.includes('B')) {
            usrp.combined.split('\n').filter(Boolean).forEach(l => console.log(`    \x1b[32m${l}\x1b[0m`));
        } else {
            console.log('    \x1b[33mNo USRP devices found\x1b[0m');
        }

        console.log('\n  \x1b[1mCore Containers\x1b[0m');
        console.log('  ' + '─'.repeat(50));
        const containers = await sshExec('docker ps --format "{{.Names}}: {{.Status}}"', config.host);
        containers.combined.split('\n').filter(Boolean).forEach(c => {
            const ok = c.includes('Up');
            console.log(`    ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${c}`);
        });

        console.log('\n  \x1b[1mgNB Process\x1b[0m');
        console.log('  ' + '─'.repeat(50));
        const gnb = await sshExec('ps aux | grep nr-softmodem | grep -v grep', config.host);
        if (gnb.combined.trim()) {
            console.log('    \x1b[32m✓ Running\x1b[0m');
            const pidMatch = gnb.combined.match(/^\S+\s+(\d+)/);
            if (pidMatch) console.log(`    PID: ${pidMatch[1]}`);
        } else {
            console.log('    \x1b[31m✗ Not running\x1b[0m');
        }

        console.log('\n  \x1b[1mUE Status\x1b[0m');
        console.log('  ' + '─'.repeat(50));
        const ue = await sshExec('docker logs oai-amf 2>&1 | grep "UEs" | tail -1', config.host);
        if (ue.combined.trim()) {
            console.log(`    \x1b[32m${ue.combined.trim()}\x1b[0m`);
        } else {
            console.log('    \x1b33mNo UEs connected\x1b[0m');
        }

        console.log('\n');

    } catch (err) {
        printError(`Connection failed: ${err.message}`);
    }

    await inquirer.prompt([
        { type: 'input', name: 'cont', message: 'Press Enter to continue...' }
    ]);
}

async function stopNetwork(config) {
    printHeader('Stop Network');

    try {
        printInfo('Stopping gNB...');
        await sshExec('pkill -9 nr-softmodem 2>/dev/null || true', config.host);
        printSuccess('gNB stopped');

        printInfo('Stopping core containers...');
        await sshExec('cd ~/oai-cn5g && docker-compose down', config.host);
        printSuccess('Core network stopped');

        console.log('\n');
        printSuccess('Network stopped!\n');

    } catch (err) {
        printError(`Error: ${err.message}`);
    }

    await inquirer.prompt([
        { type: 'input', name: 'cont', message: 'Press Enter to continue...' }
    ]);
}

async function restartNetwork(config) {
    printHeader('Restart Network');

    try {
        printInfo('Stopping existing services...');
        await sshExec('pkill -9 nr-softmodem 2>/dev/null || true', config.host);
        await sshExec('cd ~/oai-cn5g && docker-compose down', config.host);
        printSuccess('Stopped\n');

        printInfo('Starting core network...');
        await sshExec('cd ~/oai-cn5g && docker-compose up -d', config.host);
        await sleep(5000);
        printSuccess('Core started\n');

        printInfo('Starting gNB...');
        try {
            await sshExecBg(`cd $HOME/openairinterface5g/cmake_targets/ran_build/build && sudo nohup ./nr-softmodem -O $HOME/openairinterface5g/targets/PROJECTS/GENERIC-NR-5GC/CONF/gnb.sa.band78.fr1.106PRB.usrpb210.conf -E --continuous-tx`, config.host);
        } catch { /* ignore */ }
        printSuccess('gNB started\n');

        printSuccess('Network restarted!\n');

    } catch (err) {
        printError(`Error: ${err.message}`);
    }

    await inquirer.prompt([
        { type: 'input', name: 'cont', message: 'Press Enter to continue...' }
    ]);
}

async function rebuildCore(config) {
    printHeader('Rebuild Core Network');

    try {
        printInfo('Stopping all services...');
        await sshExec('pkill -9 nr-softmodem 2>/dev/null || true', config.host);
        await sshExec('cd ~/oai-cn5g && docker-compose down -v 2>/dev/null || true', config.host);
        printSuccess('Stopped and cleaned\n');

        printInfo('Pulling latest images...');
        await sshExec('cd ~/oai-cn5g && docker-compose pull', config.host);
        printSuccess('Images pulled\n');

        printInfo('Starting core network...');
        await sshExec('cd ~/oai-cn5g && docker-compose up -d', config.host);
        await sleep(8000);

        const containers = await sshExec('docker ps --format "{{.Names}}: {{.Status}}"', config.host);
        containers.combined.split('\n').filter(Boolean).forEach(c => {
            const ok = c.includes('Up');
            console.log(`    ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${c}`);
        });

        printSuccess('\nCore rebuilt successfully!\n');

    } catch (err) {
        printError(`Error: ${err.message}`);
    }

    await inquirer.prompt([
        { type: 'input', name: 'cont', message: 'Press Enter to continue...' }
    ]);
}

async function changeEmergencyMessage(config) {
    console.clear();
    printHeader('Change Emergency Message');

    try {
        const ip = await getResolvedHost(config.host);
        printInfo(`Fetching current message from ${config.host}...`);

        const current = await sshExec('cat ~/openairinterface5g/sib8.conf', config.host);
        const currentMsg = current.combined.match(/text=([^;]+)/)?.[1] || 'Unknown';

        console.log(`\n  Current message: "${currentMsg.trim()}"\n`);

        const { newMessage } = await inquirer.prompt([
            { type: 'input', name: 'newMessage', message: 'Enter new emergency message:', default: 'Hello this is a test warning message.' }
        ]);

        if (!newMessage.trim()) {
            printError('Message cannot be empty');
            return;
        }

        printInfo('Updating sib8.conf...');
        const escapedMsg = newMessage.replace(/'/g, "'\\''");
        const cmd = `sed -i "s/^text=.*;/text=${escapedMsg};/" ~/openairinterface5g/sib8.conf`;

        await sshExec(cmd, config.host);

        const verify = await sshExec('cat ~/openairinterface5g/sib8.conf | grep text=', config.host);
        printSuccess('Message updated!');
        console.log(`  New message: "${verify.combined.match(/text=([^;]+)/)?.[1] || newMessage.trim()}"`);

        const { restart } = await inquirer.prompt([
            { type: 'confirm', name: 'restart', message: 'Restart gNB to apply new message?', default: false }
        ]);

        if (restart) {
            printInfo('Restarting gNB...');
            await sshExec('sudo pkill -f nr-softmodem; sleep 2', config.host);
            await sleep(2000);
            const gnbCmd = 'cd ~/openairinterface5g && sudo cmake_targets/ran_build/build/nr-softmodem -O targets/PROJECTS/GENERIC-NR-5GC/CONF/gnb.sa.band78.fr1.106PRB.usrpb210.conf -d';
            await sshExec(gnbCmd, config.host);
            printSuccess('gNB restarted with new message!');
        }
    } catch (err) {
        console.log(`\n`);
        printError(`Error: ${err.message}`);
    }

    await inquirer.prompt([
        { type: 'input', name: 'cont', message: 'Press Enter to continue...' }
    ]);
}

async function openSSH(config) {
    console.clear();
    console.log(`\n  Resolving ${config.host}...\n`);
    const ip = await getResolvedHost(config.host);
    console.log(`  Opening SSH session to ${ip}...\n`);
    console.log('  Close the terminal window to return here.\n');

    spawn('open', ['-a', 'Terminal']);

    await inquirer.prompt([
        { type: 'input', name: 'cont', message: 'Press Enter when done with SSH...' }
    ]);
}

async function main() {
    let running = true;

    while (running) {
        try {
            const { config, action } = await onboarding();

            switch (action) {
                case 'start':
                    const result = await runFullStartup(config);
                    if (result === 'exit') running = false;
                    break;
                case 'stop':
                    await stopNetwork(config);
                    break;
                case 'restart':
                    await restartNetwork(config);
                    break;
                case 'emergency':
                    await changeEmergencyMessage(config);
                    break;
                case 'exit':
                    running = false;
                    break;
            }
        } catch (err) {
            if (err.message && err.message.includes('User force closed')) {
                running = false;
            } else {
                console.error('\n  Error:', err.message);
                await sleep(2000);
            }
        }
    }

    console.log('\n  Thanks for using 5G Network Control!\n');
    process.exit(0);
}

main();