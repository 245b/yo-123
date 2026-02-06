"use strict";

{
  const fn = debounce(() => {
    const btns = document.querySelectorAll('[data-testid="cookie-policy-manage-dialog"] div[role="button"]');
    Array.from(btns)?.find(btn => btn.textContent && ['Tolak cookie opsional', 'Afvis valgfrie cookies', 'Optionale Cookies ablehnen', 'Decline optional cookies', 'Rechazar cookies opcionales', 'Refuser les cookies optionnels', 'Rifiuta cookie facoltativi', 'A nem kötelező cookie-k elutasítása', 'Optionele cookies afwijzen', 'Avvis valgfrie informasjonskapsler', 'Odrzuć opcjonalne pliki cookie', 'Recusar cookies opcionais', 'Refuză modulele cookie opţionale', 'Hylkää valinnaiset evästeet', 'Neka valfria cookies', 'Từ chối cookie không bắt buộc', 'İsteğe bağlı çerezleri reddet', 'Odmítnout volitelné soubory cookie', 'Απόρριψη προαιρετικών cookies', 'Отклонить необязательные файлы cookie', 'דחיית קובצי Cookie אופציונליים', 'رفض ملفات تعريف الارتباط الاختيارية', 'ऑप्शनल कुकीज़ की परमिशन न दें', 'ปฏิเสธคุกกี้ที่ไม่จำเป็น', '拒絕選用 Cookie', '拒绝使用非必要 Cookie', '拒絕選用的 Cookie', '任意のCookieを許可しない', '선택 가능 쿠키 거부'].includes(btn.textContent?.trim()))?.click();
  }, 100);
  new MutationObserver(fn).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}