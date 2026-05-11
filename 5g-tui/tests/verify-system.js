#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const SERBER_USER = 'serber';
const SERBER_PASS = 'root4SERBER';

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

function sshExec(cmd, host, timeout = 30000) {
    return new Promise(async (resolve, reject) => {
        let ip = host;
        if (!ip.match(/^\d+\.\d+\.\d+\.\d+$/)) {
            ip = await resolveHost(host);
            if (!ip) {
                reject(new Error(`Could not resolve ${host}`));
                return;
            }
        }
        const sshCmd = `sshpass -p '${SERBER_PASS}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o UserKnownHostsFile=/dev/null ${SERBER_USER}@${ip} '${cmd}'`;
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

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function log(name, status, message = '') {
    const icon = status === 'pass' ? '✓' : status === 'fail' ? '✗' : 'ℹ';
    const color = status === 'pass' ? GREEN : status === 'fail' ? RED : CYAN;
    console.log(`  ${color}${icon}${RESET} ${name}${message ? ': ' + message : ''}`);
}

async function runTests() {
    console.log('\n  ╔═══════════════════════════════════════════════════════════════╗');
    console.log('  ║       5G Network TUI - System Verification Tests             ║');
    console.log('  ╚═══════════════════════════════════════════════════════════════╝\n');

    let passed = 0;
    let failed = 0;

    console.log(`  ${CYAN}Host Resolution${RESET}`);
    console.log('  ─────────────────────────────────────────────────────────────');

    try {
        const firecellIp = await resolveHost('serber-firecell');
        if (firecellIp) {
            log('serber-firecell resolves', 'pass', firecellIp);
            passed++;
        } else {
            log('serber-firecell resolves', 'fail', 'null');
            failed++;
        }
    } catch (e) {
        log('serber-firecell resolves', 'fail', e.message);
        failed++;
    }

    try {
        const minipcIp = await resolveHost('serber-minipc');
        if (minipcIp) {
            log('serber-minipc resolves', 'pass', minipcIp);
            passed++;
        } else {
            log('serber-minipc resolves', 'fail', 'null');
            failed++;
        }
    } catch (e) {
        log('serber-minipc resolves', 'fail', e.message);
        failed++;
    }

    console.log(`\n  ${CYAN}SSH Connection${RESET}`);
    console.log('  ─────────────────────────────────────────────────────────────');

    try {
        const result = await sshExec('echo "SSH_OK"', 'serber-firecell', 15000);
        if (result.stdout.trim() === 'SSH_OK') {
            log('SSH to serber-firecell', 'pass');
            passed++;
        } else {
            log('SSH to serber-firecell', 'fail', 'Unexpected output');
            failed++;
        }
    } catch (e) {
        log('SSH to serber-firecell', 'fail', e.message);
        failed++;
    }

    try {
        const result = await sshExec('echo "SSH_OK"', 'serber-minipc', 15000);
        if (result.stdout.trim() === 'SSH_OK') {
            log('SSH to serber-minipc', 'pass');
            passed++;
        } else {
            log('SSH to serber-minipc', 'fail', 'Unexpected output');
            failed++;
        }
    } catch (e) {
        log('SSH to serber-minipc', 'fail', e.message);
        failed++;
    }

    console.log(`\n  ${CYAN}Remote Files${RESET}`);
    console.log('  ─────────────────────────────────────────────────────────────');

    try {
        const result = await sshExec('ls ~/openairinterface5g/cmake_targets/ran_build/build/nr-softmodem 2>&1', 'serber-firecell', 10000);
        if (result.combined.includes('nr-softmodem')) {
            log('nr-softmodem binary', 'pass');
            passed++;
        } else {
            log('nr-softmodem binary', 'fail', 'Not found');
            failed++;
        }
    } catch (e) {
        log('nr-softmodem binary', 'fail', e.message);
        failed++;
    }

    try {
        const result = await sshExec('ls ~/oai-cn5g/docker-compose.yaml 2>&1', 'serber-firecell', 10000);
        if (result.combined.includes('docker-compose.yaml')) {
            log('docker-compose.yaml', 'pass');
            passed++;
        } else {
            log('docker-compose.yaml', 'fail', 'Not found');
            failed++;
        }
    } catch (e) {
        log('docker-compose.yaml', 'fail', e.message);
        failed++;
    }

    console.log(`\n  ${CYAN}Docker${RESET}`);
    console.log('  ─────────────────────────────────────────────────────────────');

    try {
        const result = await sshExec('docker ps --format "{{.Names}}" 2>&1 | head -5', 'serber-firecell', 15000);
        const containers = result.combined.trim().split('\n').filter(Boolean);
        log('Docker running', 'pass', `${containers.length} containers`);
        passed++;
        containers.forEach(c => console.log(`    ${c}`));
    } catch (e) {
        log('Docker running', 'fail', e.message);
        failed++;
    }

    console.log(`\n  ${CYAN}USRP${RESET}`);
    console.log('  ─────────────────────────────────────────────────────────────');

    try {
        const result = await sshExec('uhd_find_devices 2>&1', 'serber-firecell', 15000);
        if (result.combined.includes('type') || result.combined.includes('B')) {
            const deviceMatch = result.combined.match(/type:\s*(.+)/);
            log('USRP detected', 'pass', deviceMatch ? deviceMatch[1].trim() : 'B2xx');
            passed++;
        } else {
            log('USRP detected', 'fail', 'No devices found');
            failed++;
        }
    } catch (e) {
        log('USRP detected', 'fail', e.message);
        failed++;
    }

    console.log(`\n  ${CYAN}gNB Status${RESET}`);
    console.log('  ─────────────────────────────────────────────────────────────');

    try {
        const result = await sshExec('ps aux | grep nr-softmodem | grep -v grep', 'serber-firecell', 10000);
        if (result.combined.includes('nr-softmodem')) {
            const pidMatch = result.combined.match(/^\S+\s+(\d+)/);
            log('gNB running', 'pass', pidMatch ? `PID ${pidMatch[1]}` : '');
            passed++;
        } else {
            log('gNB running', 'fail', 'Not running');
            failed++;
        }
    } catch (e) {
        log('gNB running', 'fail', e.message);
        failed++;
    }

    console.log('\n  ════════════════════════════════════════════════════════════════');
    console.log(`  Results: ${GREEN}${passed} passed${RESET} | ${failed > 0 ? RED : GREEN}${failed} failed${RESET}`);
    console.log('  ════════════════════════════════════════════════════════════════\n');

    if (failed === 0) {
        console.log(`  ${GREEN}All systems operational! Ready to run TUI.${RESET}\n`);
    } else {
        console.log(`  ${YELLOW}Some checks failed. TUI may have issues.${RESET}\n`);
    }

    return { passed, failed };
}

runTests().catch(e => {
    console.error('Test runner error:', e);
    process.exit(1);
});