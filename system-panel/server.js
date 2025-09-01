const express = require('express');
const { exec } = require('child_process');
const os = require('os');
const path = require('path');
const si = require('systeminformation');
const ip = require('ip');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Middleware to restrict access to local requests only.
 */
function allowLocalOnly(req, res, next) {
  const remoteIp = req.ip || req.connection.remoteAddress;

  // Normalize IPv6-mapped IPv4 addresses (e.g., ::ffff:192.168.0.72 -> 192.168.0.72)
  const ipStripped = remoteIp.replace(/^::ffff:/, '');

  // Allow loopback and private IPs
  if (
    ip.isLoopback(ipStripped) || // 127.0.0.1, ::1
    ip.isPrivate(ipStripped)     // 192.168.x.x, 10.x.x.x, etc.
  ) {
    return next();
  }

  console.log(`Denied incoming request from ${remoteIp}`);
  res.status(404).send();
}

/**
 * Serve the admin panel (static files)
 */
const panelPath = path.join(__dirname, 'public', 'panel');
app.use('/panel', allowLocalOnly, express.static(panelPath));

async function getPM2Data() {
  try {
    const pm2 = require('pm2');
    return new Promise((resolve, reject) => {
      pm2.connect(err => {
        if (err) return resolve([]);
        pm2.list((err, processDescriptionList) => {
          pm2.disconnect();
          if (err) return resolve([]);
          resolve(processDescriptionList.map(proc => ({
            name: proc.name,
            pid: proc.pid,
            status: proc.pm2_env.status
          })));
        });
      });
    });
  } catch {
    return [];
  }
}

async function getSystemInfoJSON() {
  const [cpu, temp, mem, disk, osInfo, currentLoad, uptime, pm2Processes] = await Promise.all([
    si.cpu(),
    si.cpuTemperature(),
    si.mem(),
    si.fsSize(),
    si.osInfo(),
    si.currentLoad(),
    si.time(),
    getPM2Data()
  ]);

  return {
    user: os.userInfo().username,
    hostname: os.hostname(),
    ip: ip.address(),
    os: {
      distro: osInfo.distro,
      release: osInfo.release,
      arch: osInfo.arch,
      kernel: osInfo.kernel
    },
    uptime: {
      seconds: uptime.uptime,
      human: `${Math.floor(uptime.uptime / 3600)}h ${Math.floor((uptime.uptime % 3600) / 60)}m`
    },
    shell: os.userInfo().shell || null,
    terminal: process.env.TERM || null,
    cpu: {
      manufacturer: cpu.manufacturer,
      brand: cpu.brand,
      cores: cpu.physicalCores,
      threads: cpu.cores,
      load: currentLoad.avgload,
      temperature: temp.main || null
    },
    memory: {
      total: mem.total,
      used: mem.used
    },
    disks: disk.map(d => ({
      filesystem: d.fs,
      mount: d.mount,
      size: d.size,
      used: d.used,
      usePercent: d.use
    })),
    node: {
      version: process.version,
      cwd: process.cwd(),
      script: __filename
    },
    pm2: pm2Processes
  };
}

app.get('/api/stats2', allowLocalOnly, async (req, res) => {
  try {
    const stats = await getSystemInfoJSON();
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.toString() });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
