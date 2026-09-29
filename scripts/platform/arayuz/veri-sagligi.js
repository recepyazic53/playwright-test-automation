// VERİ SAĞLIĞI ve TABLO BİRLEŞTİRME (Veri; sunucu: tablolar/tablo-birlestirme.mjs).
//   · veriSagligiKarti: Test verisi ekranının üstünde özet — birleştirilebilecek tablolar, hiç kullanılmayan tablolar, boş sütunlar,
//     kırık başvurular (silinmiş tabloyu / sütunu gösteren senaryo / bağ). Her madde tıklanınca ilgili ekrana ya da düzeltmeye gider.
//     Başlıktaki geçmiş düğmesi birleştirme geçmişini açar (birlestirmeGecmisiPenceresi: satırdan geri al / kaynakları sil).
//   · birlestirmePenceresi: kalacak tablo (kullanım sayılarıyla; en çok kullanılan önerilir), yeni ad, sütun eşleme (emin olunamayanlar
//     onaylanır), satır ve karşılık çakışmaları (gizli değerler •••), yeniden eşlenecekler, kuru doğrulama sonucu. Önizleme sunucuda
//     denenir ve geri alınır; "Birleştir" yalnız kuru doğrulama farksızken ve ayrı onayla. Kaynak tabloları silmek ayrı onaydır.
//   · benzerTabloNotu: yeni tablo oluşturulacakken (SoapUI / Postman aktarımı) "Benzer tablo var: X — onu kullan / yine de yeni oluştur".
import { api, bildir, h, ikon, mesgulIken, rozet, yerlestir } from './ortak.js';
import { onayIste } from './kosu-paneli.js';

const q = encodeURIComponent;
const GORUNUR = 8;
const GRUP = { birebir: 'birebir aynı', cogu: 'çoğu aynı', veriFarkli: 'başlıklar aynı, veri farklı' };
const SECIM = { kalan: 'Kalanınki kalsın', kaynak: 'Kaynaktakini yaz', ikisi: 'İkisini de tut' };
const ESLEME = { ekranBaglari: 'ekran alan bağı', servisBaglari: 'servis alan bağı', ekranSenaryolari: 'ekran senaryosu', servisSenaryolari: 'servis senaryosu',
  satirSecimleri: 'satır seçimi', hesapKurallari: 'hesaplama kuralı', varsayilanlar: 'servis alan varsayılanı', akislar: 'servis akışı', sabitlenen: 'satır seçimi eklendi (aynı satır için)' };

/** Kullanım özeti: "2 ekran bağı · 1 servis bağı · 3 senaryo · 1 satır seçimi · 0 kural". @param {any} k */
export function kullanimMetni(k) {
  if (!k) return 'kullanım yok';
  const p = [[k.ekranBaglari, 'ekran bağı'], [k.servisBaglari, 'servis bağı'], [k.senaryoBasvurulari, 'senaryo'], [k.satirSecimleri, 'satır seçimi'], [k.hesapKurallari, 'kural']]
    .filter(([n]) => n).map(([n, a]) => `${n} ${a}`);
  return p.length ? p.join(' · ') : 'hiçbir yerde kullanılmıyor';
}

/**
 * Veri sağlığı kartı. secTablo(id): Tablolar listesinde o tabloyu açar; yenile(): bölümü yeniden yükler (birleştirme / geri alma sonrası);
 * ayarlarFormu(kaydedildi): başlıktaki ayarlar (dişli) düğmesinin diyalogda açtığı "Test verisi ayarları" formu (verilmezse düğme yok).
 * @param {{ id: string }} proje @param {{ secTablo: (id: string) => void; yenile: () => void; tablolar: () => Array<{ id: string; ad: string }>; veri?: Promise<any>;
 *   ayarlarFormu?: (kaydedildi: () => void) => Promise<HTMLElement> }} c
 */
export function veriSagligiKarti(proje, c) {
  const kok = h('section', { class: 'kart veri-sagligi', 'aria-label': 'Veri sağlığı' }, h('p', { class: 'soluk kucuk' }, 'Veri sağlığı denetleniyor…'));
  // Ayarlar kaydedilince yalnız bu kart yeniden okunur (tablo düzenleyicideki kaydedilmemiş değişiklikler korunur).
  const ayarlariAc = async () => { if (c.ayarlarFormu && (await testVerisiAyarlariPenceresi(c.ayarlarFormu))) ciz(null); };
  const ciz = async (/** @type {Promise<any> | null | undefined} */ veri) => {
    let s;
    // Önceden yüklendiyse (Test verisi bölümü tablolarla birlikte ister) kart hemen çizilir: sayfa sonradan kaymaz.
    try { s = veri ? await veri : await api(`/platform/tablolar/veri-sagligi?projeId=${q(proje.id)}`); } catch (e) { yerlestir(kok, h('p', { class: 'soluk kucuk' }, `Veri sağlığı okunamadı: ${e.message}`)); return; }
    if (!s) { kok.remove(); return; }
    const bolum = (baslik, sayi, icerik, acik = false) => h('details', { class: 'saglik-bolumu', open: acik && sayi > 0 },
      h('summary', {}, h('span', {}, baslik), rozet(String(sayi), sayi ? 'uyari' : '')), sayi ? icerik : h('p', { class: 'soluk kucuk' }, 'Sorun yok.'));
    // Uzun listeler (gerçek projede onlarca öneri) kartı sayfanın tamamına yaymasın: ilk GORUNUR madde, gerisi tek tıkla.
    const liste = (ogeler) => {
      const ul = h('ul', { class: 'saglik-listesi' }, ogeler.slice(0, GORUNUR));
      if (ogeler.length > GORUNUR) {
        const devam = h('li', { class: 'saglik-devami' }, h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => { devam.replaceWith(...ogeler.slice(GORUNUR)); } }, `${ogeler.length - GORUNUR} madde daha göster`));
        ul.append(devam);
      }
      return ul;
    };
    const tabloDugmesi = (id, metin) => h('button', { type: 'button', class: 'baglanti-dugmesi', onclick: () => c.secTablo(id) }, metin);
    // Birleştirme geçmişi: başlıktaki düğme (geçmiş boşsa kapalı); liste, geri alma ve kaynak silme diyalogda.
    const gs = s.birlestirmeGecmisi || { toplam: 0, etkin: 0 };
    const gecmisDugmesi = h('button', {
      type: 'button', class: 'ikon-dugme gecmis-dugmesi', 'aria-label': 'Birleştirme geçmişi', disabled: !gs.toplam,
      title: gs.toplam ? `Birleştirme geçmişi (${gs.toplam})` : 'Henüz birleştirme yok',
      onclick: async () => { if (await birlestirmeGecmisiPenceresi(proje)) c.yenile(); }
    }, ikon('tarih'));
    const ayarDugmesi = c.ayarlarFormu ? h('button', { type: 'button', class: 'ikon-dugme ayar-dugmesi', 'aria-label': 'Test verisi ayarları', title: 'Test verisi ayarları', onclick: ayarlariAc }, ikon('ayar')) : null;
    // Öneriler puana göre sıralı gelir; eşik altı olanlar (Test verisi ayarları) varsayılan gizli.
    const esik = typeof s.benzerlikEsigi === 'number' ? s.benzerlikEsigi : 50;
    const yuksek = s.benzer.filter((o) => o.puan >= esik);
    const dusuk = s.benzer.filter((o) => o.puan < esik);
    const oneriSatiri = (o) => h('li', {},
      h('span', { class: 'saglik-metni' }, o.adlar.map((x) => `“${x}”`).join(' + ')),
      rozet(GRUP[o.grup] || o.grup, o.grup === 'birebir' ? 'basari' : ''), rozet(`%${o.puan}`, o.puan < esik ? 'soluk-rozet' : ''), o.eslemeGerekli ? rozet('sütun eşleme gerekir', 'uyari') : null,
      h('button', { type: 'button', class: 'kucuk-dugme', onclick: async () => { if (await birlestirmePenceresi(proje, o.tablolar, s.kullanim, c.tablolar())) c.yenile(); } }, ikon('esle'), 'Birleştir…'));
    const oneriIcerigi = () => {
      const kap = h('div', {}, yuksek.length ? liste(yuksek.map(oneriSatiri)) : h('p', { class: 'soluk kucuk' }, `Eşiğin (%${esik}) üstünde öneri yok.`));
      if (dusuk.length) {
        const goster = h('button', { type: 'button', class: 'kucuk-dugme hayalet dusuk-benzerlik-dugmesi', 'aria-expanded': 'false' }, `Düşük benzerlikleri de göster (${dusuk.length})`);
        goster.addEventListener('click', () => { goster.replaceWith(h('p', { class: 'soluk kucuk' }, `Eşik (%${esik}) altındaki öneriler:`), liste(dusuk.map(oneriSatiri))); });
        kap.append(h('p', { class: 'dugmeler' }, goster, c.ayarlarFormu ? h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: ayarlariAc }, 'Eşiği değiştir') : null));
      }
      return kap;
    };
    const toplam = yuksek.length + s.kullanilmayan.length + s.bosSutunlar.length + s.kirikBasvurular.length;
    yerlestir(kok,
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon(toplam ? 'uyari' : 'onay'), 'Veri sağlığı'),
        h('span', { class: 'sag kucuk soluk' }, toplam ? `${toplam} madde` : 'sorun yok', gecmisDugmesi, ayarDugmesi)),
      h('div', { class: 'saglik-bolumleri' },
        yuksek.length || !dusuk.length ? bolum('Birleştirilebilecek tablolar', yuksek.length, oneriIcerigi(), true)
          : h('details', { class: 'saglik-bolumu' }, h('summary', {}, h('span', {}, 'Birleştirilebilecek tablolar'), rozet('0', '')), oneriIcerigi()),
        bolum('Hiç kullanılmayan tablolar', s.kullanilmayan.length, liste(s.kullanilmayan.map((t) => h('li', {}, tabloDugmesi(t.id, t.ad),
          h('span', { class: 'soluk kucuk' }, 'hiçbir ekran / servis bağında, senaryoda ya da kuralda geçmiyor'))))),
        bolum('Boş sütunlar', s.bosSutunlar.length, liste(s.bosSutunlar.map((b) => h('li', {}, tabloDugmesi(b.tabloId, `${b.tablo} · ${b.sutun}`),
          h('span', { class: 'soluk kucuk' }, 'hiçbir satırda değer yok'))))),
        bolum('Kırık başvurular', s.kirikBasvurular.length, liste(s.kirikBasvurular.map((k) => h('li', {},
          h('a', { href: k.git }, k.yer), h('code', { class: 'duz' }, k.basvuru), h('span', { class: 'soluk kucuk' }, k.neden)))), true)));
  };
  ciz(c.veri);
  return kok;
}

/**
 * "Test verisi ayarları" diyaloğu (Veri sağlığı başlığındaki dişli): form ayarlar.js'ten gelir (açıklamalar ve "?" ipuçları formda).
 * @param {(kaydedildi: () => void) => Promise<HTMLElement>} formu @returns {Promise<boolean>} kaydedildiyse true
 */
function testVerisiAyarlariPenceresi(formu) {
  return new Promise((coz) => {
    let kaydedildi = false;
    const govde = h('div', { class: 'diyalog-govde' },
      h('h2', { id: 'test-verisi-ayarlari-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('ayar')), 'Test verisi ayarları'),
      h('p', { class: 'soluk kucuk' }, 'Ayarlar yükleniyor…'));
    const kapat = h('button', { type: 'button', class: 'hayalet' }, 'Kapat');
    const diyalog = h('dialog', { class: 'onay-diyalogu genis-onay test-verisi-ayarlari-diyalogu', 'aria-labelledby': 'test-verisi-ayarlari-basligi' },
      govde, h('div', { class: 'diyalog-alt' }, kapat));
    kapat.addEventListener('click', () => diyalog.close());
    diyalog.addEventListener('close', () => { diyalog.remove(); coz(kaydedildi); });
    document.body.append(diyalog);
    diyalog.showModal();
    formu(() => { kaydedildi = true; })
      .then((form) => { govde.lastChild?.replaceWith(form); })
      .catch((e) => { govde.lastChild?.replaceWith(h('div', { class: 'not-kutusu hata kucuk', role: 'alert' }, `Ayarlar okunamadı: ${e.message}`)); });
  });
}

/** "28.09.2026 14:05" (tarayıcının yerel saati). @param {string} iso */
function tarihMetni(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || '';
  const iki = (n) => String(n).padStart(2, '0');
  return `${iki(d.getDate())}.${iki(d.getMonth() + 1)}.${d.getFullYear()} ${iki(d.getHours())}:${iki(d.getMinutes())}`;
}

/**
 * Birleştirme geçmişi diyaloğu: her birleştirme bir satır (tarih, kaynak → kalan, sayılar, yedek, durum); satırdan onaylı "Geri al"
 * ve "Kaynak tabloları sil". Geri alınamayan satırda düğme kapalı ve nedeni yazılı.
 * @param {{ id: string }} proje @returns {Promise<boolean>} bir şey değiştiyse true
 */
export function birlestirmeGecmisiPenceresi(proje) {
  return new Promise((coz) => {
    let degisti = false;
    const govde = h('div', { class: 'diyalog-govde' });
    const kapat = h('button', { type: 'button', class: 'hayalet' }, 'Kapat');
    const diyalog = h('dialog', { class: 'onay-diyalogu genis-onay etki-diyalogu birlestirme-gecmisi-diyalogu', 'aria-labelledby': 'birlestirme-gecmisi-basligi' },
      govde, h('div', { class: 'diyalog-alt' }, kapat));
    const liste = h('div', { 'aria-live': 'polite' }, h('p', { class: 'soluk kucuk' }, 'Geçmiş yükleniyor…'));
    yerlestir(govde, [
      h('h2', { id: 'birlestirme-gecmisi-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('tarih')), 'Birleştirme geçmişi'),
      h('p', { class: 'soluk kucuk' }, 'Yapılan tablo birleştirmeleri (en yenisi üstte). Bir birleştirme, ondan sonra aynı tabloyu değiştiren birleştirmeler geri alınmadan geri alınamaz; birbirinden bağımsız olanlar istenen sırayla geri alınabilir.'),
      liste
    ]);
    const yukle = async () => {
      try {
        const r = await api(`/platform/tablo/birlestirme/gecmis?projeId=${q(proje.id)}`);
        yerlestir(liste, r.kayitlar.length ? h('ul', { class: 'birlestirme-gecmisi-listesi', 'aria-label': 'Birleştirmeler' }, r.kayitlar.map(satir))
          : h('p', { class: 'soluk kucuk' }, 'Henüz birleştirme yok.'));
      } catch (e) { yerlestir(liste, h('div', { class: 'not-kutusu hata kucuk', role: 'alert' }, `Geçmiş okunamadı: ${e.message}`)); }
    };
    const sonra = () => { degisti = true; return yukle(); };
    function satir(k) {
      const etkin = k.durum === 'etkin';
      const nedenId = `gecmis-neden-${k.id}`;
      const sayilar = [k.eklenenSatir !== null ? `${k.eklenenSatir} satır eklendi` : '', k.bag ? `${k.bag} bağ` : '', k.senaryo ? `${k.senaryo} senaryo` : '']
        .filter(Boolean).join(' · ');
      const neden = etkin && !k.geriAlinabilir && k.neden ? k.neden : '';
      return h('li', { class: etkin ? '' : 'geri-alindi', 'aria-label': `${tarihMetni(k.zaman)} birleştirmesi` },
        h('div', { class: 'gecmis-ust' }, h('b', {}, tarihMetni(k.zaman)),
          etkin ? null : rozet(`geri alındı${k.geriAlinmaZamani ? ` (${tarihMetni(k.geriAlinmaZamani)})` : ''}`, 'soluk-rozet'),
          k.kaynaklarSilindi ? rozet('kaynaklar silindi', '') : null),
        h('div', {}, `${k.kaynaklar.map((x) => `“${x}”`).join(', ')} → “${k.kalan}”`, k.eskiAd ? h('span', { class: 'soluk' }, ` (ad: “${k.eskiAd}” → “${k.kalan}”)`) : null),
        sayilar || k.yedek ? h('div', { class: 'soluk kucuk' }, [sayilar, k.yedek ? `önce alınan yedek: ${k.yedek}` : ''].filter(Boolean).join(' · ')) : null,
        neden ? h('div', { class: 'not-kutusu uyari kucuk', id: nedenId }, neden, k.degisenler.length ? ` Değişen: ${k.degisenler.join(', ')}.` : '') : null,
        etkin && !k.kaynaklarSilindi && !k.kaynaklariSilinebilir && k.kaynakNedeni ? h('div', { class: 'soluk kucuk' }, `Kaynaklar silinemez: ${k.kaynakNedeni}`) : null,
        etkin ? h('div', { class: 'dugmeler' },
          h('button', { type: 'button', class: 'kucuk-dugme', disabled: !k.geriAlinabilir, ...(neden ? { 'aria-describedby': nedenId } : {}),
            onclick: (e) => geriAl(proje, k.id, e.currentTarget, sonra) }, ikon('geri'), 'Geri al…'),
          k.kaynaklarSilindi ? null : h('button', { type: 'button', class: 'kucuk-dugme', disabled: !k.kaynaklariSilinebilir,
            onclick: (e) => kaynaklariSil(proje, k.id, e.currentTarget, sonra) }, ikon('cop'), 'Kaynak tabloları sil…')) : null);
    }
    kapat.addEventListener('click', () => diyalog.close());
    diyalog.addEventListener('close', () => { diyalog.remove(); coz(degisti); });
    document.body.append(diyalog);
    diyalog.showModal();
    yukle();
  });
}

/** Geçmişteki bir birleştirmeyi onayla geri alır. */
async function geriAl(proje, birlestirmeId, dugme, yenile) {
  try {
    const on = await mesgulIken(dugme, 'Denetleniyor…', () => api('/platform/tablo/birlestirme/geri-al', { govde: { projeId: proje.id, birlestirmeId } }));
    if (on.geriAlinamaz) {
      await onayIste({ baslik: 'Birleştirme geri alınamaz', metin: `${on.neden}${on.yedek ? ` Birleştirmeden önce alınan yedek: ${on.yedek} (Ayarlar > Yedekleme).` : ''}`, liste: on.degisenler.map((x) => `Değişen: ${x}`), dugme: 'Tamam', ikonAd: 'uyari' });
      await yenile();
      return;
    }
    const o = on.onizleme;
    if (!(await onayIste({ baslik: 'Birleştirme geri alınsın mı?', metin: `“${o.kalan}” tablosu ve yeniden eşlenen ${o.kayit} kayıt birleştirmeden önceki hâline döner${o.kaynaklar.length ? `; ${o.kaynaklar.map((x) => `“${x}”`).join(', ')} geri gelir` : ''}.`, dugme: 'Geri al', ikonAd: 'geri' }))) return;
    await mesgulIken(dugme, 'Geri alınıyor…', () => api('/platform/tablo/birlestirme/geri-al', { govde: { projeId: proje.id, birlestirmeId, onay: true } }));
    bildir('Birleştirme geri alındı.');
    await yenile();
  } catch (e) { bildir(e.message, 'hata'); }
}

/** Bir birleştirmenin kaynak tablolarını ayrı onayla siler (kullanılıyorlarsa silinmez). */
async function kaynaklariSil(proje, birlestirmeId, dugme, yenile) {
  try {
    const on = await api('/platform/tablo/birlestirme/kaynaklari-sil', { govde: { projeId: proje.id, birlestirmeId } });
    if (on.silinemez) { bildir(on.neden, 'hata'); return; }
    if (!(await onayIste({ baslik: 'Kaynak tablolar silinsin mi?', metin: 'Birleştirilen tablolar artık hiçbir yerde kullanılmıyor. Silinince birleştirmeyi geri almak (Birleştirme geçmişi) onları da geri getirir.', liste: on.onizleme.tablolar.map((t) => `${t.ad} (${t.satir} satır)`), dugme: 'Sil', tehlikeli: true }))) return;
    await mesgulIken(dugme || document.createElement('button'), 'Siliniyor…', () => api('/platform/tablo/birlestirme/kaynaklari-sil', { govde: { projeId: proje.id, birlestirmeId, onay: true } }));
    bildir('Kaynak tablolar silindi.');
    await yenile();
  } catch (e) { bildir(e.message, 'hata'); }
}

/**
 * Birleştirme penceresi. Önizleme sunucuda denenir (hiçbir şey yazılmaz); seçim değişince yeniden hesaplanır.
 * @param {{ id: string }} proje @param {string[]} tabloIdleri @param {Record<string, any>} kullanim @param {Array<{ id: string; ad: string }>} tablolar
 * @returns {Promise<boolean>} birleştirme (ya da kaynak silme) yapıldıysa true
 */
export function birlestirmePenceresi(proje, tabloIdleri, kullanim, tablolar) {
  return new Promise((coz) => {
    const ad = (id) => (tablolar.find((t) => t.id === id) || {}).ad || id;
    const is = {
      kalanId: [...tabloIdleri].sort((a, b) => ((kullanim[b] || {}).toplam || 0) - ((kullanim[a] || {}).toplam || 0))[0],
      yeniAd: '', eslemeler: /** @type {Record<string, Record<string, string>>} */ ({}), eslemeOnayli: false, satirSecimleri: {}, karsilikSecimleri: {},
      silKaynak: false, onizleme: /** @type {any} */ (null), hata: '', hesaplaniyor: false, sira: 0
    };
    let degisti = false;
    const govde = h('div', { class: 'diyalog-govde' });
    const birlestir = h('button', { type: 'button', class: 'birincil', disabled: true }, ikon('esle'), 'Birleştir');
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Kapat');
    const diyalog = h('dialog', { class: 'onay-diyalogu genis-onay etki-diyalogu birlestirme-diyalogu', 'aria-labelledby': 'birlestirme-basligi' },
      govde, h('div', { class: 'diyalog-alt' }, vazgec, birlestir));
    const girdi = () => ({
      projeId: proje.id, kalanId: is.kalanId, kaynakIdler: tabloIdleri.filter((x) => x !== is.kalanId), ...(is.yeniAd.trim() ? { yeniAd: is.yeniAd.trim() } : {}),
      ...(is.eslemeOnayli ? { sutunEslemeleri: is.eslemeler } : {}), satirSecimleri: is.satirSecimleri, karsilikSecimleri: is.karsilikSecimleri
    });
    let zaman = null;
    const hesapla = (gecikme = 0) => {
      clearTimeout(zaman);
      const n = ++is.sira;
      is.hesaplaniyor = true;
      ciz();
      zaman = setTimeout(async () => {
        try {
          const r = await api('/platform/tablo/birlestir', { govde: girdi() });
          if (n !== is.sira) return;
          is.onizleme = r.onizleme; is.hata = '';
          // Eşleme adımı: sunucunun önerisi başlangıç değeridir (kullanıcı değiştirebilir / onaylar).
          for (const e of r.onizleme.eslemeler) {
            is.eslemeler[e.kaynakId] ??= {};
            if (is.eslemeler[e.kaynakId][e.kaynak] === undefined) is.eslemeler[e.kaynakId][e.kaynak] = e.hedef ?? '';
          }
          if (!r.onizleme.onayBekleyenEslemeler.length && !is.eslemeOnayli && r.onizleme.eslemeler.every((e) => e.kesin)) is.eslemeOnayli = true;
        } catch (e) { if (n === is.sira) { is.hata = e.message; is.onizleme = null; } }
        if (n === is.sira) { is.hesaplaniyor = false; ciz(); }
      }, gecikme);
    };

    // Başlık ve ad kutusu bir kez kurulur: önizleme her yeniden hesaplandığında yalnız kalan-tablo seçimi ve alt bölümler
    // yeniden çizilir; ad kutusu yerinde kaldığı için yazarken odak ve imleç kaybolmaz.
    const kalanKap = h('div');
    const altKap = h('div');
    const adG = h('input', { type: 'text', maxlength: '60', value: is.yeniAd, placeholder: ad(is.kalanId), 'aria-label': 'Kalan tablonun adı' });
    adG.addEventListener('input', () => { is.yeniAd = adG.value; hesapla(400); });
    yerlestir(govde, [
      h('h2', { id: 'birlestirme-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('esle')), 'Tabloları birleştir'),
      h('p', { class: 'soluk kucuk' }, 'Kalacak tabloyu seçin: diğerlerinin farklı satırları ona eklenir ve onları kullanan her şey (ekran / servis bağları, senaryolar, satır seçimleri, kurallar) ona yeniden eşlenir. Önce önizleme ve kuru doğrulama yapılır; onaylamadan hiçbir şey yazılmaz.'),
      h('h3', { class: 'kucuk-baslik' }, 'Kalacak tablo'), kalanKap,
      h('label', { class: 'alan-etiketi' }, h('span', {}, 'Kalan tablonun adı (boş: değişmez)'), adG),
      altKap
    ]);

    function ciz() {
      const o = is.onizleme;
      yerlestir(kalanKap, [h('div', { class: 'radyo-grubu dikey', role: 'radiogroup', 'aria-label': 'Kalacak tablo' }, tabloIdleri.map((id) => {
        const r = h('input', { type: 'radio', name: 'kalan-tablo', value: id, checked: id === is.kalanId });
        r.addEventListener('change', () => { is.kalanId = id; is.eslemeler = {}; is.eslemeOnayli = false; is.satirSecimleri = {}; is.karsilikSecimleri = {}; hesapla(); });
        const t = o && o.tablolar.find((x) => x.id === id);
        return h('label', { class: 'kalan-secenegi' }, r, h('span', {}, h('b', {}, ad(id)), t ? ` — ${t.sutunSayisi} sütun, ${t.satirSayisi} satır` : '',
          o && o.onerilenKalan === id ? h('span', { class: 'onerilen' }, rozet('en çok kullanılan (önerilen)', 'basari')) : null,
          h('span', { class: 'neden' }, kullanimMetni(kullanim[id]))));
      }))]);
      adG.placeholder = ad(is.kalanId);
      const bolumler = [];
      if (is.hata) bolumler.push(h('div', { class: 'not-kutusu hata', role: 'alert' }, is.hata));
      if (is.hesaplaniyor) bolumler.push(h('p', { class: 'soluk kucuk', 'aria-live': 'polite' }, 'Önizleme hesaplanıyor…'));
      if (o) bolumler.push(...onizlemeBolumleri(o));
      yerlestir(altKap, bolumler);
      birlestir.disabled = !o || is.hesaplaniyor || !o.dogrulandi || !o.imza || o.engeller.length > 0;
    }

    function onizlemeBolumleri(o) {
      const sonuc = [];
      if (o.engeller.length) sonuc.push(h('div', { class: 'not-kutusu hata kucuk', role: 'alert' }, h('b', {}, 'Birleştirilemez: '), h('ul', { class: 'etki-ozeti' }, o.engeller.map((x) => h('li', {}, x)))));
      // Sütun eşleme
      const eslemeSatirlari = o.eslemeler.map((e) => {
        const hedefler = o.tablolar.find((t) => t.id === is.kalanId);
        const sec = h('select', { 'aria-label': `${e.kaynakTablo} · ${e.kaynak} eşlemesi` },
          h('option', { value: '' }, 'Yeni sütun olarak ekle'),
          o.sutunlar.filter((s) => !s.yeni || s.ad === e.hedef).map((s) => h('option', { value: s.ad, selected: (is.eslemeler[e.kaynakId] || {})[e.kaynak] === s.ad }, s.ad)));
        sec.value = (is.eslemeler[e.kaynakId] || {})[e.kaynak] ?? '';
        sec.addEventListener('change', () => { (is.eslemeler[e.kaynakId] ??= {})[e.kaynak] = sec.value; is.eslemeOnayli = true; hesapla(); });
        return h('tr', {}, h('td', { 'data-baslik': 'Tablo' }, e.kaynakTablo), h('td', { 'data-baslik': 'Sütun' }, e.kaynak, e.gizli ? h('span', { class: 'neden' }, 'gizli') : null),
          h('td', { 'data-baslik': `→ ${hedefler ? hedefler.ad : ''}` }, sec, e.kesin ? null : h('span', { class: 'neden' }, e.onerilen ? `öneri: ${e.onerilen} (emin değil; onaylayın)` : 'eşleşen sütun yok')));
      });
      const bekleyen = !is.eslemeOnayli && o.onayBekleyenEslemeler.length;
      // Biri gizli biri açık eşleşen sütunlar: birleşik sütun gizli olur (değerler maskelenir, şifreli saklanır).
      const gizlilesen = o.sutunlar.filter((s) => s.not);
      if (gizlilesen.length) {
        sonuc.push(h('ul', { class: 'not-kutusu bilgi kucuk gizlilesen-sutunlar', 'aria-label': 'Gizli olacak sütunlar' },
          gizlilesen.map((s) => h('li', {}, ikon('kilit'), ' ', h('b', {}, `${s.ad}: `), s.not))));
      }
      sonuc.push(h('details', { class: 'saglik-bolumu', open: Boolean(bekleyen) || o.eslemeler.some((e) => !e.kesin) },
        h('summary', {}, h('span', {}, 'Sütun eşleme'), bekleyen ? rozet(`${o.onayBekleyenEslemeler.length} onay bekliyor`, 'uyari') : rozet('onaylı', 'basari')),
        h('div', { class: 'donusum-tablosu-kap' }, h('table', { class: 'donusum-tablosu', 'aria-label': 'Sütun eşleme' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Tablo'), h('th', {}, 'Sütun'), h('th', {}, 'Kalan tablodaki sütun'))), h('tbody', {}, eslemeSatirlari))),
        bekleyen ? h('div', { class: 'dugmeler' }, h('button', { type: 'button', class: 'kucuk-dugme birincil', onclick: () => { is.eslemeOnayli = true; hesapla(); } }, ikon('onay'), 'Eşlemeyi onayla ve önizle')) : null));
      if (bekleyen) return sonuc;
      const st = o.satirlar;
      sonuc.push(h('h3', { class: 'kucuk-baslik' }, 'Satırlar'),
        h('p', { class: 'kucuk' }, `${st.kalan} satır kalır, ${st.eklenecek} satır eklenir, ${st.ayni} satır zaten aynı (eklenmez)${st.cakisan ? `, ${st.cakisan} satır aynı adla farklı` : ''}. Birleşik tabloda ${st.toplam} satır${st.ortamaOzel ? ` (${st.ortamaOzel} ortama özel satır kendi ortamında kalır)` : ''}.`));
      if (o.satirCakismalari.length) {
        sonuc.push(h('div', { class: 'donusum-tablosu-kap' }, h('table', { class: 'donusum-tablosu', 'aria-label': 'Satır çakışmaları' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Satır'), h('th', {}, 'Farklı sütunlar'), h('th', {}, 'Seçim'))),
          h('tbody', {}, o.satirCakismalari.map((c) => {
            const sec = h('select', { 'aria-label': `${c.satir} satırı için seçim` }, Object.entries(SECIM).map(([k, m]) => h('option', { value: k, selected: c.secim === k }, m)));
            sec.addEventListener('change', () => { is.satirSecimleri[c.anahtar] = sec.value; hesapla(); });
            const farkli = c.sutunlar.filter((x) => !x.ayni);
            return h('tr', {}, h('td', { 'data-baslik': 'Satır' }, c.satir, h('span', { class: 'neden' }, `${c.kaynakTablo}${c.ortam ? ` · ${c.ortam}` : ''}`)),
              h('td', { 'data-baslik': 'Farklı' }, farkli.map((x) => h('div', {}, h('b', {}, `${x.sutun}: `), x.gizli ? h('span', { title: 'Gizli değer gösterilmez' }, 'farklı (gizli •••)') : `${x.kalan || '—'} → ${x.kaynak || '—'}`))),
              h('td', { 'data-baslik': 'Seçim' }, sec));
          })))));
      }
      if (o.karsilikCakismalari.length) {
        sonuc.push(h('h3', { class: 'kucuk-baslik' }, 'Karşılık çakışmaları'), h('div', { class: 'donusum-tablosu-kap' }, h('table', { class: 'donusum-tablosu', 'aria-label': 'Karşılık çakışmaları' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Sütun · değer'), h('th', {}, 'Kalan'), h('th', {}, 'Kaynak'), h('th', {}, 'Seçim'))),
          h('tbody', {}, o.karsilikCakismalari.map((c) => {
            const sec = h('select', { 'aria-label': `${c.sutun} ${c.deger} karşılığı` }, h('option', { value: 'kalan', selected: c.secim === 'kalan' }, 'Kalanınki'), h('option', { value: 'kaynak', selected: c.secim === 'kaynak' }, 'Kaynaktaki'));
            sec.addEventListener('change', () => { is.karsilikSecimleri[c.anahtar] = sec.value; hesapla(); });
            const k = (x) => [x.sayfa ? `sayfa: ${x.sayfa}` : '', x.servis ? `servis: ${x.servis}` : ''].filter(Boolean).join(', ') || '—';
            return h('tr', {}, h('td', { 'data-baslik': 'Değer' }, `${c.sutun} · ${c.deger}`), h('td', { 'data-baslik': 'Kalan' }, k(c.kalan)), h('td', { 'data-baslik': c.kaynakTablo }, k(c.kaynak)), h('td', { 'data-baslik': 'Seçim' }, sec));
          })))));
      }
      const esleme = Object.entries(o.yenidenEsleme).filter(([, n]) => n);
      sonuc.push(h('h3', { class: 'kucuk-baslik' }, 'Yeniden eşlenecekler'),
        esleme.length ? h('ul', { class: 'etki-ozeti' }, esleme.map(([k, n]) => h('li', {}, `${n} ${ESLEME[k] || k}`))) : h('p', { class: 'soluk kucuk' }, 'Birleştirilen tabloları kullanan bir şey yok.'),
        o.senaryolar.length ? h('details', {}, h('summary', { class: 'kucuk' }, `${o.senaryolar.length} senaryo güncellenir`), h('ul', { class: 'etki-ozeti' }, o.senaryolar.map((x) => h('li', {}, `${x.tur === 'ekran' ? 'Ekran' : 'Servis'}: ${x.ad}`)))) : null);
      sonuc.push(h('h3', { class: 'kucuk-baslik' }, 'Kuru doğrulama'));
      if (o.engeller.length) sonuc.push(h('p', { class: 'soluk kucuk' }, 'Engeller giderilince yapılır.'));
      else if (o.dogrulandi) sonuc.push(h('div', { class: 'not-kutusu basari kucuk' }, ikon('onay'), ' Etkilenen senaryolar ve servis istekleri, hiçbir şey çalıştırılmadan her ortamda çözüldü: birleştirmeden sonra aynı değerleri üretiyorlar.'));
      else {
        sonuc.push(h('div', { class: 'not-kutusu uyari kucuk' }, h('b', {}, 'Birleştirme yapılamaz: '), 'aşağıdaki senaryolarda koşuda giden değer değişirdi. Seçimleri (satır / karşılık / eşleme) değiştirin ya da senaryoları düzenleyin.'),
          h('div', { class: 'donusum-tablosu-kap' }, h('table', { class: 'donusum-tablosu', 'aria-label': 'Kuru doğrulama farkları' },
            h('thead', {}, h('tr', {}, h('th', {}, 'Senaryo'), h('th', {}, 'Ortam'), h('th', {}, 'Alanlar'), h('th', {}, 'Neden'))),
            h('tbody', {}, o.farklar.map((f) => h('tr', {},
              h('td', { 'data-baslik': 'Senaryo' }, h('a', { href: f.tur === 'ekran' ? `#/senaryolar/duzenle/${q(f.senaryoId)}` : `#/servisler/s/${q(f.kaynakId)}/senaryo/${q(f.senaryoId)}` }, f.baslik),
                h('span', { class: 'neden' }, `${f.tur === 'ekran' ? 'Ekran' : 'Servis'}: ${f.kaynakAdi}`)),
              h('td', { 'data-baslik': 'Ortam' }, f.ortam), h('td', { 'data-baslik': 'Alanlar' }, f.alanlar.join(', ') || '—'), h('td', { 'data-baslik': 'Neden' }, f.neden)))))));
      }
      const sil = h('input', { type: 'checkbox', checked: is.silKaynak, id: 'birlestirme-kaynak-sil' });
      sil.addEventListener('change', () => { is.silKaynak = sil.checked; });
      sonuc.push(h('p', { class: 'soluk kucuk' }, `Birleştirmeden hemen önce otomatik yedek alınır; Veri sağlığı > Birleştirme geçmişi'nden geri alabilirsiniz. Kaynak tablolar (${o.kaynaklarSilinmez.map((x) => `“${x}”`).join(', ')}) silinmez.`),
        h('label', { class: 'secenek', for: sil.id }, sil, 'Birleştirmeden sonra kaynak tabloları da sil (ayrıca onay istenir)'));
      return sonuc;
    }

    birlestir.addEventListener('click', async () => {
      const o = is.onizleme;
      if (!o) return;
      const tamam = await onayIste({
        baslik: 'Tablolar birleştirilsin mi?', ikonAd: 'esle', dugme: 'Birleştir',
        metin: `${o.tablolar.filter((t) => t.id !== is.kalanId).map((t) => `“${t.ad}”`).join(', ')} → “${o.kalan.yeniAd}”. Tek işlemde yazılır; önce yedek alınır.`,
        liste: [`${o.satirlar.eklenecek} satır eklenir`, ...Object.entries(o.yenidenEsleme).filter(([, n]) => n).map(([k, n]) => `${n} ${ESLEME[k] || k}`)]
      });
      if (!tamam) return;
      try {
        const r = await mesgulIken(birlestir, 'Birleştiriliyor…', () => api('/platform/tablo/birlestir', { govde: { ...girdi(), kip: 'uygula', beklenenImza: o.imza } }));
        if (!r.uygulandi) {
          is.onizleme = r.onizleme;
          bildir(r.onayGerekli ? 'Önizlemeden sonra veriler değişti; güncel önizlemeyi inceleyip yeniden onaylayın.' : 'Kuru doğrulama farkı: birleştirme yapılmadı.', 'hata');
          ciz();
          return;
        }
        degisti = true;
        bildir(`Tablolar birleştirildi: “${o.kalan.yeniAd}”.`);
        diyalog.close();
        if (is.silKaynak) await kaynaklariSil(proje, r.birlestirmeId, null, () => undefined);
      } catch (e) { bildir(e.message, 'hata'); }
    });
    vazgec.addEventListener('click', () => diyalog.close());
    diyalog.addEventListener('close', () => { diyalog.remove(); coz(degisti); });
    document.body.append(diyalog);
    diyalog.showModal();
    hesapla();
  });
}

/**
 * "Benzer tablo var" notu (önleme): yeni tablo oluşturulacakken başlıkları aynı (esnek) tablo varsa onu kullanmayı önerir.
 * sutunlar(): oluşturulacak sütun adları; ad(): yazılacak tablo adı (var olan bir tablonun adıysa not gizlenir); kullan(ad): "Onu kullan".
 * @param {{ id: string }} proje @param {{ sutunlar: () => string[]; ad: () => string; kullan: (ad: string) => void }} c
 */
export function benzerTabloNotu(proje, c) {
  const kok = h('div', { class: 'not-kutusu bilgi kucuk benzer-tablo-notu', hidden: true, 'aria-live': 'polite' });
  let zaman = null;
  let sira = 0;
  const yenile = (gecikme = 300) => {
    clearTimeout(zaman);
    const n = ++sira;
    zaman = setTimeout(async () => {
      const sutunlar = c.sutunlar();
      if (sutunlar.length < 2) { kok.hidden = true; return; }
      try {
        const r = await api('/platform/tablo/benzer', { govde: { projeId: proje.id, sutunlar, ad: c.ad() } });
        if (n !== sira) return;
        const goster = r.benzerler.length > 0 && !r.adVar;
        kok.hidden = !goster;
        yerlestir(kok, goster ? [h('b', {}, 'Benzer tablo var: '), ...r.benzerler.slice(0, 3).flatMap((b, i) => [i ? ', ' : '', `“${b.ad}”`]),
          ' (sütun başlıkları aynı). ', ...r.benzerler.slice(0, 3).map((b) => h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { c.kullan(b.ad); yenile(0); } }, `Onu kullan: ${b.ad}`)),
          h('span', { class: 'soluk' }, ' ya da yine de yeni tablo oluşturun (adı değiştirmeyin).')] : []);
      } catch { kok.hidden = true; }
    }, gecikme);
  };
  return { kok, yenile };
}
