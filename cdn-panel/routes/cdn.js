const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const ip = require('ip');

const router = express.Router();

const uploadFolder = path.join(__dirname, '..', 'uploads');
const indexPath = path.join(uploadFolder, 'index.json');

// Ensure upload folder exists
if (!fs.existsSync(uploadFolder)) {
  fs.mkdirSync(uploadFolder, { recursive: true });
}

// Load or initialize the index file (file metadata)
let index = {};
try {
  index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
} catch {
  index = {};
}

// Multer setup: use memory storage to handle file uploads in memory
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB limit per upload

/**
 * Hashes a buffer using SHA1.
 * @param {Buffer} buffer 
 * @returns {string} SHA1 hex digest
 */
function sha1(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

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
 * Saves the current state of the index to disk asynchronously.
 */
function saveIndex() {
  fs.writeFile(indexPath, JSON.stringify(index, null, 2), (err) => {
    if (err) console.error('Failed to save index.json:', err);
  });
}

// ----------- Routes -----------

/**
 * Upload endpoint
 * Accepts a single file and stores it if unique by SHA1 hash.
 */
router.post('/upload', allowLocalOnly, upload.array('file', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).send('No files uploaded');
  }

  const results = [];

  req.files.forEach(file => {
    const { buffer, originalname, size } = file;
    const hash = sha1(buffer);

    if (index[hash]) {
      console.log(`Duplicate upload skipped: ${originalname} (SHA1: ${hash})`);
      results.push({
        status: 'duplicate',
        fileId: hash,
        originalName: index[hash].originalName,
      });
      return;
    }

    const { name: nameWithoutExt, ext } = path.parse(originalname);
    const cleanExt = ext.slice(1).toLowerCase();
    const filename = hash + (cleanExt ? `.${cleanExt}` : '');
    const filePath = path.join(uploadFolder, filename);

    try {
      fs.writeFileSync(filePath, buffer);

      index[hash] = {
        originalName: nameWithoutExt,
        ext: cleanExt,
        size,
        uploadDate: new Date().toISOString(),
        downloads: 0,
      };

      console.log(`File uploaded: ${originalname} -> SHA1: ${hash}, Ext: ${cleanExt}`);

      results.push({
        status: 'uploaded',
        fileId: hash,
        originalName: nameWithoutExt,
      });
    } catch (err) {
      console.error(`Failed to save file ${originalname}:`, err);
      results.push({
        status: 'error',
        originalName: originalname,
        error: 'Failed to save file',
      });
    }
  });

  saveIndex();

  res.status(200).json(results);
});

/**
 * Download endpoint
 * Serves files by their SHA1 hash id.
 */
router.get('/download/:fileId', (req, res) => {
  const { fileId } = req.params;
  const fileEntry = index[fileId];

  if (!fileEntry) {
    return res.status(404).send('File not found');
  }

  const filename = fileId + (fileEntry.ext ? `.${fileEntry.ext}` : '');
  const filePath = path.join(uploadFolder, filename);
  const downloadName = fileEntry.originalName + (fileEntry.ext ? `.${fileEntry.ext}` : '');

  fileEntry.downloads = (fileEntry.downloads || 0) + 1;
  saveIndex();

  res.download(filePath, downloadName, (err) => {
    if (err) console.error('Download error:', err);
  });
});

router.get('/uploads/index.json', allowLocalOnly, (req, res) => {
  const indexPath = path.join(__dirname, '..', 'uploads', 'index.json');

  fs.readFile(indexPath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading index.json:', err);
      return res.status(500).json({ error: 'Could not read index file.' });
    }

    try {
      const parsed = JSON.parse(data);
      res.json(parsed);
    } catch (parseErr) {
      console.error('Invalid JSON in index.json:', parseErr);
      res.status(500).json({ error: 'Invalid index file format.' });
    }
  });
});

router.delete('/delete/:fileId', allowLocalOnly, (req, res) => {
  const fileId = req.params.fileId;

  if (!index[fileId]) {
    return res.status(404).json({ error: 'File not found.' });
  }

  const fileName = `${fileId}.${index[fileId].ext}`;
  const filePath = path.join(__dirname, '..', 'uploads', fileName);

  fs.unlink(filePath, (err) => {
    if (err) {
      console.error('Error deleting file:', err);
      return res.status(500).json({ error: 'Could not delete file.' });
    }

    delete index[fileId];

    fs.writeFile(path.join(__dirname, '..', 'uploads', 'index.json'), JSON.stringify(index, null, 2), (err) => {
      if (err) {
        console.error('Error updating index:', err);
        return res.status(500).json({ error: 'Could not update index file.' });
      }

      return res.status(200).json({ message: 'File deleted successfully.' });
    });
  });
});

/**
 * Serve the admin panel (static files)
 */
const panelPath = path.join(__dirname, '..', 'public', 'panel');
router.use('/panel', allowLocalOnly, express.static(panelPath));

router.get('/panel', allowLocalOnly, (req, res) => {
  res.sendFile(path.join(panelPath, 'index.html'));
});

module.exports = router;
