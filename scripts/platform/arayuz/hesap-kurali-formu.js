// Hesaplama kuralları (tarih kuralları dahil) — ORTAK arayüz parçaları:
// · kuralFormu: "+ Yeni kural…" (ad, ifade, biçim; başvurulan ${X} için deneme değeri kutuları; CANLI ÖNİZLEME, hata altta).
// · hesapKurallariKarti: servisin Parametreler sekmesindeki kural listesi (satır başına ad / ifade / biçim / örnek sonuç / hata; ekle / sil).
// Değerlendirme tarayıcıda da aynı güvenli ayrıştırıcıyla yapılır (hesap-kurallari.mjs; eval yok).
import { alan, h, ikon, yeniKimlik, yerlestir } from './ortak.js';
import { hesapKurallariniDenetle, kuralAyir, kuralParametreleri, ornekSonuclar } from './hesap-kurallari.mjs';

const ORNEKLER = [
  ['${Tutar} / 100', 'parametrenin yüzde biri'],
  ['yuvarla(${Prim} * 1.18, 2) | #,##0.00', 'KDV dahil, iki basamak'],
  ["BEGIN_DATE+1y | yyyy-MM-dd", 'başlangıçtan bir yıl sonra'],
  ["bugun | yyyy-MM-dd'T'HH:mm:ss", 'koşunun anı'],
  ["eger(${Tip} = 'T', ${VergiNo}, ${TcNo})", 'koşula göre'],
  ["birlestir(${Ad}, ' ', ${Soyad})", 'metin birleştirme']
];

/** Kısa sözdizimi yardımı. */
export function sozdizimiYardimi() {
  return h('details', { class: 'hesap-yardimi' }, h('summary', {}, 'Nasıl yazılır?'),
    h('p', { class: 'soluk kucuk' }, 'Kural: ifade | biçim (biçim isteğe bağlı). Başvurular: ${Parametre} ya da ${Tablo.Sütun}, ${akis:Ad}, başka kuralın adı. İşlemler: + - * / %, parantez, = != < > <= >=. Süre: 1y yıl, 3a ay, 10g gün, 2s saat (bugun+1y). Fonksiyonlar: yuvarla, asagiYuvarla, yukariYuvarla, mutlak, min, max, uzunluk, birlestir, buyukHarf, kucukHarf, parca, eger, bosIse, tarih, gunFarki, sayi. Biçim: tarih için yyyy-MM-dd, sayı için 0.00 / #,##0.00 (virgüllü ondalık: 0,00).'),
    h('ul', { class: 'hesap-ornekleri' }, ORNEKLER.map(([ifade, aciklama]) => h('li', {}, h('code', { class: 'duz' }, ifade), h('span', { class: 'soluk kucuk' }, ` — ${aciklama}`)))),
    h('p', { class: 'soluk kucuk' }, 'END_DATE = BEGIN_DATE+1y yazarsanız bitiş her zaman başlangıcı izler (aynı koşuda aynı an).'));
}

/**
 * Deneme değeri kutuları: kuralların başvurduğu ${X} / ${akis:X} için (değerler yalnız bu ekranda, kaydedilmez).
 * @param {Record<string, string>} ornek DEĞİŞTİRİLİR @param {() => void} degisti
 */
function denemeKutulari(kurallar, adlar, ornek, degisti) {
  const { refler, akislar } = kuralParametreleri(adlar, kurallar);
  const hepsi = [...refler, ...akislar.map((a) => `akis:${a}`)];
  if (!hepsi.length) return null;
  return h('div', { class: 'deneme-degerleri' }, h('div', { class: 'alan-etiketi' }, 'Deneme değerleri (yalnız önizleme için)'),
    h('div', { class: 'deneme-izgarasi' }, hepsi.map((ad) => {
      const g = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: ornek[ad] ?? '', placeholder: 'örnek değer' });
      g.addEventListener('input', () => { ornek[ad] = g.value; degisti(); });
      return alan(`\${${ad}}`, g);
    })));
}

/**
 * Yeni / düzenlenen kural formu. kaydet(ad, kural) başarılıysa form kapanır (çağıran kapatır); hata mesajı fırlatırsa altta gösterilir.
 * @param {{ kurallar: Record<string, string>; ad?: string; kural?: string; varsayilanAd?: string;
 *   kaydet: (ad: string, kural: string) => Promise<void> | void; vazgec: () => void }} s
 */
export function kuralFormu(s) {
  const { ifade: ilkIfade, bicim: ilkBicim } = kuralAyir(s.kural ?? '');
  const ad = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: s.ad ?? s.varsayilanAd ?? '', placeholder: 'ör. END_DATE', maxlength: '80' });
  const ifade = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: ilkIfade, placeholder: 'ör. BEGIN_DATE+1y ya da ${Tutar} / 100' });
  const bicim = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: ilkBicim, placeholder: 'yyyy-MM-dd · 0.00 (isteğe bağlı)' });
  const ornek = {};
  const denemeKap = h('div', {});
  const onizleme = h('div', { class: 'hesap-onizleme', 'aria-live': 'polite' });
  const kural = () => (bicim.value.trim() ? `${ifade.value.trim()}|${bicim.value.trim()}` : ifade.value.trim());
  const hesapla = () => {
    const a = ad.value.trim() || '_';
    const tum = { ...s.kurallar, [a]: kural() };
    if (s.ad && s.ad !== a) delete tum[s.ad];
    if (!ifade.value.trim()) { yerlestir(onizleme, h('span', { class: 'soluk kucuk' }, 'İfade yazın; sonuç burada görünür.')); return null; }
    const hata = hesapKurallariniDenetle(tum)[a];
    if (hata) { yerlestir(onizleme, h('div', { class: 'alan-hatasi', role: 'alert' }, hata)); return hata; }
    const r = ornekSonuclar(tum, ornek)[a];
    yerlestir(onizleme, r.hata ? h('div', { class: 'soluk kucuk' }, `Önizleme: ${r.hata}`) : h('div', {}, h('span', { class: 'soluk kucuk' }, 'Sonuç (bugün): '), h('code', { class: 'duz' }, r.sonuc)));
    return null;
  };
  let denemeAnahtari = '';
  const denemeCiz = () => {
    const k = { ...s.kurallar, _: kural() };
    const anahtar = JSON.stringify(kuralParametreleri(['_'], k));
    if (anahtar !== denemeAnahtari) { denemeAnahtari = anahtar; yerlestir(denemeKap, denemeKutulari(k, ['_'], ornek, hesapla)); }
  };
  ifade.addEventListener('input', () => { denemeCiz(); hesapla(); });
  bicim.addEventListener('input', hesapla);
  ad.addEventListener('input', hesapla);
  const mesaj = h('div', { class: 'alan-hatasi', role: 'alert' });
  const kaydet = h('button', { type: 'button', class: 'kucuk-dugme birincil' }, 'Kuralı kaydet');
  kaydet.addEventListener('click', async () => {
    mesaj.textContent = '';
    const a = ad.value.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,79}$/.test(a)) { mesaj.textContent = 'Ad harf ya da "_" ile başlamalı (harf, rakam, "_", ".", "-").'; return; }
    if (a !== s.ad && Object.hasOwn(s.kurallar, a)) { mesaj.textContent = `"${a}" adında kural zaten var.`; return; }
    const hata = hesapla();
    if (hata || !ifade.value.trim()) { mesaj.textContent = hata || 'İfade boş.'; return; }
    kaydet.disabled = true;
    try { await s.kaydet(a, kural()); } catch (e) { mesaj.textContent = e.message; } finally { kaydet.disabled = false; }
  });
  denemeCiz();
  hesapla();
  return h('div', { class: 'kural-formu', role: 'group', 'aria-label': 'Hesaplama kuralı' },
    h('div', { class: 'satir-duzen kural-formu-alanlari' }, alan('Kural adı', ad), alan('İfade', ifade), alan('Biçim', bicim)),
    denemeKap, onizleme, mesaj, sozdizimiYardimi(),
    h('div', { class: 'dugmeler' }, kaydet, h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: s.vazgec }, 'Vazgeç')));
}

/**
 * Parametreler sekmesi: kural listesi. Satır başına ad / ifade / biçim düzenlenir; örnek sonuç ve hata satırın altında (anında).
 * kaydet(yeniKurallar) tüm listeyi yazar.
 * @param {{ kurallar: Record<string, string>; kaydet: (k: Record<string, string>) => Promise<void> }} s
 */
export function hesapKurallariKarti(s) {
  // Değiştirilmeyen satırın kural metni olduğu gibi kalır (kullanıcının yazımı kendiliğinden değişmez).
  const satirlar = Object.entries(s.kurallar).map(([ad, k]) => { const p = kuralAyir(k); return { kimlik: yeniKimlik('kr'), ad, ...p, ozgun: { ad, ...p, metin: k } }; });
  const ornek = {};
  const liste = h('div', { class: 'hesap-kurallari', role: 'table', 'aria-label': 'Hesaplama kuralları' });
  const denemeKap = h('div', {});
  let denemeAnahtari = '';
  const mesaj = h('div', { class: 'alan-hatasi', role: 'alert' });
  const kaydet = h('button', { type: 'button', class: 'birincil' }, 'Kuralları kaydet');
  const metin = (x) => (x.ozgun && x.ozgun.ifade === x.ifade.trim() && x.ozgun.bicim === x.bicim.trim() ? x.ozgun.metin : x.bicim.trim() ? `${x.ifade.trim()}|${x.bicim.trim()}` : x.ifade.trim());
  const kurallar = () => Object.fromEntries(satirlar.filter((x) => x.ad.trim() || x.ifade.trim()).map((x) => [x.ad.trim(), metin(x)]));
  /** @type {Map<string, HTMLElement>} */
  const sonucAlanlari = new Map();
  const guncelle = () => {
    const k = kurallar();
    const hatalar = hesapKurallariniDenetle(k);
    const ornekler = ornekSonuclar(k, ornek);
    for (const x of satirlar) {
      const el = sonucAlanlari.get(x.kimlik);
      if (!el) continue;
      const a = x.ad.trim();
      const bosAd = !a && x.ifade.trim();
      const hata = bosAd ? 'Ad yazın.' : satirlar.filter((y) => y.ad.trim() === a).length > 1 ? `"${a}" adı iki kez kullanılmış.` : hatalar[a];
      const o = ornekler[a];
      yerlestir(el, hata ? h('span', { class: 'alan-hatasi', role: 'alert' }, hata)
        : !x.ifade.trim() ? null
          : o?.sonuc !== undefined ? [h('span', { class: 'soluk kucuk' }, 'Örnek (bugün): '), h('code', { class: 'duz' }, o.sonuc)]
            : h('span', { class: 'soluk kucuk' }, o?.hata ? `Örnek için deneme değeri girin (${o.hata.replace(/^[^:]+: /, '')})` : ''));
    }
    // Deneme kutuları yalnız başvuru listesi değişince yeniden çizilir (yazarken odak korunur).
    const anahtar = JSON.stringify(kuralParametreleri(Object.keys(k), k));
    if (anahtar !== denemeAnahtari) { denemeAnahtari = anahtar; yerlestir(denemeKap, denemeKutulari(k, Object.keys(k), ornek, guncelle)); }
    kaydet.disabled = satirlar.some((x) => x.ad.trim() && hatalar[x.ad.trim()]) || satirlar.some((x) => !x.ad.trim() && x.ifade.trim());
  };
  const ciz = () => {
    sonucAlanlari.clear();
    yerlestir(liste, h('div', { class: 'hesap-kurali-satiri baslik', role: 'row' }, h('span', { role: 'columnheader' }, 'Ad'), h('span', { role: 'columnheader' }, 'İfade'), h('span', { role: 'columnheader' }, 'Biçim'), h('span', {})),
      satirlar.map((x, i) => {
        const g = (alanAdi, yer, etiket) => {
          const el = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: x[alanAdi], placeholder: yer, 'aria-label': `${i + 1}. kural: ${etiket}` });
          el.addEventListener('input', () => { x[alanAdi] = el.value; guncelle(); });
          return el;
        };
        const sonuc = h('div', { class: 'hesap-kurali-sonucu', 'aria-live': 'polite' });
        sonucAlanlari.set(x.kimlik, sonuc);
        return h('div', { class: 'hesap-kurali-satiri', role: 'row' },
          g('ad', 'BEGIN_DATE', 'ad'), g('ifade', 'bugun · ${Tutar} / 100', 'ifade'), g('bicim', 'yyyy-MM-dd · 0.00', 'biçim'),
          h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `${i + 1}. kuralı sil`, title: 'Sil', onclick: () => { satirlar.splice(i, 1); ciz(); } }, ikon('carpi')),
          sonuc);
      }));
    guncelle();
  };
  kaydet.addEventListener('click', async () => {
    mesaj.textContent = '';
    kaydet.disabled = true;
    try { await s.kaydet(kurallar()); } catch (e) { mesaj.textContent = e.message; } finally { guncelle(); }
  });
  ciz();
  return h('div', { class: 'kart form-paneli' }, h('h3', {}, 'Hesaplama kuralları'),
    h('p', { class: 'soluk kucuk' }, 'Alanı bir kurala bağlayınca (Metot alanları) ya da senaryoda kaynağı "Hesaplama kuralı" seçince değer koşu anında kuraldan üretilir: tarih (bugün, bugün + 1 yıl), hesap (${Tutar} / 100), koşul ya da metin birleştirme. Tarih kuralları da buradadır.'),
    liste,
    h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { satirlar.push({ kimlik: yeniKimlik('kr'), ad: '', ifade: '', bicim: '' }); ciz(); liste.querySelector('.hesap-kurali-satiri:last-of-type input')?.focus(); } }, ikon('arti'), 'Kural ekle'),
    denemeKap, sozdizimiYardimi(), mesaj, h('div', { class: 'dugmeler' }, kaydet));
}
