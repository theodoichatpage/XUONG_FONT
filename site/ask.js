// Hộp hỏi xác nhận ngay trong trang, thay cho window.confirm. Trình duyệt có thể chặn hộp thoại của trang sau vài
// lần hỏi liên tiếp; khi đó confirm() tự trả về "Hủy" mà không hiện gì, làm nút như bị liệt. Hộp này không bị chặn.
export function ask(message, { ok = 'Đồng ý', cancel = 'Hủy' } = {}) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'ask-dialog';
    const text = document.createElement('p');
    text.textContent = message;
    const row = document.createElement('div');
    row.className = 'tool-row';
    const yes = document.createElement('button'), no = document.createElement('button');
    yes.type = no.type = 'button';
    yes.className = 'primary';
    yes.textContent = ok;
    no.textContent = cancel;
    row.append(yes, no);
    dialog.append(text, row);
    // Trả lời ngay khi bấm; không chờ sự kiện close (có trường hợp trình duyệt không phát, làm nút bị kẹt).
    let done = false;
    const finish = answer => { if (done) return; done = true; if (dialog.open) dialog.close(); dialog.remove(); resolve(answer); };
    yes.addEventListener('click', () => finish(true));
    no.addEventListener('click', () => finish(false));
    dialog.addEventListener('close', () => finish(false));   // Esc
    document.body.append(dialog);
    dialog.showModal();
    yes.focus();
  });
}
