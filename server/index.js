import { createApp } from './app.js';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });
const app = createApp(path.join(dataDir, 'docs.db'));
const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Ajaia Docs running on http://localhost:${port}`));
