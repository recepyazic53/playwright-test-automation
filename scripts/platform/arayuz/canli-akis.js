// CANLI GÖRÜNTÜ (ortak bileşen) — koşu / Deneme paneli ve hızlı test "Tarayıcıda şu an" kartı.
//
// Koşan tarayıcının kareleri sunucunun SSE ucundan (text/event-stream; koşu: /canli-akis, hızlı test: /platform/hizli-test/canli-akis)
// fetch akışıyla okunur — token BAŞLIKTA gider (EventSource başlık taşıyamaz; adres çubuğuna / geçmişe token düşmez). Kare <img>'de
// data: adresiyle anında güncellenir (CSP: img-src 'self' data:). Sunucu tarafında kaynak CDP screencast'tir (tests/support/canli-yayin.ts);
// bileşen kapanınca (durdur() ya da DOM'dan çıkınca) bağlantı kesilir → izleyici kalmazsa screencast durur.
// Akış yoksa / kurulamazsa (Chromium dışı tarayıcı, hata) aralıklı görüntüye düşülür ve küçük bir not gösterilir.
// Kutuda: "Canlı" göstergesi, son karenin zamanı, "Büyüt" (büyük pencere) ve isteğe bağlı "Tarayıcıyı göster".
import { h, ikon, TOKEN } from './ortak.js';

/** Aralıklı görüntü (yedek) yoklama aralığı (ms). */
const YEDEK_ARALIK_MS = 1200;
/** Art arda bu kadar bağlantı hatasında yedeğe düşülür. */
const EN_COK_HATA = 3;

/** Blob → data: adresi (CSP blob: görüntüye izin vermez). @param {Blob} b @returns {Promise<string>} */
const dataAdresi = (b) => new Promise((coz, reddet) => {
  const r = new FileReader();
  r.onload = () => coz(String(r.result));
  r.onerror = () => reddet(r.error);
  r.readAsDataURL(b);
});

/**
 * Çalışan koşunun aralıklı ekran görüntüsü (yedek yol; /canli). Kare yoksa (204) null. @param {string} kosuId @returns {Promise<string | null>}
 */
export async function kosuYedekKaresi(kosuId) {
  try {
    const r = await fetch(`/canli?kosuId=${encodeURIComponent(kosuId)}`, { headers: { 'X-Test-Sunucu-Token': TOKEN }, cache: 'no-store' });
    if (r.status !== 200) return null;
    const b = await r.blob();
    return b.size ? await dataAdresi(b) : null;
  } catch {
    return null;
  }
}

const saat = (ms) => new Date(ms).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * Canlı görüntü kutusu.
 * @param {{ akisAdresi: string; etiket: string; yedekKareAl?: (() => Promise<string | null>) | null; ilkGoruntu?: string | null;
 *   tarayiciyiGoster?: (() => Promise<{ basarili: boolean; mesaj: string }>) | null; bekleniyorMetni?: string }} s
 *   akisAdresi: SSE adresi (sorgu dizesiyle; "en" eklenir). yedekKareAl: aralıklı görüntü (data: adresi). ilkGoruntu: ilk kare gelene
 *   kadar gösterilecek görüntü (data: adresi). tarayiciyiGoster: "Tarayıcıyı göster" düğmesi (yoksa düğme çizilmez).
 * @returns {{ el: HTMLElement; durdur: () => void; goruntuVer: (src: string | null) => void }}
 */
export function canliGoruntu(s) {
  const img = h('img', { class: 'canli-akis-karesi', alt: s.etiket, hidden: true, decoding: 'async' });
  const bos = h('div', { class: 'medya-bos canli-akis-bos' }, h('span', { class: 'donen-halka', 'aria-hidden': 'true' }), s.bekleniyorMetni || 'Canlı görüntü bekleniyor…');
  const alan = h('div', { class: 'canli-akis-alani' }, bos, img);
  const gosterge = h('span', { class: 'canli-akis-gostergesi', 'data-durum': 'baglaniyor' }, h('i', { 'aria-hidden': 'true' }), h('span', {}, 'Bağlanıyor…'));
  const zaman = h('span', { class: 'canli-akis-zamani soluk' }, '');
  const not = h('p', { class: 'canli-akis-notu soluk kucuk', role: 'status', 'aria-live': 'polite', hidden: true });
  const buyut = h('button', { type: 'button', class: 'kucuk-dugme hayalet canli-akis-buyut', 'aria-label': 'Canlı görüntüyü büyüt', title: 'Büyük pencerede aç' }, ikon('ekran'), h('span', {}, 'Büyüt'));
  const goster = s.tarayiciyiGoster ? h('button', { type: 'button', class: 'kucuk-dugme canli-akis-goster', title: 'Koşan tarayıcı penceresini öne getirir' }, ikon('gorunum'), h('span', {}, 'Tarayıcıyı göster')) : null;
  const el = h('div', { class: 'canli-akis goruntuleyici', 'data-durum': 'baglaniyor', 'data-kare-sayisi': '0' },
    h('div', { class: 'canli-akis-cubugu' }, gosterge, zaman, h('span', { class: 'bosluk' }), goster, buyut),
    alan, not);

  let durdu = false;
  /** @type {AbortController | null} */
  let ac = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let yedekZamanlayici = null;
  let kip = 'akis';
  let kareSayisi = 0;
  /** Son 2 sn'deki kare zamanları (kare hızı). @type {number[]} */
  const sonKareler = [];
  let gecikmeToplam = 0;
  let gecikmeSayisi = 0;
  let disaridaSayac = 0;
  /** Bağlantı bilerek kesildi (Büyüt: daha geniş kareyle yeniden bağlan) — hata sayılmaz. */
  let kasitliKesme = false;

  const durumYaz = (/** @type {string} */ d, /** @type {string} */ metin) => {
    el.dataset.durum = d;
    gosterge.dataset.durum = d;
    gosterge.lastChild.textContent = metin;
  };
  const notYaz = (/** @type {string} */ m) => { not.hidden = !m; not.textContent = m; };
  // Çift tampon: yeni kare önce görünmez bir Image'da çözülür, hazır olunca gösterilene konur. Doğrudan img.src değiştirmek çözme
  // sırasında kutunun koyu zeminini bir an gösterir (siyah yanıp sönme). Yalnız en son kare konur; geride kalan atlanır.
  let kareSirasi = 0;
  const goruntuKoy = (/** @type {string} */ src, /** @type {number} */ zamanMs) => {
    const sira = ++kareSirasi;
    const yeni = new Image();
    yeni.src = src;
    yeni.decode().catch(() => undefined).then(() => {
      if (sira !== kareSirasi) return;
      img.src = src;
      if (img.hidden) { img.hidden = false; bos.remove(); }
      zaman.textContent = `Son kare ${saat(zamanMs)}`;
      zaman.title = new Date(zamanMs).toLocaleString('tr-TR');
    });
  };
  if (s.ilkGoruntu) goruntuKoy(s.ilkGoruntu, Date.now());

  /** @param {string} ad @param {string} veri */
  const olayIsle = (ad, veri) => {
    let d;
    try { d = JSON.parse(veri); } catch { return; }
    if (ad === 'kare' && d && typeof d.v === 'string') {
      const simdi = Date.now();
      kareSayisi += 1;
      sonKareler.push(simdi);
      while (sonKareler.length && simdi - sonKareler[0] > 2000) sonKareler.shift();
      const gecikme = typeof d.t === 'number' ? Math.max(0, simdi - d.t) : 0;
      gecikmeToplam += gecikme;
      gecikmeSayisi += 1;
      el.dataset.kareSayisi = String(kareSayisi);
      el.dataset.kareHizi = (sonKareler.length / 2).toFixed(1);
      el.dataset.gecikmeMs = String(Math.round(gecikme));
      el.dataset.ortGecikmeMs = String(Math.round(gecikmeToplam / gecikmeSayisi));
      goruntuKoy(`data:image/jpeg;base64,${d.v}`, typeof d.t === 'number' ? d.t : simdi);
      if (el.dataset.durum !== 'akis') durumYaz('akis', 'Canlı');
      return;
    }
    if (ad !== 'durum' || !d) return;
    if (d.durum === 'yedek') { yedegeGec(typeof d.neden === 'string' ? d.neden : ''); return; }
    if (d.durum === 'bitti') { durumYaz('bitti', 'Bitti'); durdurIc(); return; }
    if (d.durum === 'bekleniyor' && !kareSayisi) durumYaz('baglaniyor', 'Bağlanıyor…');
    if ((d.durum === 'akis' || d.durum === 'baglandi' || d.durum === 'sayfa') && el.dataset.durum === 'baglaniyor') durumYaz('akis', 'Canlı');
  };

  const enIste = () => {
    const dpr = window.devicePixelRatio || 1;
    const genislik = (alan.clientWidth || 640) * dpr;
    return Math.round(Math.max(320, Math.min(1600, genislik)));
  };

  async function akisiOku() {
    let hata = 0;
    while (!durdu && kip === 'akis') {
      ac = new AbortController();
      const kareOnce = kareSayisi;
      try {
        const ayrac = s.akisAdresi.includes('?') ? '&' : '?';
        const r = await fetch(`${s.akisAdresi}${ayrac}en=${enIste()}`, { headers: { 'X-Test-Sunucu-Token': TOKEN, Accept: 'text/event-stream' }, cache: 'no-store', signal: ac.signal });
        if (!r.ok || !r.body || !/text\/event-stream/.test(r.headers.get('content-type') || '')) throw new Error(`HTTP ${r.status}`);
        const okuyucu = r.body.getReader();
        const cozucu = new TextDecoder();
        let tampon = '';
        for (;;) {
          const { value, done } = await okuyucu.read();
          if (done || durdu) break;
          tampon += cozucu.decode(value, { stream: true });
          let i;
          while ((i = tampon.indexOf('\n\n')) >= 0) {
            const parca = tampon.slice(0, i);
            tampon = tampon.slice(i + 2);
            let ad = 'message';
            const veri = [];
            for (const satir of parca.split('\n')) {
              if (satir.startsWith('event:')) ad = satir.slice(6).trim();
              else if (satir.startsWith('data:')) veri.push(satir.slice(5).replace(/^ /, ''));
            }
            if (veri.length) olayIsle(ad, veri.join('\n'));
            if (durdu || kip !== 'akis') { ac.abort(); break; }
          }
        }
        if (kareSayisi > kareOnce) hata = 0;
      } catch {
        if (durdu || kip !== 'akis') return;
        if (kasitliKesme) kasitliKesme = false;
        else hata += 1;
        if (hata >= EN_COK_HATA) { yedegeGec('Sürekli akış alınamadı.'); return; }
      }
      if (durdu || kip !== 'akis') return;
      await new Promise((coz) => setTimeout(coz, hata ? 1000 : 400));
    }
  }

  /** @param {string} neden */
  function yedegeGec(neden) {
    if (kip === 'yedek' || durdu) return;
    kip = 'yedek';
    ac?.abort();
    durumYaz('yedek', 'Aralıklı');
    notYaz(s.yedekKareAl
      ? `Sürekli akış kullanılamıyor; aralıklı görüntü gösteriliyor (yaklaşık ${Math.round(YEDEK_ARALIK_MS / 100) / 10} sn'de bir).`
      : 'Sürekli akış kullanılamıyor; son görüntü gösteriliyor.');
    if (neden) not.title = neden;
    if (!s.yedekKareAl) return;
    const yokla = async () => {
      if (durdu) return;
      const src = await s.yedekKareAl?.().catch(() => null);
      if (durdu) return;
      if (src) {
        kareSayisi += 1;
        el.dataset.kareSayisi = String(kareSayisi);
        goruntuKoy(src, Date.now());
      }
      yedekZamanlayici = setTimeout(yokla, YEDEK_ARALIK_MS);
    };
    void yokla();
  }

  function durdurIc() {
    if (durdu) return;
    durdu = true;
    ac?.abort();
    if (yedekZamanlayici) clearTimeout(yedekZamanlayici);
    clearInterval(bekci);
    if (dialog?.open) dialog.close();
  }

  // Sahibi durdurmayı unutursa: kutu DOM'dan çıkalı 2 sn olunca bağlantı kesilir (panel kapandı / sayfa değişti).
  const bekci = setInterval(() => {
    if (el.isConnected || (dialog && dialog.isConnected)) { disaridaSayac = 0; return; }
    disaridaSayac += 1;
    if (disaridaSayac >= 2) durdurIc();
  }, 1000);

  // --- Büyüt: büyük pencere (dialog); görüntü alanı pencereye taşınır, kapanınca geri döner ---
  /** @type {HTMLDialogElement | null} */
  let dialog = null;
  buyut.addEventListener('click', () => {
    if (dialog?.open) return;
    const kapat = h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': 'Büyük görüntüyü kapat', title: 'Kapat' }, ikon('carpi'));
    dialog = /** @type {HTMLDialogElement} */ (h('dialog', { class: 'canli-akis-buyuk', 'aria-label': `Büyük canlı görüntü: ${s.etiket}` },
      h('div', { class: 'canli-akis-buyuk-cubugu' }, gosterge.cloneNode(true), h('span', { class: 'bosluk' }), kapat)));
    const yer = h('div', { class: 'canli-akis-yer-tutucu' });
    alan.replaceWith(yer);
    dialog.append(alan);
    kapat.addEventListener('click', () => dialog?.close());
    dialog.addEventListener('close', () => {
      yer.replaceWith(alan);
      dialog?.remove();
      dialog = null;
      buyut.focus();
    });
    document.body.append(dialog);
    dialog.showModal();
    kapat.focus();
    // Büyük pencerede daha geniş kare istenir (akış yeniden bağlanır; screencast genişliği değişir).
    if (kip === 'akis' && ac) { kasitliKesme = true; ac.abort(); }
  });

  goster?.addEventListener('click', async () => {
    if (!s.tarayiciyiGoster) return;
    goster.disabled = true;
    try {
      const y = await s.tarayiciyiGoster();
      notYaz(y.mesaj);
      not.dataset.tur = y.basarili ? 'basari' : 'bilgi';
    } catch (e) {
      notYaz(e instanceof Error ? e.message : String(e));
      not.dataset.tur = 'hata';
    } finally { goster.disabled = false; }
  });

  void akisiOku();
  return {
    el,
    durdur: durdurIc,
    // Sahibin verdiği son görüntü (hızlı test: oturum durumundaki görüntü) — yalnız akış kare vermiyorsa gösterilir.
    goruntuVer: (src) => { if (src && (kip === 'yedek' || !kareSayisi)) goruntuKoy(src.startsWith('data:') ? src : `data:image/jpeg;base64,${src}`, Date.now()); }
  };
}
