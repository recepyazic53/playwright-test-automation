// "Senaryo önerileri" (senaryo tasarım yardımcısı; Senaryolar > ekran > "Senaryo önerileri"). Öneriler tarayıcıda saf fonksiyonla
// üretilir (senaryo-onerileri.mjs: model + mevcut senaryolar + bağlı test verisi tabloları; tarayıcı koşusu yok). Öneri YALNIZCA
// öneridir: kullanıcı işaretleyip "Senaryo olarak ekle" demeden senaryo oluşmaz; eklenenler tek doğrulayıcıdan geçer ve "Koşuda"
// KAPALI gelir (gözden geçirilsin diye). "Önizle": öneri, senaryo formunda doldurulmuş hâliyle açılır (kaydedilmez; formdan
// düzenleyip oluşturmak kullanıcının kararıdır). Aynı öneri tekrar üretilince içeriği zaten bir senaryoda olanlar "mevcut" işaretlidir.
// Adres: #/senaryolar/oneriler/<ekranId>. Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { api, bildir, bosDurum, h, ikon, iskelet, mesgulIken, rozet, yerlestir } from './ortak.js';
import { formSemasiOlustur } from './model-formu.mjs';
import { gorunurlukleriHesapla, hatalariMetneCevir, senaryoyuDogrula } from './senaryo-dogrulayici.mjs';
import { degerBasvurusuYaz } from './tablo-secimi.mjs';
import { gizliAdMi } from './gizli-adlar.mjs';
import { KOMBINASYON_ALAN_SINIRI, KOMBINASYON_UST_SINIRI, senaryoOnerileri } from './senaryo-onerileri.mjs';
import { senaryoFormu } from './senaryo-formu.js';

const TUR_BASLIKLARI = {
  zorunlu: ['Zorunlu alanlar', 'Her zorunlu alan ayrı senaryoda boş; diğer alanlar tabandan.'],
  sinir: ['Sınır değerleri', 'Yalnızca modelde tanımlı kurallardan (en az / en çok, uzunluk, tarih aralığı).'],
  kosullu: ['Koşullu alanlar', 'Görünürlüğü ya da listesi başka bir seçime bağlı alanların her dalı.'],
  kombinasyon: ['Eksik kombinasyonlar', 'İşaretlediğiniz seçim alanlarının mevcut senaryolarda olmayan kombinasyonları.']
};
const hataKutusu = (hata) => h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message || String(hata));

/** Önizlemeden dönünce korunan durum (ekran başına). */
const durum = { ekranId: '', akisId: '', kombinasyon: /** @type {string[]} */ ([]), secim: new Set() };

/**
 * @param {HTMLElement} icerik
 * @param {{ proje: { id: string; ad: string }; ortam: { id: string; ad: string }; ortamlar: Array<{ id: string; ad: string }>;
 *   ekranId: string; ekranAdi: string | null; geri: () => void }} s
 */
export async function senaryoOnerileriEkrani(icerik, s) {
  if (durum.ekranId !== s.ekranId) Object.assign(durum, { ekranId: s.ekranId, akisId: '', kombinasyon: [], secim: new Set() });
  yerlestir(icerik, iskelet('sayfa'));
  let baglam;
  let ekGizliAdlar = [];
  try {
    [baglam, ekGizliAdlar] = await Promise.all([
      api(`/platform/senaryo/oneri-baglami?projeId=${encodeURIComponent(s.proje.id)}&ekranId=${encodeURIComponent(s.ekranId)}&ortamId=${encodeURIComponent(s.ortam.id)}${durum.akisId ? `&akisId=${encodeURIComponent(durum.akisId)}` : ''}`),
      api('/platform/maskeleme').then((m) => m.ekAdlar || []).catch(() => [])
    ]);
  } catch (hata) {
    if (hata && hata.durum === 423) return;
    yerlestir(icerik, baslik(s, null), hataKutusu(hata));
    return;
  }
  if (!baglam.model) {
    yerlestir(icerik, baslik(s, null), bosDurum('Bu ekranın modeli yok.', 'Öneriler ekran modelinden üretilir; önce Ekranlar\'dan model ekleyin.', { ikon: 'katman' }));
    return;
  }
  durum.akisId = baglam.akisId || '';
  const sema = formSemasiOlustur(baglam.model, baglam.altModeller);
  const dogrulamaBaglami = { model: baglam.model, altModeller: baglam.altModeller, kaynak: 'kayit' };
  // Değer üretilmeyen (kişisel / gizli) alanlar bağlı tablonun başvurusuyla dolar (koşuda seçilen satırdan gelir).
  const tabloBasvurulari = {};
  for (const l of baglam.degerListeleri || []) {
    if (l.baglanti && l.hedef && l.hedef.alan && !tabloBasvurulari[l.hedef.alan]) tabloBasvurulari[l.hedef.alan] = degerBasvurusuYaz(l.baglanti.tablo, l.baglanti.sutun, l.baglanti.etiket || '');
  }
  const uret = () => senaryoOnerileri({
    model: baglam.model, sema, senaryolar: baglam.senaryolar, tabloBasvurulari, kombinasyonAlanlari: durum.kombinasyon,
    gorunurlukHesapla: (veri) => gorunurlukleriHesapla(veri, dogrulamaBaglami),
    dogrula: (veri) => senaryoyuDogrula(veri, dogrulamaBaglami),
    gizliAdMi: (ad) => gizliAdMi(ad, ekGizliAdlar)
  });
  let sonuc = uret();

  const govde = h('div', { class: 'oneri-govdesi' });
  const secimSayisi = h('span', { class: 'oneri-secim-sayisi', 'aria-live': 'polite' });
  const ekleDugmesi = h('button', { type: 'button', class: 'birincil' }, ikon('artiYalin'), 'Senaryo olarak ekle');
  const sonucAlani = h('div', { 'aria-live': 'polite' });
  const cubuk = h('div', { class: 'oneri-eylem-cubugu', role: 'region', 'aria-label': 'Seçilen öneriler' },
    h('div', { class: 'oneri-cubuk-metni' }, secimSayisi,
      h('span', { class: 'kucuk soluk' }, ikon('isaret'), 'Eklenenler "Koşuda" KAPALI gelir; gözden geçirip açın.')),
    ekleDugmesi);

  const akisSecimi = (baglam.akislar || []).length > 1
    ? h('select', { 'aria-label': 'Akış', onchange: (o) => { durum.akisId = o.currentTarget.value; durum.secim = new Set(); senaryoOnerileriEkrani(icerik, s); } },
      baglam.akislar.map((a) => h('option', { value: a.id, selected: a.id === baglam.akisId }, a.ad)))
    : null;
  // Temel alınan senaryo listenin üstünde BİR KEZ; öneri satırlarında yalnız fark ("E-posta: boş", "Yaş: 17").
  const tabanNotu = h('p', { class: 'oneri-tabani', role: 'note' });

  function tabanCiz() {
    yerlestir(tabanNotu, ikon('katman'), h('span', {}, sonuc.taban.kaynak === 'senaryo' ? `Taban: “${sonuc.taban.baslik}”` : 'Taban: modelin varsayılanları'),
      h('span', { class: 'kucuk soluk' }, ' — öneriler bu değerlerle başlar; satırlarda yalnız farklar yazılır.'));
  }

  /** Seçimi güncel önerilere indirger (mevcut / artık üretilmeyen öneriler seçimden çıkar). */
  function secimiDuzelt() {
    const gecerli = new Set(sonuc.oneriler.filter((o) => !o.mevcut).map((o) => o.kimlik));
    for (const k of [...durum.secim]) if (!gecerli.has(k)) durum.secim.delete(k);
    secimSayisi.textContent = durum.secim.size ? `${durum.secim.size} öneri seçili` : 'Öneri seçilmedi';
    ekleDugmesi.disabled = !durum.secim.size;
  }

  function kombinasyonKarti() {
    const k = sonuc.kombinasyon;
    const kutular = k.secilebilir.map((a) => {
      const secili = durum.kombinasyon.includes(a.id);
      return h('label', { class: 'kombinasyon-alani' },
        h('input', {
          type: 'checkbox', checked: secili, disabled: !secili && durum.kombinasyon.length >= KOMBINASYON_ALAN_SINIRI,
          onchange: (o) => {
            durum.kombinasyon = o.currentTarget.checked ? [...durum.kombinasyon, a.id] : durum.kombinasyon.filter((x) => x !== a.id);
            yenidenUret();
          }
        }), h('span', {}, a.etiket), h('small', { class: 'cok-soluk' }, `${a.secenekSayisi} seçenek`));
    });
    const ozet = k.secili.length < 2
      ? `Kombinasyon için 2–${KOMBINASYON_ALAN_SINIRI} seçim alanı işaretleyin.`
      : k.cokFazla ? 'Kombinasyon sayısı hesap sınırını aşıyor; daha az seçenekli alanlar seçin.'
        : `${k.toplam} kombinasyon: ${k.mevcut} mevcut, ${k.eksik} eksik${k.gecersiz ? `, ${k.gecersiz} geçersiz (koşula uymuyor)` : ''}.`;
    return h('section', { class: 'kart kombinasyon-karti', 'aria-labelledby': 'kombinasyon-baslik' },
      h('div', { class: 'kart-basligi' }, h('h3', { id: 'kombinasyon-baslik' }, ikon('izgara'), 'Kombinasyon alanları'),
        h('span', { class: 'alt' }, `En çok ${KOMBINASYON_ALAN_SINIRI} alan · en çok ${KOMBINASYON_UST_SINIRI} öneri listelenir`)),
      k.secilebilir.length
        ? h('div', { class: 'kombinasyon-alanlari', role: 'group', 'aria-label': 'Kombinasyon alanları' }, kutular)
        : h('p', { class: 'kucuk soluk' }, 'Bu ekranda kombinasyona uygun (seçenekli, kişisel olmayan) seçim alanı yok.'),
      h('p', { class: 'kucuk soluk kombinasyon-ozeti' }, ozet));
  }

  function oneriSatiri(o) {
    const secili = durum.secim.has(o.kimlik);
    const kutu = h('input', {
      type: 'checkbox', checked: secili && !o.mevcut, disabled: Boolean(o.mevcut), 'aria-label': `${o.baslik}: seç`,
      onchange: (e) => { if (e.currentTarget.checked) durum.secim.add(o.kimlik); else durum.secim.delete(o.kimlik); secimiDuzelt(); }
    });
    const beklenenRozet = rozet(o.beklenenMetni, o.beklenen.tur === 'basari' ? 'basari' : o.beklenen.tur === 'hata' ? 'hata' : 'atlanan',
      o.beklenen.tur === 'belirsiz' ? { title: o.beklenen.neden } : {});
    return h('li', { class: `oneri${o.mevcut ? ' mevcut' : ''}`, 'data-oneri': o.kimlik },
      kutu,
      h('div', { class: 'oneri-icerigi' },
        h('div', { class: 'oneri-ust' }, h('b', { class: 'oneri-basligi' }, o.baslik),
          h('span', { class: 'oneri-rozetleri' }, beklenenRozet,
            o.mevcut ? rozet('mevcut', 'vurgu', { title: `Zaten var: “${o.mevcut.baslik}”` }) : null,
            o.eksikler.length ? rozet('değer eksik', 'atlanan', { title: `Değeri olmayan zorunlu alanlar: ${o.eksikler.join(', ')}` }) : null)),
        // Yalnız fark: değişen alanlar (boş / seçilen / sınır değeri). Koşullu ve sınır önerilerinde etkisi ayrıca kısa not.
        (o.degisiklikler || []).length
          ? h('ul', { class: 'oneri-farklari', 'aria-label': `${o.baslik}: farklar` }, o.degisiklikler.map((d) => h('li', {},
            h('b', {}, `${d.etiket}: `), d.deger === '(boş)' ? 'boş' : d.deger)))
          : h('p', { class: 'oneri-ozeti' }, o.ozet),
        o.tur === 'kosullu' || o.tur === 'sinir' ? h('p', { class: 'oneri-ozeti kucuk soluk' }, o.ozet) : null,
        o.mevcut ? h('p', { class: 'kucuk cok-soluk' }, `Zaten var: “${o.mevcut.baslik}”`) : null,
        o.eksikler.length ? h('p', { class: 'kucuk cok-soluk' }, `Değeri olmayan zorunlu alanlar (önizlemede doldurun): ${o.eksikler.join(', ')}`) : null,
        o.beklenen.tur === 'belirsiz' ? h('p', { class: 'kucuk cok-soluk' }, o.beklenen.neden) : null),
      h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `${o.baslik}: önizle`, onclick: () => onizle(o) }, ikon('goz'), 'Önizle'));
  }

  function gruplar() {
    const notlar = (tur) => sonuc.notlar.filter((n) => n.tur === tur);
    return Object.entries(TUR_BASLIKLARI).map(([tur, [etiket, aciklama]]) => {
      const liste = sonuc.oneriler.filter((o) => o.tur === tur);
      const eklenebilir = liste.filter((o) => !o.mevcut);
      if (!liste.length && !notlar(tur).length && tur !== 'kombinasyon') return null;
      const tumu = h('button', {
        type: 'button', class: 'kucuk-dugme hayalet', disabled: !eklenebilir.length,
        onclick: () => { const hepsi = eklenebilir.every((o) => durum.secim.has(o.kimlik)); for (const o of eklenebilir) { if (hepsi) durum.secim.delete(o.kimlik); else durum.secim.add(o.kimlik); } ciz(); }
      }, eklenebilir.length && eklenebilir.every((o) => durum.secim.has(o.kimlik)) ? 'Seçimi kaldır' : 'Tümünü seç');
      return h('section', { class: 'kart oneri-grubu', 'data-tur': tur, 'aria-labelledby': `oneri-grup-${tur}` },
        h('div', { class: 'kart-basligi' }, h('h3', { id: `oneri-grup-${tur}` }, etiket, rozet(String(liste.length), 'vurgu')), tumu),
        h('p', { class: 'kucuk soluk' }, aciklama),
        tur === 'kombinasyon' ? kombinasyonKarti() : null,
        notlar(tur).length ? h('ul', { class: 'oneri-notlari', 'aria-label': `${etiket}: bilgi notları` }, notlar(tur).map((n) => h('li', {}, ikon('isaret'), h('span', {}, n.mesaj)))) : null,
        liste.length ? h('ul', { class: 'oneri-listesi', 'aria-label': etiket }, liste.map(oneriSatiri)) : tur === 'kombinasyon' ? null : h('p', { class: 'kucuk cok-soluk' }, 'Öneri yok.'));
    });
  }

  function ciz() {
    tabanCiz();
    secimiDuzelt();
    yerlestir(govde,
      ...sonuc.notlar.filter((n) => n.tur === 'taban').map((n) => h('div', { class: 'not-kutusu uyari', role: 'note' }, n.mesaj)),
      ...gruplar());
    secimiDuzelt();
  }
  function yenidenUret() {
    sonuc = uret();
    ciz();
  }

  function onizle(o) {
    senaryoFormu(icerik, {
      mod: 'yeni', proje: s.proje, ortam: s.ortam, ortamlar: s.ortamlar, ekranId: s.ekranId, ekranAdi: s.ekranAdi, senaryoId: null, akisId: baglam.akisId,
      taslak: { veri: o.veri, baslik: o.baslik, ortamlar: [s.ortam.id], kosuyaDahil: false, mutlaka: [], tabloSecimleri: o.tabloSecimleri || {}, oneri: { tur: o.tur, beklenen: o.beklenenMetni } },
      geri: () => senaryoOnerileriEkrani(icerik, s)
    });
  }

  ekleDugmesi.addEventListener('click', async () => {
    const secilenler = sonuc.oneriler.filter((o) => durum.secim.has(o.kimlik) && !o.mevcut);
    if (!secilenler.length) return;
    const eklenen = [];
    const atlanan = [];
    await mesgulIken(ekleDugmesi, 'Ekleniyor…', async () => {
      for (const o of secilenler) {
        if (o.beklenen.tur === 'belirsiz') { atlanan.push([o.baslik, 'beklenen sonucu siz seçin (Önizle ile açıp seçin)']); continue; }
        if (o.eksikler.length) { atlanan.push([o.baslik, `değeri olmayan zorunlu alanlar: ${o.eksikler.join(', ')} (Önizle ile doldurun)`]); continue; }
        const d = senaryoyuDogrula(o.veri, dogrulamaBaglami);
        if (d.hatalar.length) { atlanan.push([o.baslik, hatalariMetneCevir(d.hatalar)]); continue; }
        try {
          await api('/platform/senaryo/kaydet', {
            govde: {
              ekranId: s.ekranId, projeId: s.proje.id, baslik: o.baslik, veri: o.veri, ortamIdleri: [s.ortam.id], kosuyaDahil: false, mutlakaGorunmeli: [],
              ...(baglam.akisId ? { akisId: baglam.akisId } : {}), ...(o.tabloSecimleri ? { tabloSecimleri: o.tabloSecimleri } : {})
            }
          });
          eklenen.push(o.baslik);
          durum.secim.delete(o.kimlik);
        } catch (hata) {
          if (hata && hata.durum === 423) return;
          atlanan.push([o.baslik, hata.message || String(hata)]);
        }
      }
    });
    if (eklenen.length) bildir(`${eklenen.length} senaryo eklendi ("Koşuda" kapalı).`);
    // Liste yeniden okunur: eklenenler artık "mevcut".
    try {
      baglam = { ...baglam, senaryolar: (await api(`/platform/senaryo/oneri-baglami?projeId=${encodeURIComponent(s.proje.id)}&ekranId=${encodeURIComponent(s.ekranId)}&ortamId=${encodeURIComponent(s.ortam.id)}${baglam.akisId ? `&akisId=${encodeURIComponent(baglam.akisId)}` : ''}`)).senaryolar };
    } catch { /* liste eski kalır */ }
    yenidenUret();
    yerlestir(sonucAlani, h('div', { class: `not-kutusu ${atlanan.length ? 'uyari' : 'basari'}`, role: 'status' },
      h('p', {}, eklenen.length ? `${eklenen.length} senaryo eklendi; "Koşuda" kapalı — Senaryolar listesinden gözden geçirip açın.` : 'Hiç senaryo eklenmedi.'),
      atlanan.length ? h('ul', { 'aria-label': 'Eklenmeyen öneriler' }, atlanan.map(([b, neden]) => h('li', {}, h('b', {}, b), `: ${neden}`))) : null));
  });

  yerlestir(icerik,
    baslik(s, [h('span', {}, ikon('ag'), `Ortam: ${s.ortam.ad}`), akisSecimi ? h('label', { class: 'akis-secimi' }, 'Akış', akisSecimi) : null]),
    h('div', { class: 'not-kutusu bilgi oneri-bilgisi', role: 'note' },
      h('p', {}, h('b', {}, 'Öneriler yalnızca öneridir. '), 'Siz işaretleyip "Senaryo olarak ekle" demeden hiçbir senaryo oluşmaz; eklenenler kurallardan geçer.'),
      h('p', { class: 'kucuk' }, 'Kişisel / gizli alanlarda değer üretilmez (mevcut senaryodaki değer ya da bağlı tablo kullanılır, maskeli gösterilir). Beklenen sonuç belli değilse "Beklenen sonucu siz seçin" yazar.')),
    sonucAlani, tabanNotu, govde, cubuk);
  ciz();
}

function baslik(s, meta) {
  return h('div', { class: 'sayfa-basligi' },
    h('div', {},
      h('div', { class: 'kirinti' }, h('span', {}, s.proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: '#/senaryolar' }, 'Senaryolar'),
        h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: `#/senaryolar/u/${encodeURIComponent(s.ekranId)}` }, s.ekranAdi || 'Ekran'),
        h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, 'Senaryo önerileri')),
      h('h2', { tabindex: '-1' }, 'Senaryo önerileri'),
      meta ? h('div', { class: 'meta' }, meta) : null),
    h('div', { class: 'eylemler' }, h('button', { type: 'button', class: 'hayalet', onclick: s.geri }, ikon('geri'), 'Senaryolara dön')));
}
