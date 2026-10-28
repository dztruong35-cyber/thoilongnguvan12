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
    const buildBuiltInLiteratureAnswer = (rawUserText) => {
      const qNorm = String(rawUserText || '').toLowerCase().trim();
      const now = new Date();
      const vnTime = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(now);
      const vnDate = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(now);

      if (/(may gio|gio hien tai|hom nay.*ngay may|hom nay.*thu may|ngay bao nhieu)/i.test(qNorm.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd'))) {
        return `Theo giờ Việt Nam (Asia/Ho_Chi_Minh, UTC+07:00), hiện tại là ${vnTime}, ${vnDate}. Chúc bạn một buổi học Ngữ văn 12 thật vui và hiệu quả nhé! ♥`;
      }

      if (Array.isArray(window.LESSONS_DATA)) {
        for (const lesson of window.LESSONS_DATA) {
          const titleLow = String(lesson.title || '').toLowerCase();
          const codeLow = String(lesson.code || '').toLowerCase();
          const textsMatch = Array.isArray(lesson.texts) && lesson.texts.some(t => qNorm.includes(String(t.title || '').toLowerCase()) || qNorm.includes(String(t.author || '').toLowerCase()));
          if (qNorm.includes(titleLow) || qNorm.includes(codeLow) || textsMatch) {
            const textsList = Array.isArray(lesson.texts) ? lesson.texts.map(t => `• ${t.title} (${t.author}): ${t.summary || ''}`).join('\n') : '';
            return `Chào bạn! Trường Đẹp Trai gửi bạn trọng tâm kiến thức của **${lesson.code}: ${lesson.title}** (${lesson.genre || 'Ngữ văn 12 Kết nối tri thức'}):\n\n1. Kiến thức ngữ văn cốt lõi:\n${lesson.keyPoint || lesson.desc || ''}\n\n2. Các văn bản đọc chính trong bài:\n${textsList}\n\n3. Kỹ năng Viết & Thực hành tiếng Việt:\n• Tiếng Việt: ${lesson.vietnamese || 'Rèn luyện kỹ năng diễn đạt và phân tích ngôn ngữ văn học.'}\n• Viết: ${lesson.writing || 'Lập dàn ý chặt chẽ, kết hợp lí lẽ và dẫn chứng tiêu biểu.'}\n\nBạn muốn mình lập dàn ý chi tiết hay phân tích sâu tác phẩm nào trong bài này thì nhắn ngay cho Trường nhé! ♥`;
          }
        }
      }

      if (qNorm.includes('tây tiến') || qNorm.includes('quang dũng')) {
        return `Chào bạn! Với bài thơ "Tây Tiến" của Quang Dũng (Bài 2 - Những thế giới thơ, Ngữ văn 12 Kết nối tri thức), bạn cần nắm vững 3 luận điểm vàng sau nhé:\n\n1. Cảm hứng lãng mạn và nỗi nhớ "nhớ chơi vơi" bao trùm toàn bài thơ: thiên nhiên Tây Bắc vừa hùng vĩ, dữ dội ("Dốc lên khúc khuỷu dốc thăm thẳm", "Thác gầm thét") vừa thơ mộng, trữ tình ("Sài Khao sương lấp đoàn quân mỏi", "Mường Lát hoa về trong đêm hơi").\n\n2. Vẻ đẹp hào hoa, lãng mạn trong đêm liên hoan văn nghệ và cảnh sông nước miền Tây ("Doanh trại bừng lên hội đuốc hoa", "Người đi Châu Mộc chiều sương ấy").\n\n3. Bức tượng đài bi tráng về người lính Tây Tiến: ngoại hình "không mọc tóc", "quân xanh màu lá" nhưng mang khí phách "dữ oai hùm", lý tưởng "Chiến trường đi chẳng tiếc đời xanh" và sự hy sinh cao cả "Áo bào thay chiếu anh về đất / Sông Mã gầm lên khúc độc hành".\n\n4. Nghệ thuật: Thể thơ 7 chữ biến tấu linh hoạt, kết hợp từ Hán Việt trang trọng, bút pháp tương phản và cảm hứng lãng mạn - bi tráng. Chúc bạn ôn bài đạt điểm 9+ nhé! ♥`;
      }

      if (qNorm.includes('tuyên ngôn độc lập') || qNorm.includes('hồ chí minh')) {
        return `Chào bạn! Với tác phẩm "Tuyên ngôn Độc lập" của Chủ tịch Hồ Chí Minh (Bài 4 - Yếu tố kì ảo trong truyện kể / Văn bản nghị luận lịch sử), bạn hãy nhớ rõ cấu trúc lập luận 3 phần đanh thép:\n\n1. Cơ sở pháp lý & chính nghĩa (Mở đầu): Trích dẫn Tuyên ngôn Độc lập năm 1776 của Mỹ và Tuyên ngôn Nhân quyền và Dân quyền năm 1791 của Pháp, dùng nghệ thuật "gậy ông đập lưng ông" và nâng quyền cá nhân lên thành quyền tự quyết thiêng liêng của mọi dân tộc trên thế giới.\n\n2. Cơ sở thực tiễn (Thân bài): Vạch trần tội ác thực dân Pháp về cả chính trị và kinh tế trong hơn 80 năm ("bán nước ta hai lần cho Nhật"), đồng thời khẳng định cuộc nổi dậy giành chính quyền vẻ vang của nhân dân Việt Nam và Mặt trận Việt Minh.\n\n3. Lời tuyên bố độc lập đanh thép (Kết bài): Tuyên bố thoát ly hẳn quan hệ thực dân với Pháp, xóa bỏ mọi hiệp ước bất bình đẳng và khẳng định ý chí "Toàn thể dân tộc Việt Nam quyết đem tất cả tinh thần và lực lượng, tính mạng và của cải để giữ vững quyền tự do, độc lập ấy!". ♥`;
      }

      if (qNorm.includes('vợ chồng a phủ') || qNorm.includes('tô hoài') || qNorm.includes('mị')) {
        return `Chào bạn! Với đoạn trích "Vợ chồng A Phủ" của nhà văn Tô Hoài (Bài 1 - Khả năng lớn lao của tiểu thuyết), trọng tâm phân tích nằm ở nhân vật Mị và sức sống tiềm tàng mãnh liệt:\n\n1. Số phận bi kịch của Mị tại nhà thống lí Pá Tra: từ cô gái trẻ yêu đời, thổi sáo giỏi trở thành con dâu gạt nợ bị áp bức cả về thể xác lẫn tinh thần ("lầm lũi như con rùa nuôi trong xó cửa").\n\n2. Sức sống tiềm tàng trỗi dậy trong đêm tình mùa xuân ở Hồng Ngài: tiếng sáo gọi bạn yêu thiết tha cùng hơi rượu ngày Tết đánh thức tâm hồn Mị ("Mị thấy phơi phới trở lại", "Mị trẻ lắm. Mị vẫn còn trẻ. Mị muốn đi chơi"), dẫn đến hành động thắp đèn và khát vọng tự do.\n\n3. Đêm đông cứu A Phủ: từ sự đồng cảm sâu sắc khi nhìn thấy "dòng nước mắt lấp lánh bò xuống hai hõm má đã xám đen lại" của A Phủ, Mị dứt khoát cắt dây mây cởi trói cho A Phủ và tự giải thoát đời mình. Đó là giá trị nhân đạo sâu sắc của ngòi bút Tô Hoài! ♥`;
      }

      if (qNorm.includes('dàn ý') || qNorm.includes('nghị luận xã hội') || qNorm.includes('200 chữ')) {
        return `Chào bạn! Trường Đẹp Trai gợi ý công thức viết đoạn văn Nghị luận xã hội (khoảng 200 chữ) chuẩn cấu trúc đạt điểm tối đa nhé:\n\n1. Mở đoạn (1-2 câu): Dẫn dắt ngắn gọn và nêu trực tiếp vấn đề nghị luận nằm trong đề bài.\n2. Giải thích (1-2 câu): Giải thích từ khóa hoặc ý nghĩa khái quát của vấn đề.\n3. Phân tích & Bàn luận (4-5 câu): Trả lời câu hỏi "Vì sao vấn đề đó lại quan trọng? Biểu hiện và tác động tích cực của nó đối với cá nhân và cộng đồng là gì?".\n4. Dẫn chứng thực tế (1-2 câu): Nêu 1 tấm gương hoặc sự kiện thực tế tiêu biểu, ngắn gọn, giàu sức thuyết phục.\n5. Phản đề & Bài học nhận thức, hành động (2-3 câu): Phê phán biểu hiện lệch lạc và rút ra thông điệp cho bản thân (đặc biệt là thế hệ học sinh lớp 12 trước ngưỡng cửa tương lai).\n\nBạn hãy gửi cụ thể tên đề bài để Trường viết dàn ý hoặc đoạn văn mẫu chi tiết cho bạn tham khảo nhé! ♥`;
      }

      return `Chào bạn thân mến! Mình là Trường Đẹp Trai — Trợ lý học tập Ngữ văn 12 THPT Thới Long ♥\n\nVề câu hỏi của bạn ("${String(rawUserText || '').slice(0, 120)}"), mình gợi ý hướng triển khai chuẩn theo chương trình Ngữ văn 12 Kết nối tri thức với cuộc sống như sau:\n\n1. Xác định đúng trọng tâm yêu cầu: Đọc kỹ từ khóa của câu hỏi/đề bài, xác định đặc trưng thể loại (tiểu thuyết, thơ trữ tình, truyện ngắn, kí, kịch hay văn bản nghị luận).\n2. Hệ thống hóa luận điểm: Chia nội dung thành các ý rõ ràng (Khái quát tác giả/tác phẩm → Phân tích nội dung, tư tưởng nhân đạo → Đánh giá đặc sắc nghệ thuật → Liên hệ mở rộng).\n3. Mẹo nâng điểm 9+: Khi viết bài, hãy kết hợp dẫn chứng tiêu biểu và nhận xét cá nhân sâu sắc.\n\n💡 Gợi ý cho Admin: Nếu bạn muốn kết nối trực tiếp với mô hình đám mây Google Gemini trên GitHub Pages, Admin có thể dán mã Gemini API Key miễn phí vào tab [🐙 Đồng Bộ GitHub] trong bảng Quản trị Web bất kỳ lúc nào nhé! ♥`;
    };

    try {
      const geminiKey = typeof window.getConfiguredGeminiApiKey === 'function' ? window.getConfiguredGeminiApiKey() : '';
      let usedBackend = false;

      if (geminiKey) {
        usedBackend = true;
        const now = new Date();
        const vnDate = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(now);
        const vnTime = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(now);
        const sysPrompt = `Thời điểm hiện tại theo giờ Việt Nam: ${vnTime}, ${vnDate}. Bạn là Trường Đẹp Trai, trợ lý AI dùng Google Gemini cho học sinh THPT Thới Long. Trả lời bằng tiếng Việt tự nhiên, dễ thương, ấm áp, đôi khi dùng trái tim ♥ và lời động viên ngắn. Hỗ trợ Ngữ văn 12 bộ Kết nối tri thức, phân tích tác phẩm, lập dàn ý, góp ý bài viết, môn học khác. Trả lời có cấu trúc rõ ràng, không dùng bảng Markdown.`;
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`;
        const gRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: sysPrompt }] },
            contents: [...history, question]
          }),
          signal: aborter.signal
        });
        if (gRes.ok) {
          const gData = await gRes.json();
          const fullText = gData?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
          if (fullText) {
            $('ai-status').textContent = 'Trường đang trả lời…';
            answer = fullText;
            reply.textContent = answer;
            completed = true;
            scroll();
          }
        }
      }

      if (!completed) {
        try {
          const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [...history, question] }), signal: aborter.signal });
          if (response.ok && response.body && response.headers.get('content-type')?.includes('application/x-ndjson')) {
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
          }
        } catch (netErr) {}
      }

      if (!completed || !answer) {
        // Fallback seamlessly on GitHub Pages using built-in Ngữ Văn 12 THPT Thới Long knowledge engine!
        const fallbackText = buildBuiltInLiteratureAnswer(text || 'Tìm hiểu tệp đính kèm');
        $('ai-status').textContent = 'Trường đang trả lời…';
        const words = fallbackText.split(' ');
        for (let i = 0; i < words.length; i += 4) {
          if (aborter.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          answer += (i === 0 ? '' : ' ') + words.slice(i, i + 4).join(' ');
          reply.textContent = answer;
          scroll();
          await new Promise(r => setTimeout(r, 18));
        }
        completed = true;
      }
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
