import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler } from './handler';
import { Storage } from './storage';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5174;

const server = http.createServer(
  createHandler(new Storage(path.join(WEB, 'data')), path.join(WEB, '..', 'FBA Logos'), {
    allowedHosts: ['127.0.0.1:5174', 'localhost:5174', '127.0.0.1:5173', 'localhost:5173'],
  }),
);
server.listen(PORT, '127.0.0.1', () => console.log(`FBA data server on http://127.0.0.1:${PORT}`));
