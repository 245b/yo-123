"use strict";

{
  const fn = debounce(() => {
    const btn = document.querySelector('[role="dialog"] button[tabindex]:nth-of-type(2)');
    if (btn?.textContent?.toLowerCase().search(/webkoekie|cookie|رفض ملفات تعريف الارتباط الاختيارية|رد کردن کوکی‌های اختیاری|evästeet|선택 가능 쿠키 거부|kuki|informasjonskapsler|ปฏิเสธคุกกี้ที่ไม่จำเป็น|çerezleri|ঐচ্ছিক কুকি অস্বীকার করুন|વૈકલ્પિક કૂકી નકારો|ऑप्शनल कुकीज़ की परमिशन न दें|kolačiće|ಐಚ್ಛಿಕ ಕುಕೀಗಳನ್ನು ನಿರಾಕರಿಸಿ|ഓപ്ഷണൽ കുക്കികൾ നിരസിക്കുക|ऐच्छिक कुकीजना नकार द्या|ऐच्छिक कुकीहरू अस्वीकार गर्नुहोस्|ਵਿਕਲਪਿਕ ਕੂਕੀਜ਼ ਨੂੰ ਅਸਵੀਕਾਰ ਕਰੋ|අත්‍යාවශ්‍ය නොවන කුකී ප්‍රතික්ෂේප කරන්න|விருப்பத்தேர்வுக்குரிய குக்கீகளை நிராகரியுங்கள்|ఐచ్ఛిక కుక్కీలను తిరస్కరించండి|اختیاری کوکیز کو مسترد کریں|бисквитки|témoin|колачиће/) !== -1) {
      btn?.click();
    }
  }, 100);
  new MutationObserver(fn).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}