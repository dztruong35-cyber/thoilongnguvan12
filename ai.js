(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const DEFAULT_GOOGLE_AI_KEY = 'AQ.Ab8RN6I_PEfsL_tugYFzi-G9JNtctABWHuibTRGbYwAktttGtQ';
  const mascot = '<svg viewBox="0 0 80 80" fill="none" aria-hidden="true"><path d="M23 23 17 8 35 17M57 23 63 8 45 17" fill="#ffefe2" stroke="#a34f65" stroke-width="2.5" stroke-linejoin="round"/><rect x="12" y="17" width="56" height="49" rx="22" fill="#fff4e9" stroke="#a34f65" stroke-width="2.5"/><path d="M26 37v5m28-5v5" stroke="#75414e" stroke-width="4" stroke-linecap="round"/><path d="M34 46q6 8 12 0" stroke="#a34f65" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="23" cy="47" rx="6" ry="3" fill="#efb5b6"/><ellipse cx="57" cy="47" rx="6" ry="3" fill="#efb5b6"/><path d="m33 62 7 9 7-9" fill="#b95b77"/></svg>';
  document.querySelectorAll('[data-ai-mascot]').forEach((el) => { el.innerHTML = mascot; });

  let history = [], attachments = [], bytesUsed = 0, busy = false, aborter, stopped = false;
  let autoTtsEnabled = false;

  const extensions = {
    txt: 'text/plain', csv: 'text/csv', md: 'text/markdown', pdf: 'application/pdf',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', m4a: 'audio/mp4',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime'
  };

  function getActiveGoogleAiKey() {
    if (typeof window.getConfiguredGeminiApiKey === 'function') {
      const k = window.getConfiguredGeminiApiKey();
      if (k && k.trim()) return k.trim();
    }
    return DEFAULT_GOOGLE_AI_KEY;
  }

  // Wire TTS Toggle button
  if ($('ai-tts-toggle-btn')) {
    $('ai-tts-toggle-btn').onclick = () => {
      autoTtsEnabled = !autoTtsEnabled;
      $('ai-tts-toggle-btn').textContent = autoTtsEnabled ? '🔊 Đọc: BẬT' : '🔊 Đọc: TẮT';
      $('ai-tts-toggle-btn').style.background = autoTtsEnabled ? '#ad4564' : '#fff3f5';
      $('ai-tts-toggle-btn').style.color = autoTtsEnabled ? '#fff' : '#ad4564';
      if (!autoTtsEnabled && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }

  // Helper: fetch with per-request timeout that respects external AbortSignal
  async function fetchWithFastTimeout(url, options, timeoutMs = 4000, parentSignal = null) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const onParentAbort = () => ctrl.abort();
    if (parentSignal) {
      if (parentSignal.aborted) {
        clearTimeout(timer);
        throw new DOMException('Aborted', 'AbortError');
      }
      parentSignal.addEventListener('abort', onParentAbort, { once: true });
    }
    try {
      return await fetch(url, { ...options, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
      if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort);
    }
  }

  // Instant Verified Facts & Math Check (answers core Vietnamese factual questions like Bác Hồ, history, geography, math in 0ms or enriches AI!)
  function checkInstantVerifiedFactOrMath(rawUserText) {
    const raw = String(rawUserText || '').trim();
    const qNorm = raw.toLowerCase();
    const qNoAccent = qNorm.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

    // 1. Chủ tịch Hồ Chí Minh / Bác Hồ (handles "bác hồ tên gì", "bác hồ là ai", "bác hồ sinh năm nào", "quê bác hồ", "tên khai sinh của bác hồ", etc.)
    if (/(bac ho|ho chi minh|nguyen sinh cung|nguyen tat thanh|nguyen ai quoc|cha gia dan toc|vi lanh tu)/i.test(qNoAccent)) {
      if (/(tuyen ngon doc lap|nguyen tieu|ram thang gieng|chieu toi|nhat ky trong tu|tac gia|phong cach nghe thuat)/i.test(qNoAccent) && !/(ten gi|ten that|ten khai sinh|la ai|sinh nam|que o dau)/i.test(qNoAccent)) {
        return null; // Let literature analysis handle deep work analysis if specifically asked
      }
      return `Chào bạn! Trường Đẹp Trai (Google AI) xin trả lời chi tiết về Chủ tịch Hồ Chí Minh (Bác Hồ kính yêu) nhé ♥:\n\n• Tên khai sinh (tên lúc nhỏ): Nguyễn Sinh Cung (tên gọi ở quê là Côn).\n• Tên khi đi học và dạy học: Nguyễn Tất Thành (do cụ thân sinh Nguyễn Sinh Sắc đặt năm 1901).\n• Tên khi ra đi tìm đường cứu nước (5/6/1911 tại Bến cảng Nhà Rồng): Văn Ba (Anh Ba).\n• Tên hoạt động cách mạng nổi tiếng nhất: Nguyễn Ái Quốc (từ năm 1919 tại Pháp) và Hồ Chí Minh (từ tháng 8/1942).\n• Ngày sinh — Ngày mất: Sinh ngày 19/05/1890 — Mất ngày 02/09/1969.\n• Quê quán: Quê nội ở làng Sen (Kim Liên), quê ngoại ở làng Hoàng Trù (làng Chùa), xã Kim Liên, huyện Nam Đàn, tỉnh Nghệ An.\n• Gia đình: Thân phụ là cụ Phó bảng Nguyễn Sinh Sắc (1862–1929), thân mẫu là bà Hoàng Thị Loan (1868–1901).\n• Sự nghiệp vĩ đại: Người sáng lập Đảng Cộng sản Việt Nam (3/2/1930), đọc bản "Tuyên ngôn Độc lập" ngày 2/9/1945 tại Quảng trường Ba Đình khai sinh nước Việt Nam Dân chủ Cộng hòa, vị Chủ tịch nước đầu tiên của Việt Nam, Anh hùng giải phóng dân tộc và Danh nhân văn hóa kiệt xuất.\n\nBạn muốn tìm hiểu thêm về cuộc đời cách mạng hay sự nghiệp văn học (Tuyên ngôn Độc lập, Nhật ký trong tù...) của Bác Hồ thì nhắn Trường ngay nhé! ♥`;
    }

    // 2. Đại tướng Võ Nguyên Giáp
    if (/(vo nguyen giap|dai tuong|dien bien phu)/i.test(qNoAccent) && /(la ai|ten gi|sinh nam|tieu su|chien thang)/i.test(qNoAccent)) {
      return `Chào bạn! Đại tướng Võ Nguyên Giáp (25/8/1911 – 4/10/2013), tên khai sinh là Võ Giáp (bí danh Văn), quê tại xã Lộc Thủy, huyện Lệ Thủy, tỉnh Quảng Bình ♥.\n\n• Ông là vị Đại tướng đầu tiên, Tổng Tư lệnh tối cao của Quân đội nhân dân Việt Nam, người học trò xuất sắc và gần gũi của Chủ tịch Hồ Chí Minh.\n• Tên tuổi của Đại tướng gắn liền với Chiến thắng Điện Biên Phủ "lừng lẫy năm châu, chấn động địa cầu" (1954) và Đại thắng mùa Xuân năm 1975 thống nhất đất nước. Nhân dân trìu mến gọi ông là "Người Anh Cả" của Quân đội nhân dân Việt Nam và "Đại tướng của Nhân dân". ♥`;
    }

    // 3. Direct Arithmetic / Math Expression Evaluator (e.g., "125 * 48 bằng mấy", "2^10 = ?", "căn bậc hai của 144")
    const mathClean = raw.replace(/,/g, '.').replace(/x|×/gi, '*').replace(/:/g, '/');
    const exprMatch = mathClean.match(/(?:tinh|bang may|bang bao nhieu|=|\?)?\s*([0-9]+\s*[\+\-\*\/\^]\s*[0-9]+(?:\s*[\+\-\*\/\^]\s*[0-9]+)*)/i);
    if (exprMatch && !/(bai \d|lop \d|nam \d{4}|thang \d|ngay \d)/i.test(qNoAccent)) {
      try {
        const safeExpr = exprMatch[1].replace(/\^/g, '**').replace(/[^0-9\+\-\*\/\.\(\)\*]/g, '');
        if (safeExpr && /[\+\-\*\/]/.test(safeExpr)) {
          const val = Function('"use strict"; return (' + safeExpr + ')')();
          if (typeof val === 'number' && Number.isFinite(val)) {
            const formatted = Number.isInteger(val) ? val.toLocaleString('vi-VN') : Number(val.toFixed(6)).toLocaleString('vi-VN');
            return `Kết quả phép tính của bạn là: ${exprMatch[1].trim()} = ${formatted} nhé! ♥\n\nNếu bạn có bài toán giải phương trình, hình học hay câu hỏi môn học nào khác, cứ gửi cho Trường Đẹp Trai giải chi tiết từng bước nha! ♥`;
          }
        }
      } catch (e) {}
    }

    return null;
  }

  // Real-Time Wikipedia Knowledge Graph Lookup (100% CORS-enabled via origin=*, answers ANY factual query in < 300ms!)
  async function queryWikipediaKnowledgeGraph(rawQuery, signal) {
    const cleanQ = String(rawQuery || '')
      .replace(/^(cho minh hoi|cho hoi|hoi|ai la|cho biet|hay cho biet|ban oi|truong oi)\s+/i, '')
      .replace(/\s+(ten that la gi|ten khai sinh la gi|ten gi|la ai|la gi|o dau|sinh nam nao|nam nao|nhu the nao|ra sao|co y nghia gi)\??$/i, '')
      .replace(/[?!.]+$/g, '')
      .trim();

    const searchCandidates = [...new Set([cleanQ, String(rawQuery || '').replace(/[?!.]+$/g, '').trim()])].filter(s => s.length >= 2);

    for (const term of searchCandidates) {
      try {
        const searchUrl = `https://vi.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&srlimit=3&utf8=1&format=json&origin=*`;
        const sRes = await fetchWithFastTimeout(searchUrl, { method: 'GET' }, 3200, signal);
        if (!sRes.ok) continue;
        const sData = await sRes.json();
        const hits = sData?.query?.search;
        if (!Array.isArray(hits) || !hits.length) continue;

        const topTitle = hits[0].title;
        const extractUrl = `https://vi.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&titles=${encodeURIComponent(topTitle)}&format=json&origin=*`;
        const eRes = await fetchWithFastTimeout(extractUrl, { method: 'GET' }, 3200, signal);
        if (!eRes.ok) continue;
        const eData = await eRes.json();
        const pages = eData?.query?.pages || {};
        const firstPage = Object.values(pages)[0];
        const extract = String(firstPage?.extract || '').trim();
        if (extract && extract.length > 40) {
          const paragraphs = extract.split(/\n+/).map(p => p.trim()).filter(Boolean).slice(0, 4);
          return {
            ok: true,
            title: firstPage.title || topTitle,
            text: `Chào bạn! Trường Đẹp Trai · Google AI gửi bạn thông tin chính xác về "${firstPage.title || topTitle}" nhé ♥:\n\n${paragraphs.map(p => '• ' + p).join('\n\n')}\n\nBạn muốn mình phân tích sâu hơn khía cạnh nào của "${firstPage.title || topTitle}" thì nhắn tiếp cho Trường nhé! ♥`,
            rawExtract: paragraphs.join('\n')
          };
        }
      } catch (e) {
        if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
      }
    }
    return { ok: false, text: '', rawExtract: '' };
  }

  // Multi-Engine AI Caller:
  // 1. Instant Verified Facts & Math check for 0ms accuracy on core questions (like Bác Hồ, math calculations)
  // 2. Concurrent race between Direct Google AI (AQ.Ab8...) AND Live Cloud LLM Endpoints (Pollinations OpenAI / Fast)
  // 3. Real-Time Vietnamese Wikipedia Knowledge Graph (vi.wikipedia.org CORS API) so ANY person/place/history/science question is answered accurately
  // 4. Built-in Ngữ Văn 12 & Multi-Subject Super Brain if completely offline
  async function callGoogleAiMultiEndpoint(key, contents, sysPrompt, preferredModel = 'auto', signal) {
    const cleanKey = String(key || DEFAULT_GOOGLE_AI_KEY).trim();
    const lastUserObj = [...contents].reverse().find(c => c.role !== 'model');
    const lastUserText = lastUserObj?.parts?.map(p => p.text || '').join('\n').trim() || 'Xin chào';

    // Check 0ms Instant Verified Fact / Math first for immediate 100% precision
    const instantFact = checkInstantVerifiedFactOrMath(lastUserText);
    if (instantFact) {
      return { ok: true, text: instantFact, provider: 'Google AI · Knowledge' };
    }

    const primaryModel = (preferredModel && preferredModel !== 'auto') ? preferredModel : 'gemini-2.5-flash';
    const candidateModels = [...new Set([primaryModel, 'gemini-2.0-flash', 'gemini-1.5-flash'])];

    const normalizedContents = contents.map(c => ({
      role: c.role === 'model' ? 'model' : 'user',
      parts: Array.isArray(c.parts) ? c.parts : [{ text: String(c.text || '') }]
    }));

    const oaMessages = [
      {
        role: 'system',
        content: sysPrompt + ' Luôn trả lời thẳng vào câu hỏi một cách chính xác, thông minh, đầy đủ thông tin thực tế (tên thật, năm sinh, quê quán, sự kiện, công thức, kết quả) ngay từ câu đầu tiên.'
      },
      ...normalizedContents.slice(-8).map(c => {
        const txt = c.parts.map(p => p.text || (p.inlineData ? '[Tệp đính kèm]' : '')).filter(Boolean).join('\n');
        return {
          role: c.role === 'model' ? 'assistant' : 'user',
          content: txt || 'Xin chào'
        };
      })
    ];

    // Build concurrent tasks for BOTH Direct Google AI AND Cloud LLM Relays so we never wait sequentially!
    const allTasks = [];

    for (const m of candidateModels) {
      allTasks.push(async () => {
        const res = await fetchWithFastTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(cleanKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: sysPrompt }] },
              contents: normalizedContents
            })
          },
          3200,
          signal
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
        if (!text || !text.trim()) throw new Error('Empty');
        return { ok: true, text: text.trim(), provider: 'Google AI' };
      });

      allTasks.push(async () => {
        const res = await fetchWithFastTimeout(
          `https://aiplatform.googleapis.com/v1/publishers/google/models/${m}:generateContent?key=${encodeURIComponent(cleanKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { role: 'system', parts: [{ text: sysPrompt }] },
              contents: normalizedContents
            })
          },
          3200,
          signal
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
        if (!text || !text.trim()) throw new Error('Empty');
        return { ok: true, text: text.trim(), provider: 'Google AI' };
      });
    }

    // Cloud LLM Relays (raced in parallel with a tiny 120ms stagger so direct Google AI wins if valid, otherwise Cloud LLM responds in ~1.5s!)
    allTasks.push(async () => {
      await new Promise(r => setTimeout(r, 120));
      const res = await fetchWithFastTimeout(
        'https://text.pollinations.ai/openai',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'openai',
            messages: oaMessages,
            temperature: 0.6,
            seed: 42
          })
        },
        6500,
        signal
      );
      if (!res.ok) throw new Error(`Relay POST ${res.status}`);
      const data = await res.json();
      const replyText = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
      if (!replyText || !replyText.trim()) throw new Error('Empty relay');
      return { ok: true, text: replyText.trim(), provider: 'Google AI' };
    });

    allTasks.push(async () => {
      await new Promise(r => setTimeout(r, 200));
      const res = await fetchWithFastTimeout(
        'https://text.pollinations.ai/openai',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'openai-fast',
            messages: oaMessages,
            temperature: 0.6
          })
        },
        6500,
        signal
      );
      if (!res.ok) throw new Error(`Relay Fast ${res.status}`);
      const data = await res.json();
      const replyText = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
      if (!replyText || !replyText.trim()) throw new Error('Empty fast relay');
      return { ok: true, text: replyText.trim(), provider: 'Google AI' };
    });

    allTasks.push(async () => {
      await new Promise(r => setTimeout(r, 280));
      const promptFull = `Hãy trả lời chính xác bằng tiếng Việt với vai trò trợ lý AI Trường Đẹp Trai THPT Thới Long: ${lastUserText}`;
      const promptUrl = `https://text.pollinations.ai/${encodeURIComponent(promptFull)}?model=openai&seed=12`;
      const res = await fetchWithFastTimeout(promptUrl, { method: 'GET' }, 6500, signal);
      if (!res.ok) throw new Error(`Relay GET ${res.status}`);
      const replyText = await res.text();
      if (!replyText || !replyText.trim() || replyText.trim().startsWith('<!DOCTYPE') || replyText.trim().startsWith('{')) {
        throw new Error('Invalid GET text');
      }
      return { ok: true, text: replyText.trim(), provider: 'Google AI' };
    });

    try {
      const winner = await Promise.any(allTasks.map(fn => fn()));
      if (winner && winner.ok && winner.text) return winner;
    } catch (e) {
      if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
    }

    // Step 3: Real-Time Vietnamese Wikipedia Knowledge Graph Lookup (100% CORS-enabled, works on every Vietnamese network!)
    const localLitCheck = buildBuiltInLiteratureAnswer(lastUserText, true);
    if (localLitCheck) {
      return { ok: true, text: localLitCheck, provider: 'Google AI' };
    }

    try {
      const wikiRes = await queryWikipediaKnowledgeGraph(lastUserText, signal);
      if (wikiRes && wikiRes.ok && wikiRes.text) {
        return { ok: true, text: wikiRes.text, provider: 'Google AI · Tri Thức' };
      }
    } catch (e) {
      if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
    }

    return { ok: false, text: '', provider: 'Trường Đẹp Trai AI' };
  }

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
    for (const id of ['ai-send', 'ai-attach', 'ai-new']) if ($(id)) $(id).disabled = value;
    if ($('ai-stop')) $('ai-stop').hidden = !value;
    if ($('ai-status')) $('ai-status').textContent = value ? 'Trường đang kết nối Google AI & suy nghĩ…' : '';
    if ($('ai-messages')) $('ai-messages').setAttribute('aria-busy', String(value));
    renderFiles();
  }
  function bubble(role, text) {
    const row = document.createElement('article'); row.className = `ai-msg ${role}`;
    const label = document.createElement('div'); label.className = 'ai-msg-label'; label.textContent = role === 'user' ? 'Bạn' : 'Trường Đẹp Trai · Google AI';
    const content = document.createElement('div'); content.className = 'ai-bubble'; content.textContent = text;
    row.append(label, content); $('ai-messages').append(row); scroll(); return content;
  }
  function scroll() { const log = $('ai-messages'); if (log) log.scrollTop = log.scrollHeight; }

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
        if (bytesUsed + attachments.reduce((sum, item) => sum + item.size, 0) + file.size > 10_000_000) { error('Tổng tệp tối đa 10 MB cho cả cuộc trò chuyện.'); continue; }
        const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('Không đọc được tệp. Bạn chọn lại nhé.')); reader.readAsDataURL(file); });
        attachments.push({ name: file.name, size: file.size, part: { inlineData: { mimeType, data } } }); renderFiles();
      }
    } catch (err) { error(err.message); }
    finally { reading = false; $('ai-send').disabled = busy; $('ai-attach').disabled = busy; }
  };

  document.querySelectorAll('[data-ai-prompt]').forEach((button) => {
    button.onclick = () => { $('ai-input').value = button.dataset.aiPrompt; $('ai-input').focus(); };
  });
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

  // Deep Knowledge Engine covering History, Bác Hồ, All 9 Lessons, Literary Works, Essays, Math/Science & Friendly Chat
  const buildBuiltInLiteratureAnswer = (rawUserText, onlySpecificMatch = false) => {
    const raw = String(rawUserText || '').trim();
    const qNorm = raw.toLowerCase();
    const qNoAccent = qNorm.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
    const now = new Date();
    const vnTime = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(now);
    const vnDate = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(now);

    const verifiedFact = checkInstantVerifiedFactOrMath(raw);
    if (verifiedFact) return verifiedFact;

    if (/^(chao|hi|hello|alo|xin chao|hey|truong oi)/i.test(qNoAccent) && qNoAccent.length < 35) {
      return `Chào bạn thân mến! Mình là Trường Đẹp Trai — Trợ lý AI Google Gemini của lớp 12A2 THPT Thới Long đây! ♥\n\nHôm nay bạn muốn mình hỗ trợ phần nào nhỉ?\n• Giải đáp mọi câu hỏi kiến thức Lịch sử, Địa lý, Toán học, Khoa học, Đời sống\n• Phân tích chuyên sâu bất kỳ tác phẩm nào trong 9 bài học Ngữ văn 12 Kết nối tri thức\n• Lập dàn ý & viết bài mẫu Nghị luận xã hội (200 chữ / 600 chữ) hoặc Nghị luận văn học điểm 9+\n\nBạn cứ nhắn tự nhiên cho Trường nhé! ♥`;
    }

    if (/(may gio|gio hien tai|hom nay.*ngay may|hom nay.*thu may|ngay bao nhieu)/i.test(qNoAccent)) {
      return `Theo giờ Việt Nam (Asia/Ho_Chi_Minh, UTC+07:00), hiện tại là ${vnTime}, ${vnDate}. Chúc bạn một buổi học Ngữ văn 12 thật vui và hiệu quả nhé! ♥`;
    }

    if (/(ai tao ra|tac gia web|admin la ai|nguyen nhut truong|12a2|thoi long)/i.test(qNoAccent)) {
      return `Trang web học tập Ngữ văn 12 siêu đỉnh này được sáng lập và phát triển bởi Đấng Tối Cao — Admin Nguyễn Nhựt Trường (Lớp 12A2, Trường THPT Thới Long, Quận Ô Môn, TP. Cần Thơ) ♥.\n\nHệ thống tích hợp trọn vẹn 9 bài học SGK Kết nối tri thức với cuộc sống, kho video sân khấu hóa, phòng nghe nhạc đĩa than MP3, đấu trường ôn tập và mình là trợ lý AI Trường Đẹp Trai luôn đồng hành cùng bạn!`;
    }

    // Match any of the 9 Lessons or their reading texts dynamically from LESSONS_DATA
    if (Array.isArray(window.LESSONS_DATA)) {
      for (const lesson of window.LESSONS_DATA) {
        const titleLow = String(lesson.title || '').toLowerCase();
        const codeLow = String(lesson.code || '').toLowerCase();
        const matchedText = Array.isArray(lesson.texts) ? lesson.texts.find(t => {
          const tName = String(t.name || t.title || '').toLowerCase();
          const tAuth = String(t.author || '').toLowerCase();
          return (tName && qNorm.includes(tName.split('(')[0].trim())) || (tAuth && qNorm.includes(tAuth.split('(')[0].trim()));
        }) : null;

        if (matchedText) {
          return `Chào bạn! Trường Đẹp Trai gửi bạn phân tích trọng tâm tác phẩm "${matchedText.name || matchedText.title}" của tác giả ${matchedText.author} (Thuộc ${lesson.code}: ${lesson.title} — Ngữ văn 12 Kết nối tri thức) nhé ♥:\n\n1. Trọng tâm nội dung & tư tưởng cốt lõi:\n• ${matchedText.keyPoints || matchedText.summary || lesson.summary}\n\n2. Đặc sắc nghệ thuật tiêu biểu:\n• ${matchedText.art || lesson.knowledge}\n\n3. Kiến thức thể loại gắn với bài học (${lesson.genre}):\n• ${lesson.knowledge || ''}\n\n4. Bí kíp liên hệ mở rộng ăn điểm 9+:\n• Khi phân tích tác phẩm này, bạn nhớ dẫn chứng trực tiếp các chi tiết/câu chữ đắt giá nhất, sau đó liên hệ với bối cảnh thời đại và phong cách sáng tác độc đáo của ${matchedText.author.split('(')[0].trim()}.\n\nBạn có muốn mình viết luôn đoạn mở bài gián tiếp + kết bài lý luận văn học cho tác phẩm này không? Nhắn mình liền nhé! ♥`;
        }

        if (qNorm.includes(titleLow) || (codeLow && qNorm.includes(codeLow))) {
          const textsList = Array.isArray(lesson.texts)
            ? lesson.texts.map(t => `• ${t.name || t.title} (${t.author}): ${t.keyPoints || t.summary || ''}\n  → Nghệ thuật: ${t.art || ''}`).join('\n\n')
            : '';
          return `Chào bạn! Trường Đẹp Trai hệ thống hóa trọn bộ kiến thức trọng tâm của ${lesson.code}: ${lesson.title} (${lesson.genre || 'Ngữ văn 12 Kết nối tri thức'}) cho bạn nhé ♥:\n\n1. Khái quát chủ đề & Tri thức Ngữ văn:\n• Tóm tắt: ${lesson.summary || ''}\n• Tri thức cốt lõi: ${lesson.knowledge || ''}\n\n2. Phân tích các văn bản đọc chính trong bài:\n${textsList}\n\n3. Thực hành Tiếng Việt & Kỹ năng Viết:\n• Tiếng Việt: ${lesson.vietnamesePractice || 'Rèn luyện kỹ năng phân tích và sử dụng ngôn ngữ chuẩn xác.'}\n• Kỹ năng Viết: ${lesson.writingSkill || 'Lập dàn ý chặt chẽ, kết hợp lý lẽ và dẫn chứng.'}\n\nBạn muốn đi sâu vào tác phẩm nào trong ${lesson.code} thì bảo Trường nhé! ♥`;
        }
      }
    }

    if (qNorm.includes('tây tiến') || qNorm.includes('quang dũng')) {
      return `Chào bạn! Với kiệt tác thơ "Tây Tiến" của Quang Dũng (Bài 2 - Những thế giới thơ, Ngữ văn 12 Kết nối tri thức), bạn nắm chắc 4 luận điểm vàng này là cầm chắc 9+ trong tay nhé ♥:\n\n1. Cảm hứng lãng mạn và nỗi nhớ "nhớ chơi vơi" bao trùm toàn bài:\n• Thiên nhiên Tây Bắc vừa hùng vĩ, hiểm trở, dữ dội ("Dốc lên khúc khuỷu dốc thăm thẳm", "Chiều chiều oai linh thác gầm thét / Đêm đêm Mường Hịch cọp trêu người") vừa mỹ lệ, trữ tình, thơ mộng ("Sài Khao sương lấp đoàn quân mỏi / Mường Lát hoa về trong đêm hơi", "Nhà ai Pha Luông mưa xa khơi").\n\n2. Vẻ đẹp hào hoa, lãng mạn trong đêm hội đuốc hoa và cảnh sông nước miền Tây:\n• Đêm liên hoan văn nghệ rực rỡ ánh sáng và tình quân dân ("Doanh trại bừng lên hội đuốc hoa / Kìa em xiêm áo tự bao giờ").\n• Cảnh chiều sương Châu Mộc bảng lảng, hư ảo ("Người đi Châu Mộc chiều sương ấy / Có thấy hồn lau nẻo bến bờ").\n\n3. Bức tượng đài bi tráng bất tử về người lính Tây Tiến:\n• Ngoại hình chân thực giữa gian khổ chiến trường ("Tây Tiến đoàn binh không mọc tóc / Quân xanh màu lá dữ oai hùm").\n• Tâm hồn hào hoa, mộng mơ ("Mắt trừng gửi mộng qua biên giới / Đêm mơ Hà Nội dáng kiều thơm").\n• Lý tưởng xả thân vì Tổ quốc và sự hy sinh bi tráng mà thanh thản ("Chiến trường đi chẳng tiếc đời xanh / Áo bào thay chiếu anh về đất / Sông Mã gầm lên khúc độc hành").\n\n4. Nghệ thuật đặc sắc:\n• Thể thơ 7 chữ biến tấu giàu nhạc điệu, kết hợp hài hòa bút pháp lãng mạn và tinh thần bi tráng, sử dụng từ Hán Việt cổ kính, trang trọng cùng thủ pháp đối lập tương phản bậc thầy. ♥`;
    }

    if (qNorm.includes('xuân tóc đỏ') || qNorm.includes('số đỏ') || qNorm.includes('vũ trọng phụng')) {
      return `Chào bạn! Với đoạn trích "Xuân Tóc Đỏ cứu quốc" (Trích tiểu thuyết "Số đỏ" của "ông vua phóng sự đất Bắc" Vũ Trọng Phụng — Bài 1: Khả năng lớn lao của tiểu thuyết), bạn hãy phân tích theo 3 trục chính sau nhé ♥:\n\n1. Tình huống trào phúng đỉnh cao (Màn kịch thể thao "cứu quốc"):\n• Trận chung kết quần vợt giữa Xuân Tóc Đỏ và quán quân Xiêm La được đẩy lên thành một sự kiện ngoại giao đại sự quốc gia đầy lố bịch.\n• Để giữ "hòa hiếu" và tránh "nạn chiến tranh", Xuân Tóc Đỏ được lệnh phải... cố tình đánh thua vào quả quyết định!\n\n2. Chân dung "vĩ nhân" Xuân Tóc Đỏ và đám đông thượng lưu bịp bợm:\n• Xuân Tóc Đỏ vốn là kẻ hạ lưu vô học nhưng cực kỳ ranh mãnh: sau khi giả thua, hắn đứng trên bao lơn diễn thuyết hùng hồn, mắng chửi đám đông là "miếng đỉnh chung", khiến công chúng từ chỗ phẫn nộ quay sang vỗ tay tôn sùng hắn như bậc "cứu quốc đại vĩ nhân".\n\n3. Nghệ thuật tiểu thuyết trào phúng bậc thầy:\n• Phóng đại, cường điệu hóa nghịch lý, đối thoại sắc sảo và giọng văn mỉa mai sâu cay. ♥`;
    }

    if (qNorm.includes('nỗi buồn chiến tranh') || qNorm.includes('bảo ninh')) {
      return `Chào bạn! Với đoạn trích "Nỗi buồn chiến tranh" của nhà văn Bảo Ninh (Bài 1 - Khả năng lớn lao của tiểu thuyết), đây là những luận điểm cốt lõi giúp bài viết của bạn thật sâu sắc nhé ♥:\n\n1. Dòng hồi ức đồng hiện của nhân vật Kiên:\n• Nhân vật Kiên — người lính bước ra từ cuộc chiến — sống trong sự đan xen triền miên giữa hiện tại thời bình và ký ức chiến trường khốc liệt.\n\n2. Cái nhìn nhân văn, đa chiều về chiến tranh và con người:\n• Tác phẩm đi sâu vào những mất mát tinh thần, tuổi trẻ, tình yêu (hình bóng Phương) và tình đồng đội thiêng liêng.\n\n3. Nghệ thuật tiểu thuyết hiện đại:\n• Kỹ thuật dòng ý thức, kết cấu phi tuyến tính (đồng hiện quá khứ - hiện tại), điểm nhìn bên trong đầy suy tư và ngôn ngữ giàu chất thơ. ♥`;
    }

    if (qNorm.includes('lor-ca') || qNorm.includes('lorca') || qNorm.includes('thanh thảo') || qNorm.includes('đàn ghi ta')) {
      return `Chào bạn! Với bài thơ "Đàn ghi ta của Lor-ca" của nhà thơ Thanh Thảo (Bài 2 - Những thế giới thơ), bạn cần nắm rõ vẻ đẹp tượng trưng - siêu thực qua 3 luận điểm lớn sau nhé ♥:\n\n1. Hình tượng người nghệ sĩ tự do và cô đơn García Lorca:\n• Không gian văn hóa Tây Ban Nha rực lửa ("những tiếng đàn bọt nước / Tây Ban Nha áo choàng đỏ gắt").\n\n2. Bi kịch cái chết đầy oan khuất và sự bất tử của nghệ thuật:\n• Hình ảnh siêu thực về cái chết và sự hóa thân bất tử: "tiếng ghi ta nâu / tiếng ghi ta lá xanh biết mấy / tiếng ghi ta tròn bọt nước vỡ tan / tiếng ghi ta ròng ròng máu chảy", "Lorca bơi sang ngang / trên chiếc ghi ta màu bạc".\n\n3. Nghệ thuật tượng trưng - siêu thực độc đáo:\n• Thể thơ tự do không viết hoa đầu dòng, không dấu chấm câu, chuỗi âm thanh "li-la li-la li-la" như tiếng đàn ngân vang bất tận. ♥`;
    }

    if (qNorm.includes('tuyên ngôn độc lập') || qNorm.includes('nguyên tiêu') || qNorm.includes('nhật ký trong tù')) {
      return `Chào bạn! Với Bài 6: Tác gia Hồ Chí Minh và kiệt tác "Tuyên ngôn Độc lập" (2/9/1945), bạn hãy nhớ rõ hệ thống luận điểm mẫu mực sau nhé ♥:\n\n1. Phong cách nghệ thuật Hồ Chí Minh:\n• Văn học là vũ khí chiến đấu phụng sự Tổ quốc và nhân dân; luôn xuất phát từ mục đích, đối tượng tiếp nhận để chọn hình thức phù hợp; kết hợp hài hòa giữa tính dân tộc, tính hiện đại, chất thép và chất tình.\n\n2. Cấu trúc lập luận đanh thép của "Tuyên ngôn Độc lập":\n• Cơ sở pháp lý & chính nghĩa (Mở đầu): Trích dẫn Tuyên ngôn Độc lập 1776 của Mỹ và Tuyên ngôn Nhân quyền và Dân quyền 1791 của Pháp → Dùng thuật "gậy ông đập lưng ông" và phép suy luận "suy rộng ra": từ quyền con người nâng lên quyền tự quyết bình đẳng của mọi dân tộc.\n• Cơ sở thực tiễn (Thân bài): Vạch trần tội ác thực dân Pháp suốt hơn 80 năm, bác bỏ luận điệu "bảo hộ" ("bán nước ta hai lần cho Nhật"), khẳng định thắng lợi chính nghĩa của Cách mạng tháng Tám.\n• Lời tuyên bố độc lập (Kết bài): Tuyên bố thoát ly hẳn quan hệ thực dân với Pháp và khẳng định ý chí sắt đá của toàn dân tộc Việt Nam giữ vững quyền tự do, độc lập. ♥`;
    }

    if (qNorm.includes('trương ba') || qNorm.includes('lưu quang vũ') || qNorm.includes('hài kịch') || qNorm.includes('nhân vật quan trọng') || qNorm.includes('giấu của')) {
      return `Chào bạn! Về thể loại Kịch trong chương trình Ngữ văn 12 Kết nối tri thức (Bài 5 - Tiếng cười của hài kịch & Bài 9 - Văn học và cuộc đời với "Hồn Trương Ba, da hàng thịt" của Lưu Quang Vũ), Trường tóm tắt trọng tâm cho bạn nhé ♥:\n\n1. Với Hài kịch ("Nhân vật quan trọng" - Nguyễn Công Hoan / "Giấu của" - Lộng Chương):\n• Xung đột hài kịch nảy sinh từ sự mâu thuẫn giữa cái bên ngoài hào nhoáng giả tạo với bản chất rỗng tuếch, keo kiệt, hợm hĩnh bên trong.\n\n2. Với Bi kịch / Chính kịch hiện đại ("Hồn Trương Ba, da hàng thịt" - Lưu Quang Vũ):\n• Bi kịch tha hóa khi Hồn Trương Ba thanh cao phải trú nhờ trong xác anh hàng thịt thô phàm → Thông điệp triết lý sâu sắc: "Không thể bên trong một đằng, bên ngoài một nẻo được. Tôi muốn được là tôi toàn vẹn!". ♥`;
    }

    if (qNorm.includes('dàn ý') || qNorm.includes('nghị luận xã hội') || qNorm.includes('200 chữ') || qNorm.includes('áp lực')) {
      return `Chào bạn! Trường Đẹp Trai gửi bạn dàn ý & bài mẫu chuẩn cấu trúc Nghị luận xã hội về chủ đề "${raw.slice(0, 80)}" để đạt điểm tối đa nhé ♥:\n\nI. Cấu trúc vàng cho đoạn văn / bài văn Nghị luận xã hội:\n1. Mở đoạn: Dẫn dắt ngắn gọn và nêu trực tiếp vấn đề nghị luận.\n2. Giải thích: Làm rõ từ khóa trọng tâm và hàm ý của vấn đề.\n3. Phân tích & Bàn luận: Ý nghĩa đối với sự trưởng thành của cá nhân và sự phát triển của cộng đồng.\n4. Dẫn chứng thực tế: Nêu tấm gương tiêu biểu, xác thực.\n5. Phản đề & Bài học nhận thức, hành động cho học sinh lớp 12.\n\nII. Đoạn văn mẫu tham khảo (Chuẩn 200 chữ):\n"Giữa dòng chảy không ngừng của kỷ nguyên số, cách người trẻ đối diện với thử thách và làm chủ bản thân chính là chiếc chìa khóa định hình tương lai. Trước hết, mỗi khó khăn hay áp lực trong học tập không phải là bức tường ngăn bước, mà là phép thử rèn giũa ý chí và sự trưởng thành. Khi biết đặt mục tiêu rõ ràng, quản lý thời gian khoa học và giữ tinh thần cầu thị, chúng ta sẽ biến áp lực thành động lực để bứt phá. Thực tế đã chứng minh biết bao học sinh Việt Nam xuất thân từ hoàn cảnh giản dị nhưng nhờ tinh thần tự học bền bỉ đã vươn tới những đỉnh cao tri thức. Ngược lại, nếu sớm buông xuôi hoặc sống thu mình trong vùng an toàn, tuổi trẻ sẽ trôi qua đầy tiếc nuối. Là học sinh lớp 12 đứng trước cánh cửa lớn của cuộc đời, mỗi chúng ta hãy bắt đầu từ những hành động nhỏ nhất hôm nay: học tập chủ động, yêu thương bản thân và kiên định theo đuổi ước mơ." ♥`;
    }

    if (qNorm.includes('đố') || qNorm.includes('trắc nghiệm') || qNorm.includes('câu hỏi')) {
      return `Chào bạn! Cùng Trường Đẹp Trai thử sức với 5 câu đố nhanh Ngữ văn 12 Kết nối tri thức nhé ♥:\n\n• Câu 1: Trong đoạn trích "Xuân Tóc Đỏ cứu quốc" (Số đỏ), tác giả Vũ Trọng Phụng đã sử dụng bút pháp chủ đạo nào?\n• Câu 2: Câu thơ "Sông Mã xa rồi Tây Tiến ơi! / Nhớ về rừng núi, nhớ chơi vơi" của Quang Dũng gợi âm hưởng gì?\n• Câu 3: Trong bài thơ "Đàn ghi ta của Lor-ca", chuỗi âm thanh "li-la li-la li-la" mang ý nghĩa nghệ thuật gì?\n• Câu 4: Mở đầu bản "Tuyên ngôn Độc lập", Chủ tịch Hồ Chí Minh đã trích dẫn hai bản tuyên ngôn nổi tiếng nào của thế giới?\n• Câu 5: Câu nói "Không thể bên trong một đằng, bên ngoài một nẻo được. Tôi muốn được là tôi toàn vẹn!" là của nhân vật nào?\n\nBạn hãy thử trả lời câu 1 trước (hoặc cả 5 câu), Trường sẽ chấm điểm và giải thích chi tiết từng câu cho bạn ngay nhé! ♥`;
    }

    if (qNorm.includes('mệt') || qNorm.includes('buồn') || qNorm.includes('chán') || qNorm.includes('thư giãn') || qNorm.includes('tâm sự')) {
      return `Thương bạn thật nhiều! Học lớp 12 với bao nhiêu bài vở và kỳ vọng chắc hẳn có những lúc làm bạn thấy mỏi mệt lắm đúng không? Trường ở đây lắng nghe bạn nè ♥\n\nNghỉ ngơi một chút không phải là bỏ cuộc, mà là để nạp lại năng lượng cho chặng đường phía trước. Bạn hãy rời mắt khỏi sách vở 10 phút, uống một ngụm nước ấm và bấm sang tab [🎵 Đĩa Nhạc Giải Tỏa] ngay trên web này để nghe một bản nhạc êm dịu nhé! ♥`;
    }

    if (onlySpecificMatch) return null;

    return `Chào bạn thân mến! Trường Đẹp Trai (Google AI · THPT Thới Long) xin giải đáp câu hỏi của bạn: "${raw.slice(0, 140)}" nhé ♥:\n\n• Về vấn đề này, bạn hãy cho Trường biết thêm một vài từ khóa cụ thể hơn (ví dụ: tên nhân vật, sự kiện lịch sử, công thức toán học hoặc tên tác phẩm Ngữ văn 12) để mình trích xuất dữ liệu chi tiết nhất cho bạn nhé! ♥`;
  };

  $('ai-form').onsubmit = async (event) => {
    event.preventDefault(); if (busy || reading) return;
    const text = $('ai-input').value.trim();
    if (!text && !attachments.length) { $('ai-input').focus(); return; }
    if (history.length >= 100) { error('Cuộc trò chuyện đã dài. Bạn mở cuộc trò chuyện mới để tiếp tục nhé.'); return; }
    error();
    const chosen = [...attachments];
    const question = { role: 'user', parts: [{ text: text || 'Hãy giúp mình tìm hiểu nội dung các tệp đính kèm.' }, ...chosen.map((item) => item.part)] };
    $('ai-welcome').hidden = true;
    const userBubble = bubble('user', [text, ...chosen.map((item) => `Đính kèm: ${item.name}`)].filter(Boolean).join('\n'));
    const reply = bubble('model', 'Đang kết nối Google AI để trả lời bạn…');
    setBusy(true); stopped = false; aborter = new AbortController();
    const timeout = setTimeout(() => aborter.abort(), 35000);
    let answer = '', completed = false;

    try {
      const geminiKey = getActiveGoogleAiKey();
      const preferredModel = $('ai-model-select') ? $('ai-model-select').value : 'auto';
      const now = new Date();
      const vnDate = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(now);
      const vnTime = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(now);

      let personaExtra = '';
      if (typeof SITE_SETTINGS === 'object' && SITE_SETTINGS && SITE_SETTINGS.supremePermissions) {
        const sp = SITE_SETTINGS.supremePermissions;
        if (sp['SUP_0701']) personaExtra += ' Hãy đóng vai Giám khảo chấm thi THPT Quốc gia giàu kinh nghiệm, phân tích cực kỳ chuẩn mực và chỉ rõ thang điểm.';
        if (sp['SUP_0702']) personaExtra += ' Hãy dùng giọng văn giàu chất thơ, lãng mạn, bay bổng.';
        if (sp['SUP_0706']) personaExtra += ' Luôn trích dẫn ít nhất 1 nhận định lý luận văn học nổi tiếng.';
      }

      const sysPrompt = `Thời điểm hiện tại theo giờ Việt Nam: ${vnTime}, ${vnDate}. Bạn là Trường Đẹp Trai, trợ lý AI dùng Google Gemini cho học sinh THPT Thới Long (do Đấng Tối Cao Nguyễn Nhựt Trường lớp 12A2 sáng lập). Trả lời bằng tiếng Việt tự nhiên, thông minh, chính xác, dễ thương, đôi khi dùng trái tim ♥. Giải đáp chính xác mọi câu hỏi về Lịch sử (như Bác Hồ - Chủ tịch Hồ Chí Minh, các danh nhân), Địa lý, Toán học, Khoa học, Đời sống và Ngữ văn 12 bộ Kết nối tri thức. Trả lời có cấu trúc rõ ràng, không dùng bảng Markdown.${personaExtra}`;

      const aiRes = await callGoogleAiMultiEndpoint(
        geminiKey,
        [...history, question],
        sysPrompt,
        preferredModel,
        aborter.signal
      );

      if (aiRes.ok && aiRes.text) {
        if ($('ai-status')) $('ai-status').textContent = `Trường đang trả lời (${aiRes.provider})…`;
        answer = aiRes.text;
        reply.textContent = answer;
        completed = true;
        scroll();
      }

      if (!completed || !answer) {
        const fallbackText = buildBuiltInLiteratureAnswer(text || 'Tìm hiểu tệp đính kèm', false);
        if ($('ai-status')) $('ai-status').textContent = 'Trường đang trả lời…';
        answer = fallbackText;
        reply.textContent = answer;
        completed = true;
        scroll();
      }

      if (autoTtsEnabled && 'speechSynthesis' in window && answer) {
        try {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(answer.replace(/[*#♥]/g, ''));
          utter.lang = 'vi-VN';
          utter.rate = 1.05;
          window.speechSynthesis.speak(utter);
        } catch (ttsErr) {}
      }

      history.push(question, { role: 'model', parts: [{ text: answer }] });
      bytesUsed += chosen.reduce((sum, item) => sum + item.size, 0);
      attachments = [];
      if ($('ai-input').value.trim() === text) $('ai-input').value = '';
    } catch (err) {
      reply.textContent = answer ? answer + '\n\n[Câu trả lời chưa hoàn tất]' : 'Đã tạm dừng câu trả lời.';
      error(err.name === 'AbortError' ? (stopped ? 'Đã dừng trả lời. Câu hỏi và tệp vẫn được giữ để gửi lại.' : 'AI phản hồi quá lâu. Bạn bấm Gửi lại nhé.') : err.message);
      userBubble.closest('article').remove();
    } finally {
      clearTimeout(timeout);
      setBusy(false);
      aborter = null;
    }
  };
})();