/**
 * 翻译词书 JSON 文件中所有空 zh 的例句
 * 用法: node cmd/translate_examples.js [json文件路径]
 *
 * 不指定文件则处理 data/wordbooks/ 下所有 JSON
 * 特性: HTTP 代理 + 并发控制 + 指数退避重试 + 断点续传
 */

const fs = require('fs');
const path = require('path');
const http = require('node:http');
const https = require('node:https');
const tls = require('node:tls');

const CONCURRENCY = 20;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const AUTO_SAVE_INTERVAL = 50;

const PROXY = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || 'http://127.0.0.1:2080';
const proxy = new URL(PROXY);

// ---------- HTTPS 代理隧道 (CONNECT) ----------

function connectProxy(host, port) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: proxy.hostname,
      port: proxy.port,
      method: 'CONNECT',
      path: `${host}:${port}`,
    });
    req.on('connect', (_, socket) => resolve(socket));
    req.on('error', reject);
    req.end();
  });
}

function proxyFetch(urlStr) {
  return new Promise((resolve, reject) => {
    const target = new URL(urlStr);

    connectProxy(target.hostname, target.port || 443)
      .then((socket) => {
        const tlsSocket = tls.connect({
          socket,
          servername: target.hostname,
        });

        const req = https.request({
          host: target.hostname,
          path: target.pathname + target.search,
          method: 'GET',
          createConnection: () => tlsSocket,
        }, (res) => {
          let body = '';
          res.on('data', c => body += c);
          res.on('end', () => {
            tlsSocket.destroy();
            resolve({
              status: res.statusCode,
              json: () => JSON.parse(body),
            });
          });
        });

        req.on('error', (err) => { tlsSocket.destroy(); reject(err); });
        req.end();
      })
      .catch(reject);
  });
}

// ---------- 翻译 ----------

async function translate(text) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
  const res = await proxyFetch(url);
  if (res.status === 429) {
    const err = new Error('Rate limited (429)');
    err.retryable = true;
    throw err;
  }
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const data = res.json();
  if (!data || !data[0]) throw new Error('Empty response');
  return data[0].map(seg => seg[0]).join('');
}

async function translateWithRetry(text, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await translate(text);
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }
}

// ---------- 并发控制 (信号量) ----------

function createSemaphore(max) {
  let active = 0;
  const queue = [];

  function tryNext() {
    if (active < max && queue.length > 0) {
      active++;
      const { fn, resolve, reject } = queue.shift();
      fn().then(resolve, reject).finally(() => {
        active--;
        tryNext();
      });
    }
  }

  return function acquire(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      tryNext();
    });
  };
}

// ---------- 工具 ----------

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ---------- 主逻辑 ----------

async function processFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const book = JSON.parse(raw);
  const fileName = path.basename(filePath);

  let total = 0;
  let translated = 0;
  let failed = 0;

  const jobs = [];
  for (const unit of book.units) {
    for (const entry of unit.entries) {
      if (!entry.examples || !Array.isArray(entry.examples)) continue;
      for (const ex of entry.examples) {
        if (ex.en && !ex.zh) {
          jobs.push(ex);
          total++;
        }
      }
    }
  }

  if (total === 0) {
    console.log(`  ${fileName}: 无需翻译`);
    return;
  }

  console.log(`  ${fileName}: ${total} 条例句待翻译 (并发 ${CONCURRENCY}, 重试 ${MAX_RETRIES} 次)`);

  const sem = createSemaphore(CONCURRENCY);
  let sinceLastSave = 0;

  function autoSave() {
    fs.writeFileSync(filePath, JSON.stringify(book, null, 2), 'utf8');
  }

  const tasks = jobs.map((ex) =>
    sem(async () => {
      try {
        ex.zh = await translateWithRetry(ex.en);
        translated++;
      } catch (err) {
        failed++;
        console.error(`\n    ✗ "${ex.en.slice(0, 50)}" — ${err.message}`);
      }

      sinceLastSave++;
      const done = translated + failed;
      process.stdout.write(`\r    进度: ${done}/${total}  ✓${translated}  ✗${failed}`);

      if (sinceLastSave >= AUTO_SAVE_INTERVAL) {
        autoSave();
        sinceLastSave = 0;
      }
    })
  );

  await Promise.all(tasks);

  console.log(`\n    ✓ 完成: ${translated} 成功, ${failed} 失败`);
  autoSave();
  console.log(`    ✓ 已保存 ${fileName}`);
}

async function main() {
  const args = process.argv.slice(2);
  let files;

  if (args.length > 0) {
    files = args.map(f => path.resolve(f));
  } else {
    const dir = path.join(__dirname, '..', 'data', 'wordbooks');
    files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.json') && !f.startsWith('_'))
      .map(f => path.join(dir, f));
  }

  console.log(`处理 ${files.length} 个文件... (代理: ${PROXY})`);
  for (const f of files) {
    await processFile(f);
  }
  console.log('全部完成');
}

main().catch(err => {
  console.error('错误:', err);
  process.exit(1);
});
