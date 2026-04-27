const fs = require('fs');
const path = require('path');

const serverDir = path.join(process.cwd(), 'dist', 'server');
const clientDir = path.join(process.cwd(), 'dist', 'client');

try {
  const files = fs.readdirSync(serverDir);
  const workerFile = files.find(f => f.startsWith('worker-entry-') && f.endsWith('.js'));

  if (workerFile) {
    const src = path.join(serverDir, workerFile);
    const dest = path.join(clientDir, '_worker.js');
    fs.copyFileSync(src, dest);
    console.log(`Successfully copied ${workerFile} to _worker.js`);
  } else {
    console.error('Could not find worker-entry file in dist/server');
    process.exit(1);
  }
} catch (err) {
  console.error('Error moving worker file:', err);
  process.exit(1);
}
