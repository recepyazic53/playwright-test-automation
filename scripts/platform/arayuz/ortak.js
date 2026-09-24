// Platform arayüzü — ortak yardımcılar: API istemcisi, DOM oluşturucu, form bileşenleri.
// Kullanıcı verisi DOM'a YALNIZCA metin düğümü/özellik olarak yazılır (innerHTML kullanılmaz).

const tokenMeta = document.querySelector('meta[name="oturum-tokeni"]');
/** Sunucunun bu yanıta enjekte ettiği oturum token'ı (yalnızca bellekte tutulur). */
export const TOKEN = tokenMeta ? tokenMeta.getAttribute('content') || '' : '';
if (tokenMeta) tokenMeta.remove();

export class ApiHatasi extends Error {
  constructor(mesaj, durum, govde) {
    super(mesaj);
    this.durum = durum;
    this.govde = govde || {};
    this.kod = this.govde.kod || null;
    this.bekleSaniye = this.govde.bekleSaniye || null;
  }
}

/**
 * JSON API çağrısı (aynı köken). govde verilirse POST. 423 (kasa kilitli) olursa
 * "kasa-kilitli" olayı yayınlanır; kabuk kilit ekranına döner.
 */
export async function api(yol, secenekler = {}) {
  const istek = { method: secenekler.govde ? 'POST' : 'GET', headers: { 'X-Test-Sunucu-Token': TOKEN }, cache: 'no-store' };
  if (secenekler.govde) {
    istek.headers['Content-Type'] = 'application/json';
    istek.body = JSON.stringify(Object.assign({}, secenekler.govde, { token: TOKEN }));
  }
  let yanit;
  try {
    yanit = await fetch(yol, istek);
  } catch {
    throw new ApiHatasi('Sunucuya ulaşılamadı. Sunucunun çalıştığından emin olun (npm run baslat).', 0, {});
  }
  let veri = null;
  try { veri = await yanit.json(); } catch { veri = null; }
  if (!yanit.ok || (veri && veri.basarili === false)) {
    const hata = new ApiHatasi((veri && veri.mesaj) || `İstek başarısız oldu (${yanit.status}).`, yanit.status, veri);
    if (yanit.status === 423 && !secenekler.kilitOlayiYok) window.dispatchEvent(new CustomEvent('kasa-kilitli', { detail: hata.message }));
    throw hata;
  }
  return veri || {};
}

/**
 * DOM oluşturucu: h('button', { class: 'x', onclick: fn, disabled: true }, 'Metin', altOge)
 * Metinler her zaman metin düğümü olarak eklenir.
 */
export function h(etiket, ozellikler, ...cocuklar) {
  const el = document.createElement(etiket);
  for (const [ad, deger] of Object.entries(ozellikler || {})) {
    if (deger === undefined || deger === null || deger === false) continue;
    if (ad.startsWith('on') && typeof deger === 'function') el.addEventListener(ad.slice(2), deger);
    else if (ad === 'class') el.className = deger;
    else if (['value', 'checked', 'disabled', 'hidden', 'selected', 'indeterminate', 'required', 'multiple', 'readOnly'].includes(ad)) el[ad] = deger;
    else if (deger === true) el.setAttribute(ad, '');
    else el.setAttribute(ad, String(deger));
  }
  ekle(el, cocuklar);
  return el;
}

function ekle(el, cocuklar) {
  for (const c of cocuklar) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) ekle(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

let kimlikSayaci = 0;
export const yeniKimlik = (onEk = 'k') => `${onEk}-${++kimlikSayaci}`;

/** Kısa bildirim (ekran okuyucu için role=status bölgesinde). */
export function bildir(mesaj, tur = 'basari') {
  const kutu = document.getElementById('bildirimler');
  if (!kutu) return;
  const oge = h('div', { class: `bildirim ${tur === 'hata' ? 'hata' : ''}` }, mesaj);
  kutu.append(oge);
  setTimeout(() => oge.remove(), tur === 'hata' ? 8000 : 4000);
}

/** Etiketli form alanı. input'a id verilir, yardım metni aria-describedby ile bağlanır. */
export function alan(etiket, girdi, secenekler = {}) {
  const id = girdi.id || yeniKimlik('alan');
  girdi.id = id;
  const yardimId = secenekler.yardim ? `${id}-yardim` : null;
  const hataId = `${id}-hata`;
  const aciklamalar = [yardimId, hataId].filter(Boolean).join(' ');
  girdi.setAttribute('aria-describedby', aciklamalar);
  return h('div', { class: 'alan' },
    h('label', { for: id }, etiket, secenekler.zorunlu ? h('span', { class: 'soluk' }, ' (zorunlu)') : null),
    secenekler.icerik || girdi,
    yardimId ? h('div', { class: 'yardim', id: yardimId }, secenekler.yardim) : null,
    h('div', { class: 'alan-hatasi', id: hataId, role: 'alert' }));
}

/** Alanın altına hata yazar (boş mesaj = temizle). */
export function alanHatasi(girdi, mesaj) {
  const kutu = document.getElementById(`${girdi.id}-hata`);
  if (kutu) kutu.textContent = mesaj || '';
  if (mesaj) girdi.setAttribute('aria-invalid', 'true');
  else girdi.removeAttribute('aria-invalid');
}

/**
 * Parola/gizli değer alanı: type=password + "Göster" anahtarı. kayitli.dolu ise alan boş
 * bırakılırsa mevcut değer korunur; "Kayıtlı değeri göster" (gosterFn) açıkça istenince
 * sunucudan tek değeri alır.
 */
export function parolaAlani(etiket, secenekler = {}) {
  const girdi = h('input', {
    type: 'password', autocomplete: secenekler.otomatik || 'off', required: secenekler.zorunlu,
    name: secenekler.ad, spellcheck: 'false'
  });
  if (secenekler.kayitli && secenekler.kayitli.dolu) girdi.placeholder = `${secenekler.kayitli.maske} kayıtlı — değiştirmek için yazın`;
  const goster = h('button', { type: 'button', class: 'kucuk-dugme', 'aria-pressed': 'false' }, 'Göster');
  goster.addEventListener('click', () => {
    const acik = girdi.type === 'password';
    girdi.type = acik ? 'text' : 'password';
    goster.textContent = acik ? 'Gizle' : 'Göster';
    goster.setAttribute('aria-pressed', acik ? 'true' : 'false');
  });
  goster.setAttribute('aria-label', `${etiket}: ${'göster veya gizle'}`);
  const satir = h('div', { class: 'parola-satiri' }, girdi, goster);
  if (secenekler.kayitli && secenekler.kayitli.dolu && secenekler.gosterFn) {
    const kayitliGoster = h('button', { type: 'button', class: 'kucuk-dugme' }, 'Kayıtlı değeri göster');
    kayitliGoster.addEventListener('click', async () => {
      kayitliGoster.disabled = true;
      try {
        girdi.value = await secenekler.gosterFn();
        girdi.type = 'text';
        goster.textContent = 'Gizle';
        goster.setAttribute('aria-pressed', 'true');
        girdi.focus();
      } catch (hata) {
        alanHatasi(girdi, hata.message);
      } finally {
        kayitliGoster.disabled = false;
      }
    });
    satir.append(kayitliGoster);
  }
  const yardim = secenekler.yardim || (secenekler.kayitli && secenekler.kayitli.dolu ? 'Boş bırakırsanız kayıtlı değer korunur.' : null);
  return { kapsayici: alan(etiket, girdi, { yardim, zorunlu: secenekler.zorunlu, icerik: satir }), girdi };
}

/** İki adımlı onay: ilk tıklama düğmeyi "…onayla" durumuna getirir, 5 sn içinde ikinci tıklama çalıştırır. */
export function onayliDugme(metin, onayMetni, fn, secenekler = {}) {
  const dugme = h('button', { type: 'button', class: `tehlike ${secenekler.kucuk ? 'kucuk-dugme' : ''}`, 'aria-label': secenekler.etiket || metin }, metin);
  let zamanlayici = null;
  dugme.addEventListener('click', async () => {
    if (!dugme.classList.contains('onay-bekliyor')) {
      dugme.classList.add('onay-bekliyor');
      dugme.textContent = onayMetni;
      zamanlayici = setTimeout(() => { dugme.classList.remove('onay-bekliyor'); dugme.textContent = metin; }, 5000);
      return;
    }
    clearTimeout(zamanlayici);
    dugme.disabled = true;
    try { await fn(); } finally { dugme.disabled = false; dugme.classList.remove('onay-bekliyor'); dugme.textContent = metin; }
  });
  return dugme;
}

/** Form içi genel hata/bilgi kutusu. */
export function mesajKutusu() {
  const kutu = h('div', { role: 'alert', hidden: true });
  return {
    kutu,
    goster(mesaj, tur = 'hata') { kutu.className = `not-kutusu ${tur}`; kutu.textContent = mesaj; kutu.hidden = !mesaj; },
    temizle() { kutu.hidden = true; kutu.textContent = ''; }
  };
}

/** İşlem sürerken düğmeyi kilitler ve metnini değiştirir. */
export async function mesgulIken(dugme, metin, fn) {
  const eski = dugme.textContent;
  dugme.disabled = true;
  dugme.textContent = metin;
  dugme.setAttribute('aria-busy', 'true');
  try { return await fn(); } finally {
    dugme.disabled = false;
    dugme.textContent = eski;
    dugme.removeAttribute('aria-busy');
  }
}

/** Geri sayım: her saniye cb(kalan) çağrılır, 0'da biter. Durdurma fonksiyonu döner. */
export function geriSayim(saniye, cb) {
  let kalan = Math.max(0, Math.ceil(saniye));
  cb(kalan);
  if (kalan <= 0) return () => {};
  const z = setInterval(() => {
    kalan -= 1;
    cb(kalan);
    if (kalan <= 0) clearInterval(z);
  }, 1000);
  return () => clearInterval(z);
}

export const tarihMetni = (iso) => {
  if (!iso) return '—';
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? String(iso) : t.toLocaleString('tr-TR');
};

export const boyutMetni = (bayt) => {
  if (bayt < 1024) return `${bayt} B`;
  if (bayt < 1024 * 1024) return `${(bayt / 1024).toFixed(1)} KB`;
  if (bayt < 1024 * 1024 * 1024) return `${(bayt / 1024 / 1024).toFixed(1)} MB`;
  return `${(bayt / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

/** http(s) adres kontrolü. */
export function adresGecerliMi(metin) {
  try {
    const u = new URL(metin);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
