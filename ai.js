(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const mascot = '<svg viewBox="0 0 80 80" fill="none" aria-hidden="true"><path d="M23 23 17 8 35 17M57 23 63 8 45 17" fill="#ffefe2" stroke="#a34f65" stroke-width="2.5" stroke-linejoin="round"/><rect x="12" y="17" width="56" height="49" rx="22" fill="#fff4e9" stroke="#a34f65" stroke-width="2.5"/><path d="M26 37v5m28-5v5" stroke="#75414e" stroke-width="4" stroke-linecap="round"/><path d="M34 46q6 8 12 0" stroke="#a34f65" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="23" cy="47" rx="6" ry="3" fill="#efb5b6"/><ellipse cx="57" cy="47" rx="6" ry="3" fill="#efb5b6"/><path d="m33 62 7 9 7-9" fill="#b95b77"/></svg>';
  document.querySelectorAll('[data-ai-mascot]').forEach((el) => { el.innerHTML = mascot; });
  let history = [], attachments = [], bytesUsed = 0, busy = false, aborter, stopped = false;
  const extensions = { txt: 'text/plain', csv: 'text/csv', md: 'text/markdown', pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', m4a: 'audio/mp4', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };
  function error(message = '') { $('ai-error').textContent = message; $('ai-error').hidden = !message; }
  function renderFiles() {
    $('ai-files').replaceChildren();
    attachments.forEach((item, index) => {
      const chip = document.createElement('span'); chip.className = 'ai-file';
      chip.append(document.createTextNode(`${item.name} · ${Math.ceil(item.size / 1024)} KB`));
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `Bỏ tệp ${item.name}`);
      remove.disabled = busy; remove.onclick = () => { attachments.splice(index, 1); renderFiles(); }; chip.append(remove); $('ai-files').append(chip);
    });
  }
  function setBusy(value) {
    busy = value;
    for (const id of ['ai-send', 'ai-attach', 'ai-new']) $(id).disabled = value;
    $('ai-stop').hidden = !value; $('ai-status').textContent = value ? 'Trường đang nghĩ…' : '';
    $('ai-messages').setAttribute('aria-busy', String(value)); renderFiles();
  }
  function bubble(role, text) {
    const row = document.createElement('article'); row.className = `ai-msg ${role}`;
    const label = document.createElement('div'); label.className = 'ai-msg-label'; label.textContent = role === 'user' ? 'Bạn' : 'Trường Đẹp Trai';
    const content = document.createElement('div'); content.className = 'ai-bubble'; content.textContent = text;
    row.append(label, content); $('ai-messages').append(row); scroll(); return content;
  }
  function scroll() { const log = $('ai-messages'); log.scrollTop = log.scrollHeight; }
  $('ai-attach').onclick = () => $('ai-file-input').click();
  let reading = false;
  $('ai-file-input').onchange = async (event) => {
    const files = [...event.target.files]; event.target.value = ''; error();
    reading = true; $('ai-send').disabled = true; $('ai-attach').disabled = true;
    try {
      for (const file of files) {
        if (attachments.length >= 4) { error('Mỗi lượt gửi tối đa 4 tệp nhé.'); break; }
        const mimeType = extensions[file.name.split('.').pop().toLowerCase()];
        if (!mimeType) { error(`Chưa hỗ trợ “${file.name}”. Với Word/PowerPoint, bạn hãy xuất sang PDF; với tệp khác, dùng định dạng trong hướng dẫn.`); continue; }
        if (!file.size) { error(`Tệp “${file.name}” đang trống.`); continue; }
        if (bytesUsed + attachments.reduce((sum, item) => sum + item.size, 0) + file.size > 3_000_000) { error('Tổng tệp tối đa 3 MB cho cả cuộc trò chuyện. Bạn giảm dung lượng hoặc mở cuộc trò chuyện mới nhé.'); continue; }
        const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('Không đọc được tệp. Bạn chọn lại nhé.')); reader.readAsDataURL(file); });
        attachments.push({ name: file.name, size: file.size, part: { inlineData: { mimeType, data } } }); renderFiles();
      }
    } catch (err) { error(err.message); }
    finally { reading = false; $('ai-send').disabled = busy; $('ai-attach').disabled = busy; }
  };
  document.querySelectorAll('[data-ai-prompt]').forEach((button) => { button.onclick = () => { $('ai-input').value = button.dataset.aiPrompt; $('ai-input').focus(); }; });
  $('ai-heart').onclick = () => {
    const heart = document.createElement('span'); heart.className = 'ai-pop'; heart.textContent = '♥'; heart.setAttribute('aria-hidden', 'true'); document.querySelector('.ai-main').append(heart); setTimeout(() => heart.remove(), 1400);
  };
  $('ai-new').onclick = () => {
    if (busy || reading) return;
    history = []; attachments = []; bytesUsed = 0;
    document.querySelectorAll('#ai-messages .ai-msg').forEach((row) => row.remove());
    $('ai-welcome').hidden = false; $('ai-input').value = ''; error(); renderFiles(); $('ai-input').focus();
  };
  $('ai-stop').onclick = () => { stopped = true; aborter?.abort(); };
  $('ai-input').onkeydown = (event) => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('ai-form').requestSubmit(); } };
  $('ai-form').onsubmit = async (event) => {
    event.preventDefault(); if (busy || reading) return;
    const text = $('ai-input').value.trim();
    if (!text && !attachments.length) { $('ai-input').focus(); return; }
    if (history.length >= 38) { error('Cuộc trò chuyện đã dài. Bạn mở cuộc trò chuyện mới để tiếp tục nhé.'); return; }
    error();
    const chosen = [...attachments];
    const question = { role: 'user', parts: [{ text: text || 'Hãy giúp mình tìm hiểu nội dung các tệp đính kèm.' }, ...chosen.map((item) => item.part)] };
    if (new Blob([JSON.stringify({ messages: [...history, question] })]).size > 4_400_000) { error('Cuộc trò chuyện quá lớn. Hãy bắt đầu cuộc trò chuyện mới nhé.'); return; }
    $('ai-welcome').hidden = true;
    const userBubble = bubble('user', [text, ...chosen.map((item) => `Đính kèm: ${item.name}`)].filter(Boolean).join('\n'));
    const reply = bubble('model', 'Đang đọc câu hỏi của bạn…');
    setBusy(true); stopped = false; aborter = new AbortController();
    const timeout = setTimeout(() => aborter.abort(), 55000);
    let answer = '', completed = false, reader;
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [...history, question] }), signal: aborter.signal });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'Không kết nối được với AI. Bạn thử lại nhé.'); }
      if (!response.body || !response.headers.get('content-type')?.includes('application/x-ndjson')) throw new Error('Dịch vụ AI chưa sẵn sàng. Bạn thử lại sau nhé.');
      reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = '';
      const handle = (line) => {
        if (!line.trim()) return;
        const chunk = JSON.parse(line);
        if (chunk.error) throw new Error(chunk.error);
        if (chunk.text) { $('ai-status').textContent = 'Trường đang trả lời…'; answer += chunk.text; reply.textContent = answer; scroll(); }
        if (chunk.done) completed = true;
      };
      while (true) { const { value, done } = await reader.read(); pending += done ? decoder.decode() : decoder.decode(value, { stream: true }); const lines = pending.split('\n'); pending = lines.pop(); lines.forEach(handle); if (done) break; }
      if (pending) handle(pending);
      if (!completed || !answer) throw new Error('Câu trả lời chưa hoàn tất. Bạn gửi lại nhé.');
      history.push(question, { role: 'model', parts: [{ text: answer }] });
      bytesUsed += chosen.reduce((sum, item) => sum + item.size, 0);
      attachments = [];
      if ($('ai-input').value.trim() === text) $('ai-input').value = '';
    } catch (err) {
      reply.textContent = answer ? answer + '\n\n[Câu trả lời chưa hoàn tất]' : 'Chưa nhận được câu trả lời.';
      error(err.name === 'AbortError' ? (stopped ? 'Đã dừng trả lời. Câu hỏi và tệp vẫn được giữ để gửi lại.' : 'AI phản hồi quá lâu. Câu hỏi và tệp vẫn được giữ để gửi lại.') : err instanceof TypeError ? 'Mất kết nối mạng. Kiểm tra Internet rồi gửi lại nhé; câu hỏi và tệp vẫn được giữ.' : err.message);
      userBubble.closest('article').remove();
    } finally { clearTimeout(timeout); await reader?.cancel().catch(() => {}); setBusy(false); aborter = null; }
  };
})();
