// "Bulgular" ekranı (tekrar analiz): yeni sayfa paketi ile güncel model arasındaki farklar.
//   Özet metrikler · tür filtreleri · bulgu satırları (tür rozeti, konum, eski → yeni, bağlam profiline göre
//   görünürlük) · Kabul et / Reddet · toplu kabul/red · "Kararları uygula" (YALNIZCA kabul edilenlerle yeni
//   model sürümü; reddedilenler hatırlanır, aynı değişiklik tekrar gösterilmez).
//   Etki paneli (seçili bulgu): etkilenen senaryolar; zorunlu yeni alanda eksik değer → toplu değer atama
//   (bulgu kabul edilip uygulandıktan sonra) ya da tek tek düzenleme; "Eksik kombinasyonlara senaryo öner"
//   ve "Yapay zekâ ile yorumla" (gizli değer içermeyen analiz dosyası; Nöbetçi hiçbir yapay zekâ servisine bağlanmaz).
// Karar taslağı sekme oturumunda (sessionStorage) tutulur; kalıcı olan yalnızca "Kararları uygula"dır.
import { api, bildir, bosDurum, h, ikon, iskelet, mesgulIken, rozet, tarihMetni, yerlestir } from './ortak.js';
import {
  BULGU_TURLERI, baglamMatrisi, bulguRozeti, claudeDosyasiOlustur, farkGosterimi, goreliZaman, onayIste
} from './ekran-ortak.js';

const ETKI_METNI = { eksikDeger: 'eksik değer', kullanilanSecenek: 'kullanılan seçenek', kaldirilanAlanKullanimi: 'başvuru', tipKontrolu: 'tip kontrolü', gorunmezProfil: 'görünmez profil' };
const hataKutusu = (hata) => h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message || String(hata));
const taslakAnahtari = (id) => `platform.bulguKararlari.${id}`;

function taslakOku(id) {
  try { const t = JSON.parse(sessionStorage.getItem(taslakAnahtari(id)) || '{}'); return t && typeof t === 'object' ? t : {}; } catch { return {}; }
}
function taslakYaz(id, kararlar) {
  try { sessionStorage.setItem(taslakAnahtari(id), JSON.stringify(Object.fromEntries(kararlar))); } catch { /* yok sayılır */ }
}
function taslakSil(id) {
  try { sessionStorage.removeItem(taslakAnahtari(id)); } catch { /* yok sayılır */ }
}

/**
 * @param {HTMLElement} icerik
 * @param {{ proje: { id: string; ad: string }; ekranId: string }} s
 */
export async function bulgularEkrani(icerik, s, secimKorunsun = null) {
  yerlestir(icerik, iskelet('sayfa'));
  let v;
  try {
    v = await api(`/platform/ekran/analiz?projeId=${encodeURIComponent(s.proje.id)}&id=${encodeURIComponent(s.ekranId)}`);
  } catch (e) {
    if (e.durum !== 423) yerlestir(icerik, hataKutusu(e));
    return;
  }
  const ekranAdresi = `#/ekranlar/e/${encodeURIComponent(s.ekranId)}`;
  const baslik = h('div', { class: 'sayfa-basligi' },
    h('div', {},
      h('div', { class: 'kirinti' }, h('span', {}, s.proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: '#/ekranlar' }, 'Ekranlar'),
        h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: ekranAdresi }, v.ekran.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, 'Bulgular')),
      h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, 'Bulgular'),
        v.analiz ? (v.analiz.durum === 'uygulandi'
          ? rozet(v.analiz.sonucSurum ? `uygulandı → v${v.analiz.sonucSurum}` : 'uygulandı (model değişmedi)', 'basari')
          : rozet('karar bekliyor', 'uyari')) : null),
      v.analiz ? h('div', { class: 'meta' },
        h('span', {}, ikon('dosya'), `paket: ${v.analiz.meta.olusturan} · ${tarihMetni(v.analiz.meta.olusturulma)}`),
        h('span', {}, ikon('katman'), `taban: model v${v.analiz.tabanSurum}`),
        v.analiz.meta.baglamProfilleri && v.analiz.meta.baglamProfilleri.length ? h('span', {}, ikon('hedef'), `bağlam: ${v.analiz.meta.baglamProfilleri.join(', ')}`) : null,
        h('span', { title: tarihMetni(v.analiz.zaman) }, ikon('saat'), `yüklendi ${goreliZaman(v.analiz.zaman)}`)) : null),
    h('div', { class: 'eylemler' },
      v.analiz ? yorumlaDugmesi(s) : null,
      h('a', { class: 'dugme', href: `${ekranAdresi}/yukle` }, ikon('yukle'), 'Yeni paket yükle'),
      h('a', { class: 'dugme hayalet', href: ekranAdresi }, ikon('geri'), 'Ekrana dön')));
  if (!v.analiz) {
    yerlestir(icerik, baslik, bosDurum('Bu ekran için analiz yok.', 'Ekranın yeni bir sayfa paketini yükleyin: paket güncel modelle karşılaştırılır ve farklar burada bulgu olarak listelenir.', {
      ikon: 'yenile', eylem: h('a', { class: 'dugme birincil', href: `${ekranAdresi}/yukle` }, ikon('yukle'), 'Paket yükle')
    }));
    return;
  }
  const a = v.analiz;
  const uygulandi = a.durum === 'uygulandi';
  const kararlar = new Map();
  if (uygulandi) { for (const b of a.bulgular) if (b.karar) kararlar.set(b.id, b.karar); }
  else for (const [id, k] of Object.entries(taslakOku(a.id))) if (a.bulgular.some((b) => b.id === id) && (k === 'kabul' || k === 'red')) kararlar.set(id, k);
  const etki = new Map(a.etki.map((x) => [x.bulguId, x]));
  let filtre = '';
  let secili = secimKorunsun && a.bulgular.some((b) => b.id === secimKorunsun) ? secimKorunsun
    : (a.bulgular.find((b) => (etki.get(b.id)?.senaryolar.length ?? 0) > 0) || a.bulgular[0] || {}).id;

  const metrikAlani = h('div', {});
  const filtreAlani = h('div', {});
  const listeAlani = h('div', {});
  const etkiAlani = h('div', {});
  const altCubuk = h('div', {});

  const ciz = () => {
    const kabul = a.bulgular.filter((b) => kararlar.get(b.id) === 'kabul').length;
    const red = a.bulgular.filter((b) => kararlar.get(b.id) === 'red').length;
    const bekleyen = a.bulgular.length - kabul - red;
    const etkilenen = new Set();
    for (const b of a.bulgular) {
      if (uygulandi && kararlar.get(b.id) !== 'kabul') continue;
      for (const x of etki.get(b.id)?.senaryolar ?? []) etkilenen.add(x.id);
    }
    const kart = (sinif, etiket, deger, alt) => h('div', { class: `sonuc-karti ${sinif}` },
      h('div', { class: 'kart-etiket' }, etiket), h('div', { class: 'kart-deger' }, h('span', { class: 'kart-sayi' }, String(deger))), h('div', { class: 'kart-alt' }, h('span', {}, alt)));
    yerlestir(metrikAlani, h('div', { class: 'sonuc-kartlari bulgu-metrikleri' },
      kart('', 'Toplam bulgu', a.bulgular.length, `${Object.keys(a.ozet.turler).length} türde${a.gizlenenSayisi ? ` · ${a.gizlenenSayisi} gizli` : ''}`),
      kart('basarili', uygulandi ? 'Kabul edildi' : 'Kabul edilecek', kabul, uygulandi ? 'modele eklendi' : 'yeni sürüme girer'),
      kart('basarisiz', uygulandi ? 'Reddedildi' : 'Reddedilecek', red, 'hatırlanır, tekrar gösterilmez'),
      kart('atlanan', 'Karar bekleyen', bekleyen, uygulandi ? 'hatırlanmadı' : bekleyen ? 'karar verin' : 'hepsi karara bağlandı'),
      kart('durduruldu', 'Etkilenen senaryo', etkilenen.size, `${a.senaryoSayisi} senaryodan`)));
    // Filtre çipleri
    const turSayilari = a.ozet.turler;
    const cip = (tur, etiket, sayi) => h('button', { type: 'button', class: 'rozet hap filtre-cipi', 'aria-pressed': filtre === tur ? 'true' : 'false', onclick: () => { filtre = tur; ciz(); } }, etiket, h('b', {}, String(sayi)));
    yerlestir(filtreAlani, h('div', { class: 'bulgu-arac-cubugu' },
      h('div', { class: 'kategori-cipleri', role: 'group', 'aria-label': 'Bulgu türü' }, cip('', 'Tümü', a.bulgular.length),
        Object.entries(turSayilari).map(([t, n]) => cip(t, BULGU_TURLERI[t]?.etiket || t, n))),
      uygulandi ? null : h('span', { class: 'sag' },
        h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => toplu('kabul') }, ikon('onay'), filtre ? 'Görünenleri kabul et' : 'Tümünü kabul et'),
        h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => toplu('red') }, ikon('carpi'), filtre ? 'Görünenleri reddet' : 'Tümünü reddet'),
        h('button', { type: 'button', class: 'kucuk-dugme hayalet', disabled: !kararlar.size, onclick: () => toplu(null) }, 'Kararları temizle'))));
    listeCiz();
    etkiCiz();
    altCubukCiz(kabul, red, bekleyen);
  };

  const gorunenler = () => a.bulgular.filter((b) => !filtre || b.tur === filtre);
  function toplu(karar) {
    for (const b of gorunenler()) { if (karar) kararlar.set(b.id, karar); else kararlar.delete(b.id); }
    taslakYaz(a.id, kararlar);
    ciz();
  }

  function listeCiz() {
    const liste = gorunenler();
    yerlestir(listeAlani, h('ul', { class: 'bulgu-listesi kart', 'aria-label': 'Bulgular' }, liste.map((b) => {
      const k = kararlar.get(b.id) || null;
      const e = etki.get(b.id);
      const etkiSayisi = e ? e.senaryolar.length : 0;
      const kararDugmesi = (tur, etiket, ikonAd) => h('button', {
        type: 'button', class: `kucuk-dugme karar-dugmesi ${tur}`, 'aria-pressed': k === tur ? 'true' : 'false',
        onclick: (o) => { o.stopPropagation(); if (k === tur) kararlar.delete(b.id); else kararlar.set(b.id, tur); taslakYaz(a.id, kararlar); ciz(); }
      }, ikon(ikonAd), etiket);
      return h('li', {
        class: `bulgu-satiri ${secili === b.id ? 'secili' : ''} ${k ? `karar-${k}` : ''}`.trim(), 'data-bulgu': b.id, tabindex: '0',
        'aria-label': `${b.baslik}${k ? ` (${k === 'kabul' ? 'kabul' : 'red'})` : ''}`,
        onclick: () => { secili = b.id; listeCiz(); etkiCiz(); },
        onkeydown: (o) => { if (o.key === 'Enter' || o.key === ' ') { o.preventDefault(); secili = b.id; listeCiz(); etkiCiz(); } }
      },
        h('div', { class: 'bulgu-tur' }, bulguRozeti(b.tur)),
        h('div', { class: 'bulgu-ana' },
          h('strong', {}, b.baslik),
          h('small', {}, b.konum),
          farkGosterimi(b),
          b.baglam ? h('div', { class: 'bulgu-baglam' }, h('span', { class: 'cok-soluk kucuk' }, 'görünürlük:'), baglamMatrisi(b.baglam, a.profiller)) : null),
        h('div', { class: 'bulgu-sag' },
          etkiSayisi ? h('span', { class: `etki-hapi ${e.tur === 'eksikDeger' || e.tur === 'kullanilanSecenek' ? 'uyari' : ''}`, title: e.mesaj }, ikon('liste'), `${etkiSayisi} senaryo`) : null,
          uygulandi
            ? (k === 'kabul' ? rozet('kabul edildi', 'basari') : k === 'red' ? rozet('reddedildi', 'hata') : rozet('karar verilmedi'))
            : h('div', { class: 'karar-grubu', role: 'group', 'aria-label': `Karar: ${b.baslik}` }, kararDugmesi('kabul', 'Kabul et', 'onay'), kararDugmesi('red', 'Reddet', 'carpi'))));
    })));
  }

  function etkiCiz() {
    const b = a.bulgular.find((x) => x.id === secili);
    if (!b) { yerlestir(etkiAlani); return; }
    const e = etki.get(b.id);
    const k = kararlar.get(b.id);
    const senaryoListesi = e && e.senaryolar.length ? h('ul', { class: 'etki-senaryolari' }, e.senaryolar.map((x) => h('li', {},
      h('a', { href: `#/senaryolar/duzenle/${encodeURIComponent(x.id)}`, title: 'Senaryoyu düzenle' }, x.baslik),
      x.mutlakaGorunmeli ? rozet('mutlaka görünmeli', 'durdu', { title: 'Alan görünmezse test başarısız olur' }) : null,
      x.deger ? h('code', {}, x.deger) : null))) : null;
    let atama = null;
    if (e && e.tur === 'eksikDeger' && e.senaryolar.length && e.atanabilir) {
      const hazir = uygulandi && k === 'kabul';
      const girdi = e.secenekler && e.secenekler.length
        ? h('select', { 'aria-label': 'Atanacak değer' }, h('option', { value: '' }, 'Değer seçin…'), e.secenekler.map((x) => h('option', { value: x.deger }, x.metin)))
        : e.alanTipi === 'onayKutusu'
          ? h('select', { 'aria-label': 'Atanacak değer' }, h('option', { value: '' }, 'Seçin…'), h('option', { value: 'true' }, 'İşaretli'), h('option', { value: 'false' }, 'İşaretsiz'))
          : h('input', { type: e.alanTipi === 'sayi' ? 'number' : 'text', 'aria-label': 'Atanacak değer', placeholder: 'Değer' });
      const ata = h('button', { type: 'button', class: 'birincil', disabled: !hazir }, ikon('onay'), `${e.senaryolar.length} senaryoya ata`);
      ata.addEventListener('click', async () => {
        const ham = girdi.value;
        if (!ham) { bildir('Önce bir değer seçin.', 'hata'); girdi.focus(); return; }
        const deger = e.alanTipi === 'onayKutusu' ? ham === 'true' : ham;
        const tamam = await onayIste({
          baslik: `"${e.anahtar}" değeri atansın mı?`, metin: `Seçilen ${e.senaryolar.length} senaryonun tüm ortam verilerinde bu alana değer yazılır (değişiklik geçmişine kaydedilir).`,
          liste: e.senaryolar.map((x) => x.baslik), dugme: 'Değeri ata', ikonAd: 'duzenle'
        });
        if (!tamam) return;
        try {
          const r = await mesgulIken(ata, 'Atanıyor…', () => api('/platform/ekran/toplu-ata', {
            govde: { projeId: s.proje.id, ekranId: s.ekranId, anahtar: e.anahtar, deger, senaryoIdler: e.senaryolar.map((x) => x.id) }
          }));
          bildir(`${r.guncellenen} senaryo güncellendi.`);
          await bulgularEkrani(icerik, s, b.id);
        } catch (hata) {
          if (hata.durum !== 423) bildir(hata.message, 'hata');
        }
      });
      atama = h('div', { class: 'toplu-atama' },
        h('div', { class: 'ara-baslik' }, 'Toplu değer ata'),
        h('div', { class: 'toplu-atama-satiri' }, girdi, ata),
        hazir ? h('p', { class: 'kucuk cok-soluk' }, 'Ya da senaryoları tek tek düzenleyin (listeden açın).')
          : h('div', { class: 'not-kutusu bilgi' }, uygulandi ? 'Bu bulgu kabul edilmediği için alan modelde yok.' : 'Toplu atama, bulgu KABUL edilip kararlar uygulandıktan sonra açılır (alan önce modele girmeli). Senaryolar şimdiden tek tek düzenlenebilir.'));
    }
    const oner = h('button', { type: 'button', class: 'kucuk-dugme' }, ikon('simsek'), 'Eksik kombinasyonlara senaryo öner');
    oner.addEventListener('click', () => claudeDosyasiOlustur({ proje: s.proje, ekranId: s.ekranId, tur: 'eksik-kombinasyon', bulguId: b.id }, oner));
    yerlestir(etkiAlani, h('section', { class: 'kart etki-paneli', 'aria-label': 'Etki paneli' },
      h('div', { class: 'bolum-etiketi' }, ikon('hedef'), 'Etki paneli'),
      h('div', { class: 'etki-basligi' }, bulguRozeti(b.tur), h('strong', {}, b.baslik)),
      h('p', { class: 'kucuk soluk' }, b.konum),
      farkGosterimi(b),
      b.baglam ? h('div', { class: 'etki-baglam' }, h('div', { class: 'ara-baslik' }, 'Bağlam profiline göre görünürlük (gözlem)'), baglamMatrisi(b.baglam, a.profiller),
        h('p', { class: 'kucuk cok-soluk' }, 'Bilgi amaçlıdır: koşuda alan görünüyorsa doldurulur, görünmüyorsa atlanır; "mutlaka görünmeli" işaretli senaryo başarısız olur.')) : null,
      h('div', { class: 'ara-baslik' }, 'Etkilenen senaryolar', e && e.senaryolar.length ? rozet(String(e.senaryolar.length), e.tur === 'eksikDeger' || e.tur === 'kullanilanSecenek' ? 'uyari' : 'vurgu') : null,
        e && ETKI_METNI[e.tur] ? h('span', { class: 'cok-soluk kucuk' }, ETKI_METNI[e.tur]) : null),
      e && e.mesaj ? h('p', { class: `etki-mesaji ${e.senaryolar.length ? 'var' : ''}` }, e.mesaj) : h('p', { class: 'kucuk soluk' }, 'Bu bulgu senaryo verisini etkilemiyor.'),
      senaryoListesi,
      atama,
      h('div', { class: 'etki-alt' }, oner, h('span', { class: 'kucuk cok-soluk' }, 'Yapay zekâ aracınız için gizli değer içermeyen bir öneri isteği dosyası yazılır.'))));
  }

  function altCubukCiz(kabul, red, bekleyen) {
    if (uygulandi) {
      yerlestir(altCubuk, h('div', { class: 'not-kutusu basari' },
        `Kararlar ${tarihMetni(a.uygulanma)} tarihinde uygulandı: ${kabul} kabul, ${red} red${a.sonucSurum ? ` → model v${a.sonucSurum}` : ' (yeni sürüm oluşmadı)'}. Reddedilen değişiklikler sonraki paketlerde gösterilmez.`));
      return;
    }
    const uygula = h('button', { type: 'button', class: 'birincil', disabled: !kabul && !red }, ikon('onay'), 'Kararları uygula');
    uygula.addEventListener('click', async () => {
      const kabulListesi = a.bulgular.filter((b) => kararlar.get(b.id) === 'kabul');
      const redListesi = a.bulgular.filter((b) => kararlar.get(b.id) === 'red');
      const tamam = await onayIste({
        baslik: kabulListesi.length ? `Model v${v.guncelSurum + 1} oluşturulsun mu?` : 'Kararlar kaydedilsin mi?',
        metin: `${kabulListesi.length} bulgu modele eklenecek, ${redListesi.length} bulgu reddedilip hatırlanacak${bekleyen ? `; karar verilmeyen ${bekleyen} bulgu hatırlanmaz (sonraki pakette yeniden gelir)` : ''}. Mevcut sürüm değişmez; yeni sürüm eklenir.`,
        liste: [...kabulListesi.map((b) => `✓ ${b.baslik}`), ...redListesi.map((b) => `✕ ${b.baslik}`)], dugme: 'Kararları uygula'
      });
      if (!tamam) return;
      try {
        const r = await mesgulIken(uygula, 'Uygulanıyor…', () => api('/platform/ekran/analiz/uygula', {
          govde: { projeId: s.proje.id, ekranId: s.ekranId, analizId: a.id, kabul: kabulListesi.map((b) => b.id), red: redListesi.map((b) => b.id) }
        }));
        taslakSil(a.id);
        bildir(`${r.yeniSurum ? `Model v${r.surum} oluşturuldu (${r.kabul} kabul, ${r.red} red).` : `${r.red} bulgu reddedildi; model değişmedi.`}${r.baglanan ? ` ${r.baglanan} alan test verisi tablosuna bağlandı.` : ''}`);
        await bulgularEkrani(icerik, s, secili);
      } catch (e) {
        if (e.durum === 423) return;
        const hatalar = e.govde && e.govde.hatalar ? e.govde.hatalar : [];
        yerlestir(altCubuk, h('div', { class: 'not-kutusu hata', role: 'alert' }, h('b', {}, e.message),
          hatalar.length ? h('ul', {}, hatalar.slice(0, 20).map((x) => h('li', {}, x.yer ? `${x.yer}: ` : '', x.mesaj))) : null), altCubukIcerigi());
      }
    });
    const iptal = h('button', { type: 'button', class: 'hayalet' }, 'Analizi iptal et');
    iptal.addEventListener('click', async () => {
      const tamam = await onayIste({ baslik: 'Analiz iptal edilsin mi?', metin: 'Bulgular ve taslak kararlar silinir; model değişmez, reddedilenler hatırlanmaz.', dugme: 'İptal et', tehlikeli: true });
      if (!tamam) return;
      try {
        await api('/platform/ekran/analiz/iptal', { govde: { projeId: s.proje.id, ekranId: s.ekranId, analizId: a.id } });
        taslakSil(a.id);
        bildir('Analiz iptal edildi.');
        location.hash = `#/ekranlar/e/${encodeURIComponent(s.ekranId)}`;
      } catch (e) { if (e.durum !== 423) bildir(e.message, 'hata'); }
    });
    function altCubukIcerigi() {
      return h('div', { class: 'dugmeler' },
        h('p', { class: 'secim-sayaci' }, h('b', {}, String(kabul)), ' kabul · ', h('b', {}, String(red)), ' red · ', h('b', {}, String(bekleyen)), ' karar bekliyor'),
        h('span', { class: 'bosluk' }), iptal, uygula);
    }
    yerlestir(altCubuk, h('div', { class: 'sabit-alt bulgu-alt-cubugu' }, altCubukIcerigi()));
  }

  const gizli = a.gizlenenSayisi ? h('details', { class: 'fark gizli-bulgular' },
    h('summary', {}, `Daha önce reddedilen ${a.gizlenenSayisi} bulgu gizlendi`),
    h('ul', { class: 'duz-liste kucuk' }, (a.gizlenenler || []).map((g) => h('li', {}, `${BULGU_TURLERI[g.tur]?.etiket || g.tur}: ${g.baslik}`))),
    h('button', {
      type: 'button', class: 'kucuk-dugme', onclick: async (o) => {
        const tamam = await onayIste({ baslik: 'Reddedilenler unutulsun mu?', metin: `Bu ekran için hatırlanan ${v.reddedilenSayisi} reddedilmiş değişiklik unutulur; bir sonraki pakette yeniden bulgu olarak gelirler.`, dugme: 'Unut' });
        if (!tamam) return;
        try {
          await mesgulIken(o.currentTarget, 'Unutuluyor…', () => api('/platform/ekran/reddedilenleri-unut', { govde: { projeId: s.proje.id, ekranId: s.ekranId } }));
          bildir('Reddedilenler unutuldu; paketi yeniden yükleyince tekrar değerlendirebilirsiniz.');
        } catch (e) { if (e.durum !== 423) bildir(e.message, 'hata'); }
      }
    }, ikon('yenile'), 'Hatırlananları unut')) : null;
  const ekBilgi = (a.bilinmeyenler.length || a.gerekenAyarlar.some((g) => g.durum !== 'tamam' && g.durum !== 'bilgi')) ? h('section', { class: 'kart bilinmeyen-karti' },
    h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('uyari'), 'Paketten notlar')),
    a.bilinmeyenler.length ? h('ul', { class: 'bilinmeyen-listesi' }, a.bilinmeyenler.map((b) => h('li', {}, b))) : null,
    a.gerekenAyarlar.filter((g) => g.durum !== 'tamam' && g.durum !== 'bilgi').map((g) => h('p', { class: 'kucuk' }, h('b', {}, `${g.etiket}: ${g.deger}`), ` — ${g.aciklama} `, g.baglanti ? h('a', { href: g.baglanti }, 'Ayarlar') : null))) : null;

  yerlestir(icerik, baslik, metrikAlani, filtreAlani,
    h('div', { class: 'bulgu-izgarasi' },
      h('div', { class: 'bulgu-sutunu' }, listeAlani, gizli, ekBilgi),
      h('aside', { class: 'etki-sutunu' }, etkiAlani)),
    altCubuk);
  ciz();
}

function yorumlaDugmesi(s) {
  const d = h('button', { type: 'button', class: 'hayalet' }, ikon('simsek'), 'Yapay zekâ ile yorumla');
  d.addEventListener('click', () => claudeDosyasiOlustur({ proje: s.proje, ekranId: s.ekranId, tur: 'yorumla' }, d));
  return d;
}
