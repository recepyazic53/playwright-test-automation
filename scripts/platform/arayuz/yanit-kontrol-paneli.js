// "Son yanıttan kontrol öner" (servis senaryo düzenleyicisi > Kontroller): son Dene ya da koşu yanıtı alan listesi olarak açılır; kullanıcı bir
// alanın satırında işleci (eşittir, içerir, var, yok, desen, sayısal aralık) seçip "Ekle" der. Önerilen işleç değerin biçiminden gelir
// (yanit-kontrolleri.mjs > kontrolOnerisi). Gizli adlı ya da maskeli alanda DEĞER GÖSTERİLMEZ ve yazılmaz: yalnız "var" ya da desen.
// "Altın yanıt": alanlar karşılaştırılır / yok sayılır (tarih, kimlik gibi her koşuda değişenler varsayılan olarak yok sayılır; gizli alanın
// yalnız yolu yapıda kalır). "Yanıt süresi": yanıt en çok N ms. Hiçbir şey kendiliğinden eklenmez; eklenen kontrol senaryo kaydedilince yazılır.
// Panel istek atmaz: yanıt kayıtlı koşudan (maskeli) okunur. Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { api, bildir, h, ikon, iskelet, rozet, tarihMetni, yerlestir } from './ortak.js';
import { gizliAdMi } from './gizli-adlar.mjs';
import { ISLEC_ETIKETLERI, KONTROL_ISLECLERI, altinYanitOlustur, degiskenMi, kontrolOnerisi, sayiOku, yanitAlanlari } from './yanit-kontrolleri.mjs';

const q = encodeURIComponent;
const GIZLI_ISLECLER = ['var', 'desen'];

/**
 * Kayıtlı koşulardan senaryonun yanıtı olan son çalıştırması (Dene ya da koşu). Yoksa null.
 * @param {{ id: string }} proje @param {string} servisId @param {string} senaryoId
 */
export async function sonYanitliKosu(proje, servisId, senaryoId) {
  const { kosular } = await api(`/platform/servis/kosular?projeId=${q(proje.id)}&servisId=${q(servisId)}&senaryoId=${q(senaryoId)}&sinir=10`);
  for (const k of kosular) {
    const { kosu } = await api(`/platform/servis/kosu?projeId=${q(proje.id)}&id=${q(k.id)}`);
    if (kosu && typeof kosu.sonuc?.yanit === 'string' && kosu.sonuc.yanit && !kosu.sonuc.hata) return kosu;
  }
  return null;
}

/**
 * Paneli çizer.
 * @param {HTMLElement} kap
 * @param {{ proje: { id: string }; kosu: any; rest: boolean; ekle: (k: Record<string, any>) => void; kapat: () => void }} s
 */
export async function yanitKontrolPaneli(kap, s) {
  yerlestir(kap, iskelet('liste'));
  let ekAdlar = [];
  try { ekAdlar = (await api('/platform/maskeleme')).ekAdlar || []; } catch { ekAdlar = []; }
  const gizliMi = (/** @type {string} */ ad) => gizliAdMi(ad, ekAdlar);
  const k = s.kosu;
  const yanit = String(k.sonuc?.yanit ?? '');
  const kirpik = yanit.endsWith('…(kırpıldı)');
  const y = yanitAlanlari(kirpik ? '' : yanit);
  const kapat = h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': 'Paneli kapat', title: 'Kapat', onclick: () => s.kapat() }, ikon('carpi'));
  const ust = h('div', { class: 'kart-basligi' }, h('h4', {}, ikon('liste'), 'Son yanıttan kontrol öner'),
    h('span', { class: 'alt' }, [k.tur === 'dene' ? 'Dene' : 'Koşu', k.sonuc?.ortam, tarihMetni(k.baslangic), `${k.sonuc?.yanitSureMs ?? k.sureMs} ms`, k.sonuc?.durumKodu ? `HTTP ${k.sonuc.durumKodu}` : ''].filter(Boolean).join(' · ')), kapat);
  if (!y.bicim) {
    yerlestir(kap, ust, h('p', { class: 'not-kutusu uyari', role: 'status' }, kirpik ? 'Yanıt kaydı kırpılmış; alan listesi çıkarılamıyor.' : 'Yanıt XML ya da JSON olarak okunamadı; alan listesi yok. Kontrolleri elle ekleyin.'));
    return;
  }
  const kaynak = y.bicim;
  const bilgi = h('p', { class: 'kucuk soluk' }, 'Satırda işleci seçip "Ekle" deyin; kontrol senaryo kaydedilince yazılır. Gizli adlı ya da maskeli alanda değer gösterilmez ve yazılmaz (yalnız "var" ya da desen).');

  /** @type {Map<string, HTMLSelectElement>} */
  const altinSecimleri = new Map();
  const satirlar = y.alanlar.map((a) => {
    const oneri = kontrolOnerisi(a, gizliMi);
    const gizli = oneri.gizli;
    const islec = h('select', { 'aria-label': `${a.yol} kontrol işleci` },
      (gizli ? GIZLI_ISLECLER : KONTROL_ISLECLERI).map((x) => h('option', { value: x, selected: x === oneri.islec }, ISLEC_ETIKETLERI[x])));
    const deger = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': `${a.yol} kontrol değeri`, value: oneri.deger ?? '' });
    const enAz = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': `${a.yol} en az`, placeholder: 'en az', class: 'sayi-girdisi' });
    const enCok = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': `${a.yol} en çok`, placeholder: 'en çok', class: 'sayi-girdisi' });
    const girdiler = h('span', { class: 'yanit-alani-girdileri' });
    const girdileriCiz = () => {
      const i = islec.value;
      yerlestir(girdiler, i === 'aralik' ? [enAz, enCok] : ['esit', 'icerir', 'desen'].includes(i) ? deger : null);
      deger.placeholder = i === 'desen' ? 'desen (ör. \\d{8})' : 'değer';
    };
    islec.addEventListener('change', () => {
      // Gizli alanda desen dışında değer girilemez; eşittir / içerir için önerilen değer korunur.
      if (islec.value === 'desen' && oneri.islec !== 'desen') deger.value = '';
      if ((islec.value === 'esit' || islec.value === 'icerir') && !gizli && oneri.islec === 'desen') deger.value = String(a.deger ?? '');
      girdileriCiz();
    });
    girdileriCiz();
    const ekle = h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `${a.yol}: kontrol ekle` }, ikon('artiYalin'), 'Ekle');
    ekle.addEventListener('click', () => {
      const i = islec.value;
      /** @type {Record<string, any>} */
      const kontrol = { tur: 'yanitAlani', kaynak, yol: a.yol, islec: i, ...(gizli ? { gizli: true } : {}) };
      if (['esit', 'icerir', 'desen'].includes(i)) {
        if (!deger.value) { bildir('Değer boş olamaz.', 'hata'); deger.focus(); return; }
        if (gizli && i !== 'desen') { bildir('Gizli alanda değer yazılmaz.', 'hata'); return; }
        if (i === 'desen') { try { new RegExp(deger.value, 'u'); } catch { bildir('Desen geçersiz.', 'hata'); deger.focus(); return; } }
        kontrol.deger = deger.value;
      }
      if (i === 'aralik') {
        const alt = enAz.value.trim() ? sayiOku(enAz.value) : undefined;
        const ust2 = enCok.value.trim() ? sayiOku(enCok.value) : undefined;
        if (alt === null || ust2 === null || (alt === undefined && ust2 === undefined)) { bildir('Aralık için en az ya da en çok değerini sayı olarak yazın.', 'hata'); enAz.focus(); return; }
        if (alt !== undefined && ust2 !== undefined && alt > ust2) { bildir('En az, en çoktan büyük olamaz.', 'hata'); return; }
        if (alt !== undefined) kontrol.enAz = alt;
        if (ust2 !== undefined) kontrol.enCok = ust2;
      }
      s.ekle(kontrol);
      bildir(`Kontrol eklendi: ${a.yol} (senaryoyu kaydedin).`);
    });
    const altin = h('select', { 'aria-label': `${a.yol} altın yanıtta` },
      gizli ? [h('option', { value: 'yapi', selected: true }, 'yalnız yapı (değer saklanmaz)'), h('option', { value: 'yoksay' }, 'yok say')]
        : [h('option', { value: 'karsilastir', selected: !degiskenMi(a) }, 'karşılaştır'), h('option', { value: 'yoksay', selected: degiskenMi(a) }, 'yok say (her koşuda değişir)')]);
    altinSecimleri.set(a.yol, altin);
    return h('li', { class: 'yanit-alani-satiri', 'data-yol': a.yol },
      h('div', { class: 'yanit-alani-ust' }, h('code', { class: 'duz yanit-alani-yolu' }, a.yol),
        gizli ? rozet('gizli: değer yok', 'atlanan', { title: oneri.neden }) : h('span', { class: 'yanit-alani-degeri' }, a.deger === null ? '(boş / nil)' : a.deger === '' ? '(boş)' : a.deger)),
      h('div', { class: 'yanit-alani-kontrol' }, islec, girdiler, ekle, h('small', { class: 'cok-soluk' }, oneri.neden)),
      h('div', { class: 'yanit-alani-altin' }, h('span', { class: 'kucuk soluk' }, 'Altın yanıtta:'), altin));
  });

  // Altın yanıt: seçimlere göre kontrol oluşturulur (gizli / maskeli değer saklanmaz; tek altın yanıt, varsa yenisiyle değişir).
  const altinEkle = h('button', { type: 'button', class: 'kucuk-dugme' }, ikon('kalkan'), 'Altın yanıt olarak ekle');
  altinEkle.addEventListener('click', () => {
    const karsilastir = [...altinSecimleri].filter(([, sel]) => sel.value === 'karsilastir').map(([yol]) => yol);
    const yokSay = [...altinSecimleri].filter(([, sel]) => sel.value === 'yoksay').map(([yol]) => yol);
    try {
      const kontrol = altinYanitOlustur(yanit, { karsilastir, yokSay, gizliMi });
      s.ekle(kontrol);
      bildir(`Altın yanıt eklendi: ${kontrol.alanlar.length} sabit alan, ${kontrol.yokSay.length} yok sayılan (senaryoyu kaydedin).`);
    } catch (e) { bildir(e.message || String(e), 'hata'); }
  });
  // Yanıt süresi (SLA).
  const sure = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'Yanıt en çok (ms)', placeholder: `son yanıt ${k.sonuc?.yanitSureMs ?? k.sureMs} ms`, class: 'sayi-girdisi' });
  const sureEkle = h('button', { type: 'button', class: 'kucuk-dugme' }, ikon('saat'), 'Süre kontrolü ekle');
  sureEkle.addEventListener('click', () => {
    const n = Number(sure.value.trim());
    if (!/^\d+$/.test(sure.value.trim()) || n < 1 || n > 600000) { bildir('Süre 1–600000 ms arasında bir tam sayı olmalı.', 'hata'); sure.focus(); return; }
    s.ekle({ tur: 'yanitSuresi', deger: String(n) });
    bildir(`Kontrol eklendi: yanıt en çok ${n} ms (senaryoyu kaydedin).`);
  });

  yerlestir(kap, ust, bilgi,
    y.kirpildi ? h('p', { class: 'kucuk soluk' }, `Yanıtın ilk ${y.alanlar.length} alanı listelendi.`) : null,
    h('ul', { class: 'yanit-alanlari', 'aria-label': 'Yanıt alanları' }, satirlar),
    h('div', { class: 'yanit-kontrol-alt' },
      h('div', { class: 'yanit-altin' }, h('p', { class: 'kucuk soluk' }, 'Altın yanıt: bu yanıtın yapısı ve "karşılaştır" seçili alanların değerleri saklanır; sonraki yanıtlarda eklenen / kaldırılan / değişen alanlar yol yol raporlanır (değer yazılmaz).'), altinEkle),
      h('div', { class: 'yanit-sure' }, h('label', { class: 'secenek' }, 'Yanıt en çok', sure, 'ms'), sureEkle)));
}
