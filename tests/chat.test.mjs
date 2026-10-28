import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transform } from 'esbuild';
import * as clock from '../netlify/lib/clock.mjs';

const source = await transform(readFileSync('netlify/functions/chat.mjs', 'utf8'), { loader: 'js', format: 'cjs' });
function fixture(generate) {
  const module = { exports: {} };
  vm.runInNewContext(source.code, {
    module, exports: module.exports, Response, URL, Buffer, ReadableStream, TextEncoder,
    require(name) {
      if (name.includes('clock.mjs')) return clock;
      if (name === '@google/genai') return { GoogleGenAI: class { models = { generateContentStream: generate }; } };
      throw new Error('Unexpected import');
    },
  });
  return module.exports.default;
}
function request(messages = [{ role: 'user', parts: [{ text: 'Giải thích phép nhân.' }] }]) {
  return new Request('https://example.com/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }) });
}
const events = async response => (await response.text()).trim().split('\n').map(line => JSON.parse(line));

test('chat streams Vietnamese output and completes using a supported model', async () => {
  const handler = fixture(async options => {
    assert.equal(options.model, 'gemini-3-flash-preview');
    assert.equal(options.contents[0].parts[0].text, 'Giải thích phép nhân.');
    return (async function* () {
      yield { text: 'Phép nhân ' };
      yield { text: 'là cộng lặp lại.', candidates: [{ finishReason: 'STOP' }] };
    })();
  });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/x-ndjson/);
  assert.deepEqual(await events(response), [{ text: 'Phép nhân ' }, { text: 'là cộng lặp lại.' }, { done: true }]);
});

test('provider authentication, unavailable model, quota and timeout get safe errors', async () => {
  for (const [status, expected] of [[403, 503], [404, 503], [429, 429], [504, 504]]) {
    const handler = fixture(async () => { throw { status, message: 'private provider details' }; });
    const response = await handler(request());
    assert.equal(response.status, expected);
    assert.doesNotMatch(await response.text(), /private provider details/);
  }
});

test('interrupted streams preserve partial output without reporting completion', async () => {
  const handler = fixture(async () => (async function* () {
    yield { text: 'Một phần câu trả lời' };
    throw { status: 429 };
  })());
  const output = await events(await handler(request()));
  assert.equal(output[0].text, 'Một phần câu trả lời');
  assert.ok(output[1].error);
  assert.ok(output.every(event => !event.done));
});

test('invalid history is rejected before contacting AI', async () => {
  const handler = fixture(() => assert.fail('must not call provider'));
  assert.equal((await handler(request([{ role: 'model', parts: [{ text: 'Invalid' }] }]))).status, 400);
  assert.equal((await handler(new Request('https://example.com/api/chat'))).status, 405);
});

test('inline chat script matches the standalone source', () => {
  assert.ok(readFileSync('index.html', 'utf8').includes(readFileSync('ai.js', 'utf8').trim()));
});
