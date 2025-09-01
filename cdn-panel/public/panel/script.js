const fileInput = document.getElementById('fileElem');
const uploadBtn = document.getElementById('uploadBtn');
const dropArea = document.getElementById('drop-area');
const progress = document.getElementById('progress');
const progressBar = document.getElementById('progress-bar');

dropArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropArea.style.backgroundColor = '#e2e8f0';
});

dropArea.addEventListener('dragleave', () => {
  dropArea.style.backgroundColor = '#f9fafb';
});

function updateDropAreaText(status = null) {
  const files = fileInput.files;
  const p = dropArea.querySelector('p');
  const fileSizeInfo = document.getElementById('file-size-info');

  if (files.length === 0) {
    p.textContent = 'Click or drag files here';
    fileSizeInfo.textContent = 'Uploads up to 500MB';
    return;
  }

  const names = Array.from(files).map(f => f.name).join(', ');
  const totalSizeBytes = Array.from(files).reduce((acc, f) => acc + f.size, 0);
  const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(1);
  const maxMB = 500;
  fileSizeInfo.textContent = `${bytesToSize(totalSizeBytes)} / ${maxMB}MB`;

  const fullText = status ? `${names} — ${status}` : names;
  p.textContent = fullText;

  requestAnimationFrame(() => {
    if (p.scrollHeight > p.clientHeight) {
      const summaryText = `${files.length} file${files.length > 1 ? 's' : ''}${status ? ` — ${status}` : ''}`;
      p.textContent = summaryText;
    }
  });
}

fileInput.addEventListener('change', () => {
  updateDropAreaText('Ready');
});

dropArea.addEventListener('drop', (e) => {
  e.preventDefault();
  dropArea.style.backgroundColor = '#f9fafb';
  fileInput.files = e.dataTransfer.files;
  updateDropAreaText('Ready');
});

uploadBtn.addEventListener('click', () => {
  const files = fileInput.files;
  if (!files || files.length === 0) {
    alert('Please select at least one file.');
    return;
  }

  const maxTotalSize = 500 * 1024 * 1024; // 500MB total
  let totalSize = 0;

  for (const file of files) {
    totalSize += file.size;
  }

  if (totalSize > maxTotalSize) {
    alert('Total upload size exceeds 500MB limit.');
    return;
  }

  const formData = new FormData();
  for (const file of files) {
    formData.append('file', file);
  }

  const xhr = new XMLHttpRequest();
  xhr.open('POST', `/cdn/upload`, true);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const percent = (e.loaded / e.total) * 100;
      progress.style.display = 'block';
      progressBar.style.width = percent + '%';
      updateDropAreaText(`${percent.toFixed(0)}%`);
    }
  };

  xhr.onload = () => {
    uploadBtn.disabled = false;
    progressBar.style.width = '0%';
    progress.style.display = 'none';

    if (xhr.status === 200) {
      const responses = JSON.parse(xhr.responseText);
      updateDropAreaText('Uploaded');

      const downloadLinkDiv = document.getElementById('download-link');
      downloadLinkDiv.style.display = 'block';

      responses.forEach(response => {
        if (response.status === 'uploaded' || response.status === 'duplicate') {
          const exists = downloadLinkDiv.querySelector(`a[href="/cdn/download/${response.fileId}"]`);
          if (!exists) {
            const newLink = document.createElement('a');
            newLink.href = `/cdn/download/${response.fileId}`;
            newLink.textContent = `Download ${response.originalName}`;
            newLink.style.display = 'block';
            newLink.style.marginTop = '8px';
            downloadLinkDiv.appendChild(newLink);
          }
        }
      });

      renderFileListing();

      setTimeout(() => {
        fileInput.value = '';
        updateDropAreaText();
      }, 7500);
    } else {
      updateDropAreaText();
      alert('Upload failed!');
    }
  };

  xhr.onerror = () => {
    uploadBtn.disabled = false;
    updateDropAreaText();
    alert('Upload error!');
  };

  uploadBtn.disabled = true;
  updateDropAreaText('Uploading...');
  progressBar.style.width = '0%';
  progress.style.display = 'block';

  xhr.send(formData);
});

window.addEventListener('DOMContentLoaded', renderFileListing);

function bytesToSize(bytes) {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Byte';
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
}

function renderFileListing() {
  fetch('/cdn/uploads/index.json')
    .then((res) => res.json())
    .then((data) => {
      const container = document.querySelector('.listing-container');
      const uploadContainer = document.querySelector('.upload-container');

      if (!data || Object.keys(data).length === 0) {
        // Hide listing container
        container.style.display = 'none';

        // Center upload container on screen
        uploadContainer.style.position = 'absolute';
        uploadContainer.style.top = '50%';
        uploadContainer.style.left = '50%';
        uploadContainer.style.transform = 'translate(-50%, -50%)';
        uploadContainer.style.margin = '0'; // Remove default margins for centering

        return;
      }

      // Show listing container & reset upload container styles
      container.style.display = 'block';
      uploadContainer.style.position = '';
      uploadContainer.style.top = '';
      uploadContainer.style.left = '';
      uploadContainer.style.transform = '';
      uploadContainer.style.margin = '0 1rem';

      container.innerHTML = '<h3>Available Downloads</h3>';

      Object.entries(data).forEach(([fileId, file]) => {
        const card = document.createElement('div');
        card.style.position = 'relative';  // For positioning the X button
        card.style.margin = '1rem 0';
        card.style.padding = '1rem';
        card.style.border = '1px solid #e2e8f0';
        card.style.borderRadius = '0.5rem';
        card.style.background = '#f9fafb';

        const name = `${file.originalName}.${file.ext}`;
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        const date = new Date(file.uploadDate).toLocaleString();

        const link = document.createElement('a');
        link.href = `/cdn/download/${fileId}`;
        link.textContent = `⬇ ${name}`;
        link.style.color = '#3182ce';
        link.style.textDecoration = 'none';
        link.style.fontWeight = '600';
        link.style.display = 'block';
        link.style.marginBottom = '0.5rem';

        const info = document.createElement('p');
        info.textContent = `Size: ${sizeMB} MB | Uploaded: ${date}`;
        info.style.margin = 0;
        info.style.fontSize = '0.9rem';
        info.style.color = '#4a5568';

        // Small X button
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '×'; // Unicode multiplication sign looks better for X
        deleteBtn.setAttribute('aria-label', `Delete ${name}`);
        deleteBtn.style.position = 'absolute';
        deleteBtn.style.top = '8px';
        deleteBtn.style.right = '8px';
        deleteBtn.style.background = 'transparent';
        deleteBtn.style.border = 'none';
        deleteBtn.style.color = '#a0aec0'; // Light gray
        deleteBtn.style.fontSize = '1.25rem';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.padding = '0';
        deleteBtn.style.lineHeight = '1';
        deleteBtn.style.width = '1.5rem';
        deleteBtn.style.height = '1.5rem';
        deleteBtn.style.borderRadius = '50%';
        deleteBtn.style.transition = 'color 0.2s ease';

        deleteBtn.addEventListener('mouseenter', () => {
          deleteBtn.style.color = '#e53e3e'; // Red on hover
        });
        deleteBtn.addEventListener('mouseleave', () => {
          deleteBtn.style.color = '#a0aec0';
        });

        deleteBtn.addEventListener('click', () => {
          if (confirm(`Are you sure you want to delete "${name}"?`)) {
            fetch(`/cdn/delete/${fileId}`, {
              method: 'DELETE'
            })
            .then((res) => {
              if (res.ok) {
                card.remove();

                // After deletion, re-check if container is empty and update UI accordingly
                if (container.children.length <= 1) { // Only header left or empty
                  container.style.display = 'none';

                  uploadContainer.style.position = 'absolute';
                  uploadContainer.style.top = '50%';
                  uploadContainer.style.left = '50%';
                  uploadContainer.style.transform = 'translate(-50%, -50%)';
                  uploadContainer.style.margin = '0';
                }
              } else {
                alert('Failed to delete file.');
              }
            })
            .catch(() => alert('Delete error.'));
          }
        });

        card.appendChild(deleteBtn);
        card.appendChild(link);
        card.appendChild(info);
        container.appendChild(card);
      });
    })
    .catch((err) => {
      console.error('Error loading files:', err);
      const container = document.querySelector('.listing-container');
      container.innerHTML = '<p>Error loading files.</p>';
    });
}

