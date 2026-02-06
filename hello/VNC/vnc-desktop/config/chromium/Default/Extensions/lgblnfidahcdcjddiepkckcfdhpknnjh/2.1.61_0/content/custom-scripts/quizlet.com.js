"use strict";

['button[aria-label="Werbung schließen"]', 'button[aria-label="Skip ad"]', 'button[aria-label="Cerrar publicidad"]', 'button[aria-label="Fermer la publicité"]', 'button[aria-label="Tutup iklan"]', 'button[aria-label="Chiudi la pubblicità"]', 'button[aria-label="Advertentie negeren"]', 'button[aria-label="Odrzuć reklamę"]', 'button[aria-label="Fechar anúncio"]', 'button[aria-label="Закрыть рекламу"]', 'button[aria-label="Reklamı gösterme"]', 'button[aria-label="Пропустити рекламу"]', 'button[aria-label="Gỡ bỏ quảng cáo"]', 'button[aria-label="광고 제거"]', 'button[aria-label="移除广告"]', 'button[aria-label="移除廣告"]', 'button[aria-label="広告を退ける"]'].forEach(selector => {
  document.querySelector(selector)?.click();
});