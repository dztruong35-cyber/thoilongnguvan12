// Always derive calendar facts from the server clock, never the model's training data.
const normalize = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().replace(/[?!.,]/g, '').replace(/\s+/g, ' ').trim();

export function clockContext(now = new Date(), timeZone = 'Asia/Ho_Chi_Minh') {
  const formatDate = (date) => new Intl.DateTimeFormat('vi-VN', {
    timeZone, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(date);
  const time = new Intl.DateTimeFormat('vi-VN', {
    timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(now);
  return {
    date: formatDate(now), time, timeZone,
    yesterday: formatDate(new Date(now.getTime() - 86400000)),
    tomorrow: formatDate(new Date(now.getTime() + 86400000)),
    instruction: `DỮ LIỆU ĐỒNG HỒ MÁY CHỦ MỚI NHẤT cho lượt hỏi này: UTC=${now.toISOString()}; múi giờ mặc định=${timeZone} (giờ Việt Nam, UTC+07:00); hiện tại=${time}, ${formatDate(now)}; hôm qua=${formatDate(new Date(now.getTime() - 86400000))}; ngày mai=${formatDate(new Date(now.getTime() + 86400000))}. Đây là thời điểm nhận câu hỏi, không phải đồng hồ chạy trực tiếp. Khi người dùng không nêu địa điểm/múi giờ, dùng giờ Việt Nam và ghi rõ múi giờ. Nếu họ hỏi nơi khác, chuyển từ mốc UTC trên theo múi giờ của nơi đó, tính cả giờ mùa hè; hỏi lại nếu địa điểm mơ hồ. Không suy đoán ngày hiện tại từ kiến thức huấn luyện hoặc câu trả lời cũ trong lịch sử. Phân biệt ngày dương lịch và âm lịch; không tự bịa ngày âm khi chưa có công cụ chuyển đổi đáng tin cậy.`,
  };
}

// Only intercept standalone clock questions. Homework, quotations and mixed questions go to AI.
export function clockAnswer(text, clock) {
  const question = normalize(text).replace(/^(?:cho (?:minh|toi|em) hoi |ban oi |truong oi )/, '').replace(/ (?:vay|the|nhi|nhe|a|ha|di|voi|khong)$/, '');
  const dateQuestion = /^(?:(?:hom nay|bay gio|hien tai|luc nay) (?:la |thu |ngay |thang |nam )*(?:may|bao nhieu)(?: thu| ngay| thang| nam)*|(?:hom nay|bay gio|hien tai) la (?:thu|ngay|thang|nam) (?:may|bao nhieu)|(?:thu|ngay|thang|nam) (?:may|bao nhieu) (?:roi|hom nay)|hom nay ngay may thang may nam may)$/;
  const timeQuestion = /^(?:(?:bay gio|hien tai|luc nay) (?:la |dang )?(?:may gio|bao nhieu gio|gio may)(?: roi)?|may gio(?: roi)?|gio hien tai|thoi gian hien tai)$/;
  const combined = /^(?:hom nay|hien tai|bay gio) (?:la )?thu may ngay may thang may nam (?:may|bao nhieu)(?: may gio)?$/;
  if (dateQuestion.test(question) || timeQuestion.test(question) || combined.test(question)) {
    return `Theo giờ Việt Nam (Asia/Ho_Chi_Minh, UTC+07:00), lúc nhận câu hỏi là ${clock.time}, ${clock.date}.`;
  }
  if (/^(?:ngay mai|hom qua) (?:la )?(?:thu|ngay) may$/.test(question)) {
    return `${question.startsWith('ngay mai') ? 'Ngày mai' : 'Hôm qua'} là ${question.startsWith('ngay mai') ? clock.tomorrow : clock.yesterday} (giờ Việt Nam, UTC+07:00).`;
  }
  return null;
}
