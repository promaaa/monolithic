import inquirer from 'inquirer';
import { spawn, exec } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_DIR = path.join(os.homedir(), '.5g-tui');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CORE_PATH = '~/monolithic/oai-cn5g';
const DEFAULT_RAN_PATH = '~/monolithic/openairinterface5g';
const DEFAULT_GNB_CONFIG = 'gnb.sa.band78.fr1.106PRB.usrpb210.conf';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function encryptPassword(password, key) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decryptPassword(encrypted, key) {
    try {
        const parts = encrypted.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
        let decrypted = decipher.update(parts[1], 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch {
        return null;
    }
}

function getEncryptionKey() {
    return crypto.createHash('sha256').update(os.homedir() + '-5g-tui-key').digest();
}

function saveConfig(config) {
    try {
        if (!existsSync(CONFIG_DIR)) {
            mkdirSync(CONFIG_DIR, { recursive: true });
        }
        const configToSave = { ...config };
        if (config.corePassword) configToSave.corePassword = encryptPassword(config.corePassword, getEncryptionKey());
        if (config.duPassword) configToSave.duPassword = encryptPassword(config.duPassword, getEncryptionKey());
        writeFileSync(CONFIG_FILE, JSON.stringify(configToSave, null, 2));
        return true;
    } catch {
        return false;
    }
}

function loadConfig() {
    try {
        if (!existsSync(CONFIG_FILE)) return null;
        const data = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
        if (data.corePassword) {
            const decrypted = decryptPassword(data.corePassword, getEncryptionKey());
            if (decrypted) data.corePassword = decrypted;
            else delete data.corePassword;
        }
        if (data.duPassword) {
            const decrypted = decryptPassword(data.duPassword, getEncryptionKey());
            if (decrypted) data.duPassword = decrypted;
            else delete data.duPassword;
        }
        return data;
    } catch {
        return null;
    }
}

function deleteSavedConfig() {
    try {
        if (existsSync(CONFIG_FILE)) {
            exec(`rm -f "${CONFIG_FILE}"`);
        }
        return true;
    } catch {
        return false;
    }
}

function expandHomePath(path, user) {
    if (!path) return path;
    if (path.startsWith('~/')) {
        return path.replace('~', `/home/${user}`);
    }
    return path;
}

function resolveCorePath(corePath, coreUser) {
    return expandHomePath(corePath, coreUser);
}

function resolveRanPath(ranPath, coreUser) {
    return expandHomePath(ranPath, coreUser);
}

function resolveHost(hostname) {
    return new Promise((resolve, reject) => {
        exec(`dscacheutil -q host -a name ${hostname}`, { timeout: 3000 }, (err, stdout) => {
            if (err || !stdout) {
                reject(new Error(`Cannot resolve hostname: ${hostname}`));
                return;
            }
            const match = stdout.match(/ip_address:\s*(.+)/);
            if (match) {
                resolve(match[1].trim());
            } else {
                reject(new Error(`Cannot resolve hostname: ${hostname}`));
            }
        });
    });
}

async function getResolvedHost(hostname) {
    if (!hostname) throw new Error('Hostname is required');
    if (hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
        return hostname;
    }
    return await resolveHost(hostname);
}

function sshExec(cmd, host, user, password, timeout = 10000) {
    return new Promise(async (resolve, reject) => {
        let ip = host;
        try {
            ip = await getResolvedHost(host);
        } catch (err) {
            reject(new Error(`Cannot resolve host '${host}': ${err.message}`));
            return;
        }

        const sshCmd = `sshpass -p '${password}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=2 -o ConnectionAttempts=1 -o UserKnownHostsFile=/dev/null ${user}@${ip} '${cmd}'`;

        exec(sshCmd, { timeout }, (err, stdout, stderr) => {
            if (err) {
                reject(new Error(`SSH failed for ${user}@${ip}: ${err.message}`));
                return;
            }
            resolve({ stdout: stdout || '', stderr: stderr || '', combined: (stdout || '') + (stderr || '') });
        });
    });
}

function sshExecBg(cmd, host, user, password) {
    return new Promise(async (resolve, reject) => {
        let ip = host;
        try {
            ip = await getResolvedHost(host);
        } catch (err) {
            reject(new Error(`Cannot resolve host '${host}': ${err.message}`));
            return;
        }

        const sshCmd = `sshpass -p '${password}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o UserKnownHostsFile=/dev/null ${user}@${ip} '${cmd}'`;

        exec(sshCmd, { timeout: 20000 }, (err, stdout, stderr) => {
            if (err) {
                reject(new Error(`SSH failed for ${user}@${ip}: ${err.message}`));
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

function printWarn(msg) {
    console.log(`  \x1b[33m⚠ ${msg}\x1b[0m`);
}

function printStep(step, total, title) {
    console.log(`\n  \x1b[90m[Step ${step}/${total}]\x1b[0m \x1b[1m${title}\x1b[0m`);
}

async function testConnection(host, user, password) {
    try {
        await sshExec('echo "connected"', host, user, password, 8000);
        return true;
    } catch (err) {
        throw new Error(`Connection failed: ${err.message}`);
    }
}

async function onboarding() {
    console.clear();
    printHeader('5G Network Control - Generic');
    console.log('\n');
    console.log('  Welcome! This tool manages your 5G network infrastructure.\n');

    const savedConfig = loadConfig();

    if (savedConfig && savedConfig.coreHost) {
        console.log('  \x1b[33m📁 Saved configuration found!\x1b[0m');
        if (savedConfig.savedAt) {
            console.log(`     Last used: ${new Date(savedConfig.savedAt).toLocaleString()}`);
        }
        console.log('');

        const { useSaved } = await inquirer.prompt([
            {
                type: 'list',
                name: 'useSaved',
                message: 'Load saved configuration?',
                choices: [
                    { name: 'Yes, use saved config', value: 'load' },
                    { name: 'No, create new configuration', value: 'new' },
                    { name: 'Delete saved config and start fresh', value: 'delete' }
                ],
                default: 0
            }
        ]);

        if (useSaved === 'load') {
            return { config: savedConfig, action: null, isNewConfig: false };
        } else if (useSaved === 'delete') {
            deleteSavedConfig();
            console.clear();
            printHeader('5G Network Control - Generic');
            console.log('\n');
        } else if (useSaved === 'new') {
            console.clear();
            printHeader('5G Network Control - Generic');
            console.log('\n');
        }
    }

    const config = {
        savedAt: new Date().toISOString()
    };

    console.log('  \x1b[1m=== Step 1: Network Mode ===\x1b[0m\n');

    const { mode } = await inquirer.prompt([
        {
            type: 'list',
            name: 'mode',
            message: 'Select network architecture:',
            choices: [
                { name: 'Monolithic - All on one machine (default)', value: 'monolithic' },
                { name: 'CU/DU Split - Core + DU on separate machines (coming soon)', value: 'split' }
            ],
            default: 'monolithic'
        }
    ]);

    if (mode === 'split') {
        printError('CU/DU Split is not implemented yet. Please use Monolithic mode.');
        await inquirer.prompt([{ type: 'input', name: 'cont', message: '  Press Enter to continue with Monolithic mode...' }]);
        config.mode = 'monolithic';
    } else {
        config.mode = mode;
    }

    console.log(`  \x1b[32m→ Monolithic mode selected\x1b[0m\n`);

    console.log('  \x1b[1m=== Step 2: Core Machine SSH ===\x1b[0m\n');

    const coreCreds = await inquirer.prompt([
        { type: 'input', name: 'coreHost', message: '  Host (IP or hostname):', default: savedConfig?.coreHost || '' },
        { type: 'input', name: 'coreUser', message: '  Username:', default: savedConfig?.coreUser || '' },
        { type: 'password', name: 'corePass', message: '  Password:', mask: '*' }
    ]);

    if (!coreCreds.coreHost || !coreCreds.coreUser || !coreCreds.corePass) {
        printError('All fields are required!');
        await inquirer.prompt([{ type: 'input', name: 'cont', message: '  Press Enter to restart...' }]);
        return { config: null, action: null, isNewConfig: false };
    }

    config.coreHost = coreCreds.coreHost;
    config.coreUser = coreCreds.coreUser;
    config.corePassword = coreCreds.corePass;

    console.log('\n  \x1b[36mℹ Connecting to Core machine...\x1b[0m');

    try {
        await testConnection(config.coreHost, config.coreUser, config.corePassword);
        printSuccess(`Connected to ${config.coreHost}`);
    } catch (err) {
        printError(err.message);
        printWarn('Please check your credentials and host address.');
        await inquirer.prompt([{ type: 'input', name: 'cont', message: '  Press Enter to restart...' }]);
        return { config: null, action: null, isNewConfig: false };
    }

    if (mode === 'split') {
        console.log('\n  \x1b[1m=== Step 3: DU Machine SSH ===\x1b[0m\n');

        const duCreds = await inquirer.prompt([
            { type: 'input', name: 'duHost', message: '  Host (IP or hostname):', default: savedConfig?.duHost || '' },
            { type: 'input', name: 'duUser', message: '  Username:', default: savedConfig?.duUser || '' },
            { type: 'password', name: 'duPass', message: '  Password:', mask: '*' }
        ]);

        if (!duCreds.duHost || !duCreds.duUser || !duCreds.duPass) {
            printError('All fields are required!');
            await inquirer.prompt([{ type: 'input', name: 'cont', message: '  Press Enter to restart...' }]);
            return { config: null, action: null, isNewConfig: false };
        }

        config.duHost = duCreds.duHost;
        config.duUser = duCreds.duUser;
        config.duPassword = duCreds.duPass;

        console.log('\n  \x1b[36mℹ Connecting to DU machine...\x1b[0m');

        try {
            await testConnection(config.duHost, config.duUser, config.duPassword);
            printSuccess(`Connected to ${config.duHost}`);
        } catch (err) {
            printError(err.message);
            printWarn('Please check your credentials and host address.');
            await inquirer.prompt([{ type: 'input', name: 'cont', message: '  Press Enter to restart...' }]);
            return { config: null, action: null, isNewConfig: false };
        }
    }

    console.log('\n  \x1b[1m=== Step 4: Core Path ===\x1b[0m\n');

    const { corePath } = await inquirer.prompt([
        { type: 'input', name: 'corePath', message: '  5G Core path:', default: savedConfig?.corePath || DEFAULT_CORE_PATH }
    ]);

    config.corePath = corePath;

    console.log('\n  \x1b[1m=== Step 5: RAN Path ===\x1b[0m\n');

    const { ranPath } = await inquirer.prompt([
        { type: 'input', name: 'ranPath', message: '  RAN path:', default: savedConfig?.ranPath || DEFAULT_RAN_PATH }
    ]);

    config.ranPath = ranPath;

    console.log('\n  \x1b[1m=== Step 6: gNB Config ===\x1b[0m\n');

    const { gnbConfig } = await inquirer.prompt([
        { type: 'input', name: 'gnbConfig', message: '  gNB config file:', default: savedConfig?.gnbConfig || DEFAULT_GNB_CONFIG }
    ]);

    config.gnbConfig = gnbConfig;

    console.log('\n  \x1b[1m=== Step 7: Network IDs ===\x1b[0m\n');

    const { plmn, imsi } = await inquirer.prompt([
        { type: 'input', name: 'plmn', message: '  PLMN:', default: savedConfig?.plmn || '001/01' },
        { type: 'input', name: 'imsi', message: '  UE IMSI:', default: savedConfig?.imsi || '001010000059449' }
    ]);

    config.plmn = plmn;
    config.imsi = imsi;

    console.log('\n  \x1b[1m=== Configuration Summary ===\x1b[0m');
    console.log('  ─────────────────────────────────────');
    console.log(`  Mode:       ${mode === 'monolithic' ? 'Monolithic' : 'CU/DU Split'}`);
    console.log(`  Core:       ${config.coreHost} (${config.coreUser})`);
    if (mode === 'split') {
        console.log(`  DU:         ${config.duHost} (${config.duUser})`);
    }
    console.log(`  Core Path:  ${config.corePath}`);
    console.log(`  RAN Path:   ${config.ranPath}`);
    console.log(`  gNB Config: ${config.gnbConfig}`);
    console.log(`  PLMN:       ${config.plmn}`);
    console.log('  ─────────────────────────────────────\n');

    const { saveAndContinue } = await inquirer.prompt([
        { type: 'confirm', name: 'saveAndContinue', message: 'Save and continue?', default: true }
    ]);

    if (saveAndContinue) {
        if (saveConfig(config)) {
            printSuccess('Configuration saved!');
        }
    }

    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
                { name: 'Start Network', value: 'start' },
                { name: 'Stop Network', value: 'stop' },
                { name: 'Restart Network', value: 'restart' },
                { name: 'Check Status', value: 'status' },
                { name: 'Change Emergency Message', value: 'emergency' },
                { name: 'Edit Configuration', value: 'edit' },
                { name: 'Exit', value: 'exit' }
            ]
        }
    ]);

    return { config, action, isNewConfig: true };
}

async function runFullStartup(config) {
    console.clear();
    const isSplit = config.mode === 'split';
    const archLabel = isSplit ? 'CU/DU Split' : 'Monolithic';
    printHeader(`5G Network Startup (${archLabel})`);

    const { mode, coreHost, coreUser, corePassword, corePath, duHost, duUser, duPassword, ranPath, gnbConfig, imsi } = config;

    const fullCorePath = expandHomePath(corePath, coreUser);
    const fullRanPath = expandHomePath(ranPath, coreUser);
    const coreComposePath = fullCorePath;
    const ranBuildPath = `${fullRanPath}/cmake_targets/ran_build/build`;
    const gnbConfigBasePath = `${fullRanPath}/targets/PROJECTS/GENERIC-NR-5GC/CONF`;
    const sib8Path = `${fullRanPath}/sib8.conf`;

    try {
        printInfo(`Connecting to ${coreHost}...`);
        await sshExec('echo "connected"', coreHost, coreUser, corePassword);
        printSuccess('Connected to Core machine!\n');

        const totalSteps = isSplit ? 8 : 7;
        let step = 1;

        printStep(step, totalSteps, 'Detect USRP USB');
        step++;
        printInfo('Scanning for USRP devices...');

        let usrpCheck;
        let hasDevice = false;

        try {
            usrpCheck = await sshExec('sudo uhd_find_devices', coreHost, coreUser, corePassword);
            hasDevice = usrpCheck.combined.includes('type') || usrpCheck.combined.includes('B') || usrpCheck.combined.includes('Mboards');
        } catch (e) {
            printInfo('Initial USRP check failed, trying reset...');
        }

        if (!hasDevice) {
            printInfo('Resetting USRP USB device...');
            try {
                await sshExec(
                    'echo "2-6" | sudo tee /sys/bus/usb/drivers/usb/unbind > /dev/null && sleep 2 && echo "2-6" | sudo tee /sys/bus/usb/drivers/usb/bind > /dev/null && sleep 3',
                    coreHost, coreUser, corePassword
                );
                await sleep(1000);
                printSuccess('USB reset complete, rescanning...');

                try {
                    usrpCheck = await sshExec('sudo uhd_find_devices', coreHost, coreUser, corePassword);
                    hasDevice = usrpCheck.combined.includes('type') || usrpCheck.combined.includes('B') || usrpCheck.combined.includes('Mboards');
                } catch (e) {
                    printInfo('USRP still not detected after reset');
                }
            } catch (resetErr) {
                printInfo('USB reset failed: ' + resetErr.message);
            }
        }

        if (hasDevice) {
            printSuccess('USRP detected:');
            usrpCheck.combined.split('\n').filter(Boolean).forEach(l => {
                console.log(`    \x1b[90m${l.trim()}\x1b[0m`);
            });
        } else {
            printError('No USRP device found!');
            printWarn('Please connect USRP B210 and restart.');
            await inquirer.prompt([{ type: 'input', name: 'cont', message: '  Press Enter to exit...' }]);
            return 'menu';
        }

        printStep(step, totalSteps, 'Start 5G Core Network');
        step++;
        printInfo('Stopping any existing containers...');
        try {
            await sshExec(`cd "${coreComposePath}" && docker compose down --remove-orphans 2>&1 || true`, coreHost, coreUser, corePassword, 30000);
        } catch (e) {
            printInfo('Stop issue (continuing): ' + e.message);
        }
        await sleep(2000);

        printInfo('Starting Docker containers...');
        try {
            await sshExec(`cd "${coreComposePath}" && docker compose up -d`, coreHost, coreUser, corePassword, 60000);
            printSuccess('Core containers starting...');
        } catch (e) {
            throw new Error('Failed to start containers: ' + e.message);
        }

        printInfo('Waiting 15s for containers to initialize...');
        await sleep(15000);

        printInfo('Checking container status...');
        try {
            const containers = await sshExec(`docker ps --format "{{.Names}}: {{.Status}}" | grep -E "oai-|mysql"`, coreHost, coreUser, corePassword);
            if (containers.combined.trim()) {
                containers.combined.split('\n').filter(Boolean).forEach(c => {
                    console.log(`    \x1b[90m${c.trim()}\x1b[0m`);
                });
            }
        } catch (e) {
            printInfo('Container check: ' + e.message);
        }

        printStep(step, totalSteps, 'Start gNB (nr-softmodem)');
        step++;
        printInfo('Stopping any existing nr-softmodem...');
        try {
            await sshExec('sudo pkill -9 -f nr-softmodem 2>/dev/null || true', coreHost, coreUser, corePassword);
        } catch (e) {
            printInfo('Stop issue (continuing): ' + e.message);
        }
        await sleep(2000);

        printInfo('Starting gNB...');
        const gnbLogFile = '/tmp/gnb-tui.log';

        await sshExec(
            `cat > /tmp/run-gnb.sh << 'EOFSCRIPT' && chmod +x /tmp/run-gnb.sh && bash /tmp/run-gnb.sh &
cd "${ranBuildPath}"
nohup sudo ./nr-softmodem -O "${gnbConfigBasePath}/${gnbConfig}" -E --continuous-tx > ${gnbLogFile} 2>&1 &
EOFSCRIPT`,
            coreHost, coreUser, corePassword
        );

        printInfo('Waiting 15s for gNB to initialize...');
        await sleep(15000);

        printStep(step, totalSteps, 'Verify gNB Connection');
        step++;

        printInfo('Checking gNB status...');
        try {
            const gnbCheck = await sshExec('ps aux | grep nr-softmodem | grep -v grep | wc -l', coreHost, coreUser, corePassword);
            if (gnbCheck.combined.includes('4') || gnbCheck.combined.includes('3')) {
                printSuccess('gNB process running');
            } else {
                printWarn('Unexpected process count: ' + gnbCheck.combined.trim());
            }
        } catch (e) {
            printInfo('gNB check: ' + e.message);
        }

        printInfo('Checking gNB log (Frame.Slot)...');
        try {
            const gnbLog = await sshExec(`tail -20 ${gnbLogFile} 2>/dev/null || echo "No log"`, coreHost, coreUser, corePassword);
            if (gnbLog.combined.includes('Frame.Slot')) {
                printSuccess('gNB transmitting (Frame.Slot detected)');
            } else if (gnbLog.combined.trim() && !gnbLog.combined.includes('No log')) {
                console.log(`  \x1b[90m${gnbLog.combined.trim()}\x1b[0m`);
            }
        } catch (e) {
            printInfo('Log check: ' + e.message);
        }

        printInfo('Checking AMF connection...');
        try {
            const amfCheck = await sshExec('docker logs oai-amf 2>&1 | grep Connected | tail -1', coreHost, coreUser, corePassword);
            if (amfCheck.combined.includes('Connected')) {
                printSuccess('gNB Connected to AMF');
            } else {
                printWarn('gNB may not be connected to AMF');
            }
        } catch (e) {
            printInfo('AMF check: ' + e.message);
        }

        if (isSplit && duHost) {
            printStep(step, totalSteps, 'Start DU Components');
            step++;
            printInfo(`Connecting to DU host ${duHost}...`);
            try {
                await testConnection(duHost, duUser, duPassword);
                printSuccess(`Connected to DU`);
            } catch (e) {
                throw new Error(`Cannot connect to DU (${duHost}): ${e.message}`);
            }
            printInfo('Stopping any existing DU processes...');
            try {
                await sshExec('sudo pkill -9 -f nr-softmodem 2>/dev/null || true', duHost, duUser, duPassword);
                await sleep(1000);
            } catch (e) {
                printInfo('DU stop: ' + e.message);
            }
            printInfo('Starting DU nr-softmodem...');
            const duCmd = `cd "${ranBuildPath}" && nohup sudo ./nr-softmodem -O "${gnbConfigBasePath}/${gnbConfig}" -E --continuous-tx > /tmp/gnb-du.log 2>&1 &`;
            await sshExecBg(duCmd, duHost, duUser, duPassword);
            printInfo('Waiting for DU to initialize (10s)...');
            await sleep(10000);
        }

        printStep(step, totalSteps, 'Connect UE (Nothing Phone)');
        step++;
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

        printStep(step, totalSteps, 'Verify UE Registration');
        if (ueDone) {
            await sleep(3000);
            try {
                const ue = await sshExec('docker logs oai-amf 2>&1 | grep "UEs" | tail -1', coreHost, coreUser, corePassword);
                if (ue.combined.trim() && !ue.combined.includes('|')) {
                    printSuccess('UE Status: ' + ue.combined.trim());
                } else if (ue.combined.includes('|')) {
                    printInfo('AMF shows table but no UEs registered');
                }

                const ueCount = await sshExec('docker logs oai-amf 2>&1 | grep -c "REGISTERED\\|5GMM" || echo "0"', coreHost, coreUser, corePassword);
                if (ueCount.combined.includes('0')) {
                    printWarn('No registered UEs found in AMF logs');
                }

                printInfo('Checking for IMSI ' + imsi + ' in AMF...');
                const ueImsi = await sshExec(`docker logs oai-amf 2>&1 | grep "${imsi}" | tail -5`, coreHost, coreUser, corePassword);
                if (ueImsi.combined.trim()) {
                    printSuccess('UE IMSI found in AMF:');
                    ueImsi.combined.split('\n').filter(Boolean).forEach(l => console.log(`    \x1b[90m${l.trim()}\x1b[0m`));
                } else {
                    printInfo('UE IMSI not found - phone may not be registered');
                }
            } catch (e) {
                printInfo('UE check: ' + e.message);
            }
        }

        console.log('\n');
        printSuccess('Startup sequence completed!\n');

    } catch (err) {
        console.log('\n');
        printError(`FAILED: ${err.message}`);
        printWarn('Please fix the issue and restart the startup sequence.');
        await inquirer.prompt([{ type: 'input', name: 'cont', message: '  Press Enter to return to main menu...' }]);
        return 'menu';
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

    const { mode, coreHost, coreUser, corePassword, duHost, duUser, duPassword } = config;

    try {
        printInfo(`Connecting to ${coreHost}...`);
        await sshExec('echo "ok"', coreHost, coreUser, corePassword);
        printSuccess('Connected\n');

        console.log('  \x1b[1mCore Containers\x1b[0m');
        console.log('  ' + '─'.repeat(50));
        const containers = await sshExec('docker ps --format "{{.Names}}: {{.Status}}"', coreHost, coreUser, corePassword);
        containers.combined.split('\n').filter(Boolean).forEach(c => {
            const ok = c.includes('Up');
            console.log(`    ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${c}`);
        });

        console.log('\n  \x1b[1mgNB Process\x1b[0m');
        console.log('  ' + '─'.repeat(50));
        const gnb = await sshExec('ps aux | grep nr-softmodem | grep -v grep', coreHost, coreUser, corePassword);
        if (gnb.combined.trim()) {
            console.log('    \x1b[32m✓ Running on Core\x1b[0m');
        } else {
            console.log('    \x1b[31m✗ Not running on Core\x1b[0m');
        }

        if (mode === 'split' && duHost) {
            console.log('\n  \x1b[1mDU Process\x1b[0m');
            console.log('  ' + '─'.repeat(50));
            try {
                await testConnection(duHost, duUser, duPassword);
                const duGnb = await sshExec('ps aux | grep nr-softmodem | grep -v grep', duHost, duUser, duPassword);
                if (duGnb.combined.trim()) {
                    console.log('    \x1b[32m✓ Running on DU\x1b[0m');
                } else {
                    console.log('    \x1b[33m✗ Not running on DU\x1b[0m');
                }
            } catch {
                console.log('    \x1b[31m✗ Cannot connect to DU host\x1b[0m');
            }
        }

        console.log('\n  \x1b[1mUE Status\x1b[0m');
        console.log('  ' + '─'.repeat(50));
        try {
            const ue = await sshExec('docker logs oai-amf 2>&1 | grep "UEs" | tail -1', coreHost, coreUser, corePassword);
            if (ue.combined.trim()) {
                console.log(`    \x1b[32m${ue.combined.trim()}\x1b[0m`);
            } else {
                console.log('    \x1b[33mNo UEs connected\x1b[0m');
            }
        } catch {
            console.log('    \x1b[33mCannot check UE status\x1b[0m');
        }

        console.log('\n');

    } catch (err) {
        printError(`Connection failed: ${err.message}`);
    }

    await inquirer.prompt([{ type: 'input', name: 'cont', message: 'Press Enter to continue...' }]);
}

async function stopNetwork(config) {
    printHeader('Stop Network');

    const { mode, coreHost, coreUser, corePassword, corePath, ranPath, duHost, duUser, duPassword } = config;

    const fullCorePath = expandHomePath(corePath, coreUser);
    const fullRanPath = expandHomePath(ranPath, coreUser);
    const coreComposePath = fullCorePath;

    try {
        printInfo('Stopping gNB on core...');
        await sshExec('pkill -9 nr-softmodem 2>/dev/null || true', coreHost, coreUser, corePassword, 15000);
        printSuccess('gNB stopped on core');

        if (mode === 'split' && duHost) {
            printInfo('Stopping DU...');
            try {
                await sshExec('pkill -9 nr-softmodem 2>/dev/null || true', duHost, duUser, duPassword, 15000);
                printSuccess('DU stopped');
            } catch (e) {
                printInfo('DU stop: ' + e.message);
            }
        }

        printInfo('Stopping core containers...');
        try {
            await sshExec(`cd "${coreComposePath}" && docker compose down --remove-orphans 2>&1 || true`, coreHost, coreUser, corePassword, 30000);
            printSuccess('Core network stopped');
        } catch (e) {
            printInfo('Core stop: ' + e.message);
        }

        console.log('\n');
        printSuccess('Network stopped!\n');

    } catch (err) {
        printError(`Error: ${err.message}`);
    }

    await inquirer.prompt([{ type: 'input', name: 'cont', message: 'Press Enter to continue...' }]);
}

async function restartNetwork(config) {
    printHeader('Restart Network');

    const { mode, coreHost, coreUser, corePassword, corePath, ranPath, gnbConfig, duHost, duUser, duPassword } = config;

    const fullCorePath = expandHomePath(corePath, coreUser);
    const fullRanPath = expandHomePath(ranPath, coreUser);
    const coreComposePath = fullCorePath;
    const ranBuildPath = `${fullRanPath}/cmake_targets/ran_build/build`;
    const gnbConfigBasePath = `${fullRanPath}/targets/PROJECTS/GENERIC-NR-5GC/CONF`;

    try {
        printInfo('Stopping existing services...');
        await sshExec('pkill -9 nr-softmodem 2>/dev/null || true', coreHost, coreUser, corePassword, 15000);
        await sshExec(`cd "${coreComposePath}" && docker compose down --remove-orphans 2>&1 || true`, coreHost, coreUser, corePassword, 30000);
        printSuccess('Stopped\n');

        printInfo('Starting core network...');
        await sshExec(`cd "${coreComposePath}" && docker compose up -d`, coreHost, coreUser, corePassword, 30000);
        await sleep(8000);
        printSuccess('Core started\n');

        if (mode === 'split' && duHost) {
            printInfo(`Starting DU on ${duHost}...`);
            try {
                await sshExecBg(
                    `cd "${ranBuildPath}" && nohup sudo ./nr-softmodem -O "${gnbConfigBasePath}/${gnbConfig}" -E --continuous-tx > /tmp/gnb.log 2>&1 &`,
                    duHost, duUser, duPassword
                );
                printSuccess('DU started\n');
            } catch (e) {
                printInfo('DU start: ' + e.message);
            }
        }

        printInfo('Starting gNB...');
        try {
            const gnbCmd = `cd "${ranBuildPath}" && nohup sudo ./nr-softmodem -O "${gnbConfigBasePath}/${gnbConfig}" -E --continuous-tx > /tmp/gnb.log 2>&1 &`;
            await sshExecBg(gnbCmd, coreHost, coreUser, corePassword);
        } catch (e) {
            printInfo('gNB start: ' + e.message);
        }
        printSuccess('gNB started\n');

        printSuccess('Network restarted!\n');

    } catch (err) {
        printError(`Error: ${err.message}`);
    }

    await inquirer.prompt([{ type: 'input', name: 'cont', message: 'Press Enter to continue...' }]);
}

async function changeEmergencyMessage(config) {
    console.clear();
    printHeader('Change Emergency Message');

    const { coreHost, coreUser, corePassword, ranPath, gnbConfig } = config;

    const fullRanPath = expandHomePath(ranPath, coreUser);
    const sib8Path = `${fullRanPath}/sib8.conf`;
    const gnbConfigBasePath = `${fullRanPath}/targets/PROJECTS/GENERIC-NR-5GC/CONF`;
    const ranBuildPath = `${fullRanPath}/cmake_targets/ran_build/build`;

    try {
        printInfo(`Fetching current message from ${coreHost}...`);

        const current = await sshExec(`cat "${sib8Path}"`, coreHost, coreUser, corePassword);
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
        const cmd = `sed -i "s/^text=.*;/text=${escapedMsg};/" "${sib8Path}"`;

        await sshExec(cmd, coreHost, coreUser, corePassword);

        const verify = await sshExec(`cat "${sib8Path}" | grep text=`, coreHost, coreUser, corePassword);
        printSuccess('Message updated!');
        console.log(`  New message: "${verify.combined.match(/text=([^;]+)/)?.[1] || newMessage.trim()}"`);

        const { restart } = await inquirer.prompt([
            { type: 'confirm', name: 'restart', message: 'Restart gNB to apply new message?', default: false }
        ]);

        if (restart) {
            printInfo('Restarting gNB...');
            await sshExec('sudo pkill -9 nr-softmodem 2>/dev/null || true', coreHost, coreUser, corePassword);
            await sleep(2000);
            printInfo('Starting gNB...');
            const gnbCmd = `cd "${ranBuildPath}" && nohup sudo ./nr-softmodem -O "${gnbConfigBasePath}/${gnbConfig}" -E --continuous-tx > /tmp/gnb.log 2>&1 &`;
            await sshExecBg(gnbCmd, coreHost, coreUser, corePassword);
            printSuccess('gNB restart initiated');
        }
    } catch (err) {
        console.log('\n');
        printError(`Error: ${err.message}`);
    }

    await inquirer.prompt([{ type: 'input', name: 'cont', message: 'Press Enter to continue...' }]);
}

async function editConfiguration(config) {
    console.clear();
    printHeader('Edit Configuration');

    const { mode } = config;
    const newConfig = { ...config };

    if (mode === 'monolithic') {
        const updates = await inquirer.prompt([
            { type: 'input', name: 'coreHost', message: 'Core Host:', default: config.coreHost },
            { type: 'input', name: 'coreUser', message: 'Core Username:', default: config.coreUser },
            { type: 'input', name: 'corePath', message: 'Core Path:', default: config.corePath },
            { type: 'input', name: 'ranPath', message: 'RAN Path:', default: config.ranPath },
            { type: 'input', name: 'gnbConfig', message: 'gNB Config:', default: config.gnbConfig },
            { type: 'input', name: 'plmn', message: 'PLMN:', default: config.plmn },
            { type: 'input', name: 'imsi', message: 'UE IMSI:', default: config.imsi }
        ]);
        Object.assign(newConfig, updates);
    } else {
        const updates = await inquirer.prompt([
            { type: 'input', name: 'coreHost', message: 'Core Host:', default: config.coreHost },
            { type: 'input', name: 'coreUser', message: 'Core Username:', default: config.coreUser },
            { type: 'input', name: 'duHost', message: 'DU Host:', default: config.duHost },
            { type: 'input', name: 'duUser', message: 'DU Username:', default: config.duUser },
            { type: 'input', name: 'corePath', message: 'Core Path:', default: config.corePath },
            { type: 'input', name: 'ranPath', message: 'RAN Path:', default: config.ranPath },
            { type: 'input', name: 'gnbConfig', message: 'gNB Config:', default: config.gnbConfig },
            { type: 'input', name: 'plmn', message: 'PLMN:', default: config.plmn },
            { type: 'input', name: 'imsi', message: 'UE IMSI:', default: config.imsi }
        ]);
        Object.assign(newConfig, updates);
    }

    console.log('\n  \x1b[1m=== Updated Configuration ===\x1b[0m');
    console.log('  ─────────────────────────────────────');
    console.log(`  Mode:       ${newConfig.mode}`);
    console.log(`  Core:       ${newConfig.coreHost} (${newConfig.coreUser})`);
    if (newConfig.mode === 'split') {
        console.log(`  DU:         ${newConfig.duHost} (${newConfig.duUser})`);
    }
    console.log('  ─────────────────────────────────────\n');

    const { saveChanges } = await inquirer.prompt([
        { type: 'confirm', name: 'saveChanges', message: 'Save changes?', default: true }
    ]);

    if (saveChanges) {
        if (saveConfig(newConfig)) {
            printSuccess('Configuration updated!');
            Object.assign(config, newConfig);
        } else {
            printError('Failed to save configuration');
        }
    }

    await inquirer.prompt([{ type: 'input', name: 'cont', message: 'Press Enter to continue...' }]);
}

async function main() {
    let running = true;

    while (running) {
        try {
            let { config, action, isNewConfig } = await onboarding();

            if (!config) {
                printInfo('Restarting configuration...');
                continue;
            }

            if (action === null && config && !isNewConfig) {
                const { nextAction } = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'nextAction',
                        message: 'What would you like to do?',
                        choices: [
                            { name: 'Start Network', value: 'start' },
                            { name: 'Stop Network', value: 'stop' },
                            { name: 'Restart Network', value: 'restart' },
                            { name: 'Check Status', value: 'status' },
                            { name: 'Change Emergency Message', value: 'emergency' },
                            { name: 'Edit Configuration', value: 'edit' },
                            { name: 'Exit', value: 'exit' }
                        ]
                    }
                ]);
                action = nextAction;
            }

            while (action !== 'exit' && action !== null) {
                switch (action) {
                    case 'start':
                        const result = await runFullStartup(config);
                        if (result === 'exit') {
                            action = 'exit';
                            running = false;
                        } else if (result === 'menu') {
                            action = null;
                        } else if (result === 'status') {
                            await checkStatus(config);
                            action = null;
                        }
                        break;
                    case 'stop':
                        await stopNetwork(config);
                        action = null;
                        break;
                    case 'restart':
                        await restartNetwork(config);
                        action = null;
                        break;
                    case 'status':
                        await checkStatus(config);
                        action = null;
                        break;
                    case 'emergency':
                        await changeEmergencyMessage(config);
                        action = null;
                        break;
                    case 'edit':
                        await editConfiguration(config);
                        action = null;
                        break;
                    default:
                        action = null;
                }

                if (action === null && running) {
                    const { nextAction } = await inquirer.prompt([
                        {
                            type: 'list',
                            name: 'nextAction',
                            message: 'What would you like to do?',
                            choices: [
                                { name: 'Start Network', value: 'start' },
                                { name: 'Stop Network', value: 'stop' },
                                { name: 'Restart Network', value: 'restart' },
                                { name: 'Check Status', value: 'status' },
                                { name: 'Change Emergency Message', value: 'emergency' },
                                { name: 'Edit Configuration', value: 'edit' },
                                { name: 'Exit', value: 'exit' }
                            ]
                        }
                    ]);
                    action = nextAction;
                    if (action === 'exit') running = false;
                }
            }

            if (action === 'exit' || !running) {
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