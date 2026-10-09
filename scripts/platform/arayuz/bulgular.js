// "Değişiklikler" ekranı (bulgular; Modeli güncelle › Nöbetçi taraması / paket ile tekrar analiz): güncel modelle farklar.
//   Tek satır özet · türe göre gruplu satırlar (tek cümle + konum, "Tabloya da ekle", "N senaryo etkilenir") · Kabul et / Reddet ·
//   Hepsini kabul / reddet · "Uygula" (YALNIZCA kabul edilenlerle yeni model sürümü; reddedilenler hatırlanır, tekrar gösterilmez).
//   Satırın "Ayrıntı"sı: eski → yeni, görünürlük, etkilenen senaryolar; zorunlu yeni alanda eksik değer → toplu değer atama
//   (bulgu kabul edilip uygulandıktan sonra) ya da tek tek düzenleme; "Eksik kombinasyonlara senaryo öner"
//   (yapay zekâ ile yorumlama ekranın ⋯ menüsünde).
// Karar taslağı sekme oturumunda (sessionStorage) tutulur; kalıcı olan yalnızca "Uygula"dır.
import { api, bildir, bosDurum, h, ikon, iskelet, mesgulIken, rozet, tarihMetni, yerlestir } from './ortak.js';
import {
  BULGU_TURLERI, baglamMatrisi, claudeDosyasiOlustur, farkGosterimi, goreliZaman, onayIste
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
        h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: ekranAdresi }, v.ekran.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, 'Değişiklikler')),
      h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, 'Değişiklikler'),
        v.analiz ? (v.analiz.durum === 'uygulandi'
          ? rozet(v.analiz.sonucSurum ? `uygulandı → v${v.analiz.sonucSurum}` : 'uygulandı (model değişmedi)', 'basari')
          : rozet('karar bekliyor', 'uyari')) : null),
      v.analiz ? h('div', { class: 'meta' },
        h('span', {}, ikon('dosya'), `paket: ${v.analiz.meta.olusturan} · ${tarihMetni(v.analiz.meta.olusturulma)}`),
        h('span', {}, ikon('katman'), `taban: model v${v.analiz.tabanSurum}`),
        v.analiz.meta.baglamProfilleri && v.analiz.meta.baglamProfilleri.length ? h('span', {}, ikon('hedef'), `bağlam: ${v.analiz.meta.baglamProfilleri.join(', ')}`) : null,
        h('span', { title: tarihMetni(v.analiz.zaman) }, ikon('saat'), `yüklendi ${goreliZaman(v.analiz.zaman)}`)) : null),
    h('div', { class: 'eylemler' },
      h('a', { class: 'dugme hayalet', href: ekranAdresi }, ikon('geri'), 'Ekrana dön')));
  if (!v.analiz) {
    yerlestir(icerik, baslik, bosDurum('Bu ekran için analiz yok.', 'Ekranın yeni bir ekran paketini yükleyin: paket güncel modelle karşılaştırılır ve farklar burada bulgu olarak listelenir.', {
      ikon: 'yenile', eylem: h('a', { class: 'dugme birincil', href: `${ekranAdresi}/yukle` }, ikon('yukle'), 'Paket yükle')
    }));
    return;
  }
  const a = v.analiz;
  const uygulandi = a.durum === 'uygulandi';
  const kararlar = new Map();
  /** Tabloya yansıtılmayacak seçenek bulguları (varsayılan: hepsi yansıtılır). */
  const tabloDisi = new Set();
  if (uygulandi) { for (const b of a.bulgular) if (b.karar) kararlar.set(b.id, b.karar); }
  else for (const [id, k] of Object.entries(taslakOku(a.id))) if (a.bulgular.some((b) => b.id === id) && (k === 'kabul' || k === 'red')) kararlar.set(id, k);
  const etki = new Map(a.etki.map((x) => [x.bulguId, x]));
  // Toplu atama / uygulama sonrası yeniden çizimde ayrıntısı açık kalacak satır.
  const secili = secimKorunsun && a.bulgular.some((b) => b.id === secimKorunsun) ? secimKorunsun : null;

  const ozetAlani = h('div', {});
  const listeAlani = h('div', {});
  const altCubuk = h('div', {});
  /** Ayrıntısı açık satırlar (yeniden çizimde açık kalsın). */
  const acik = new Set();

  const ciz = () => {
    const kabul = a.bulgular.filter((b) => kararlar.get(b.id) === 'kabul').length;
    const red = a.bulgular.filter((b) => kararlar.get(b.id) === 'red').length;
    const bekleyen = a.bulgular.length - kabul - red;
    // Tek satır özet: "5 değişiklik: 2 yeni alan, 1 kaldırılan alan, …"
    const turler = Object.entries(a.ozet.turler).map(([t, n]) => `${n} ${(BULGU_TURLERI[t]?.etiket || t).toLocaleLowerCase('tr')}`);
    yerlestir(ozetAlani, h('div', { class: 'bulgu-ozet-satiri' },
      h('p', {}, h('b', {}, `${a.bulgular.length} değişiklik`), turler.length ? `: ${turler.join(', ')}` : ''),
      uygulandi ? null : h('span', { class: 'sag' },
        h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => toplu('kabul') }, ikon('onay'), 'Hepsini kabul et'),
        h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => toplu('red') }, ikon('carpi'), 'Hepsini reddet'))));
    listeCiz();
    altCubukCiz(kabul, red, bekleyen);
  };

  function toplu(karar) {
    for (const b of a.bulgular) kararlar.set(b.id, karar);
    taslakYaz(a.id, kararlar);
    ciz();
  }

  /** Türe göre gruplu satırlar: tek cümle + konum, "Tabloya da ekle", "N senaryo etkilenir", Kabul et / Reddet, istenirse Ayrıntı. */
  function listeCiz() {
    const gruplar = new Map();
    for (const b of a.bulgular) { if (!gruplar.has(b.tur)) gruplar.set(b.tur, []); gruplar.get(b.tur).push(b); }
    const sira = Object.keys(BULGU_TURLERI);
    const turlar = [...gruplar.keys()].sort((x, y) => (sira.indexOf(x) + 1 || 99) - (sira.indexOf(y) + 1 || 99));
    yerlestir(listeAlani, turlar.map((tur) => h('section', { class: 'bulgu-grubu' },
      h('h3', {}, BULGU_TURLERI[tur]?.etiket || tur, ' ', rozet(String(gruplar.get(tur).length))),
      h('ul', { class: 'bulgu-listesi kart', 'aria-label': BULGU_TURLERI[tur]?.etiket || tur }, gruplar.get(tur).map(satir)))));
  }

  /** @param {any} b */
  function satir(b) {
    const k = kararlar.get(b.id) || null;
    const e = etki.get(b.id);
    const etkiSayisi = e ? e.senaryolar.length : 0;
    const kararDugmesi = (tur, etiket, ikonAd) => h('button', {
      type: 'button', class: `kucuk-dugme karar-dugmesi ${tur}`, 'aria-pressed': k === tur ? 'true' : 'false',
      onclick: () => { if (k === tur) kararlar.delete(b.id); else kararlar.set(b.id, tur); taslakYaz(a.id, kararlar); ciz(); }
    }, ikon(ikonAd), etiket);
    const ayrinti = h('details', { class: 'bulgu-ayrintisi', open: acik.has(b.id) || null },
      h('summary', {}, 'Ayrıntı'));
    ayrinti.addEventListener('toggle', () => {
      if (ayrinti.open) { acik.add(b.id); if (ayrinti.childElementCount === 1) ayrinti.append(etkiIcerigi(b)); } else acik.delete(b.id);
    });
    if (acik.has(b.id)) ayrinti.append(etkiIcerigi(b));
    return h('li', { class: `bulgu-satiri ${k ? `karar-${k}` : ''}`.trim(), 'data-bulgu': b.id, 'aria-label': `${b.baslik}${k ? ` (${k === 'kabul' ? 'kabul' : 'red'})` : ''}` },
      h('div', { class: 'bulgu-ana' },
        h('strong', {}, b.baslik),
        b.konum ? h('small', {}, b.konum) : null,
        tabloSecimi(b),
        etkiSayisi ? h('small', { class: `etki-notu ${e.tur === 'eksikDeger' || e.tur === 'kullanilanSecenek' ? 'uyari' : ''}`, title: e.mesaj }, ikon('liste'), `${etkiSayisi} senaryo etkilenir`) : null,
        ayrinti),
      h('div', { class: 'bulgu-sag' },
        uygulandi
          ? (k === 'kabul' ? rozet('kabul edildi', 'basari') : k === 'red' ? rozet('reddedildi', 'hata') : rozet('karar verilmedi'))
          : h('div', { class: 'karar-grubu', role: 'group', 'aria-label': `Karar: ${b.baslik}` }, kararDugmesi('kabul', 'Kabul et', 'onay'), kararDugmesi('red', 'Reddet', 'carpi'))));
  }

  /**
   * Yeni / kaldırılan seçenek bulgusu: bağlı test verisi tablosuna da yansıtılsın mı (kabul edilirse uygulanır). Uygulanamazsa neden yazılır.
   * @param {any} b
   */
  function tabloSecimi(b) {
    const o = b.tabloOnerisi;
    if (!o) return null;
    const eylem = o.islem === 'ekle' ? 'Tabloya da ekle' : 'Tablodan da çıkar';
    if (!o.uygulanabilir) return h('div', { class: 'bulgu-tablo soluk kucuk' }, ikon('veri'), ` ${o.tabloAd}: ${o.neden}`);
    if (uygulandi) return h('div', { class: 'bulgu-tablo soluk kucuk' }, ikon('veri'), ` ${eylem}: ${o.tabloAd}`);
    const kutu = h('input', { type: 'checkbox', checked: !tabloDisi.has(b.id) });
    kutu.addEventListener('click', (e) => e.stopPropagation());
    kutu.addEventListener('change', () => { if (kutu.checked) tabloDisi.delete(b.id); else tabloDisi.add(b.id); });
    return h('label', { class: 'secenek bulgu-tablo kucuk', onclick: (e) => e.stopPropagation() }, kutu, `${eylem}: `, h('b', {}, o.tabloAd),
      h('span', { class: 'soluk' }, ` (${o.sutun})`));
  }

  /** @param {any} b */
  function etkiIcerigi(b) {
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
    return h('div', { class: 'etki-paneli satir-ici', 'aria-label': `Ayrıntı: ${b.baslik}` },
      farkGosterimi(b),
      b.baglam ? h('div', { class: 'etki-baglam' }, h('div', { class: 'ara-baslik' }, 'Bağlam profiline göre görünürlük (gözlem)'), baglamMatrisi(b.baglam, a.profiller),
        h('p', { class: 'kucuk cok-soluk' }, 'Bilgi amaçlıdır: koşuda alan görünüyorsa doldurulur, görünmüyorsa atlanır; "mutlaka görünmeli" işaretli senaryo başarısız olur.')) : null,
      h('div', { class: 'ara-baslik' }, 'Etkilenen senaryolar', e && e.senaryolar.length ? rozet(String(e.senaryolar.length), e.tur === 'eksikDeger' || e.tur === 'kullanilanSecenek' ? 'uyari' : 'vurgu') : null,
        e && ETKI_METNI[e.tur] ? h('span', { class: 'cok-soluk kucuk' }, ETKI_METNI[e.tur]) : null),
      e && e.mesaj ? h('p', { class: `etki-mesaji ${e.senaryolar.length ? 'var' : ''}` }, e.mesaj) : h('p', { class: 'kucuk soluk' }, 'Bu bulgu senaryo verisini etkilemiyor.'),
      senaryoListesi,
      atama,
      h('div', { class: 'etki-alt' }, oner, h('span', { class: 'kucuk cok-soluk' }, 'Yapay zekâ aracınız için gizli değer içermeyen bir öneri isteği dosyası yazılır.')));
  }

  function altCubukCiz(kabul, red, bekleyen) {
    if (uygulandi) {
      yerlestir(altCubuk, h('div', { class: 'not-kutusu basari' },
        `Kararlar ${tarihMetni(a.uygulanma)} tarihinde uygulandı: ${kabul} kabul, ${red} red${a.sonucSurum ? ` → model v${a.sonucSurum}` : ' (yeni sürüm oluşmadı)'}. Reddedilen değişiklikler sonraki paketlerde gösterilmez.`));
      return;
    }
    const uygula = h('button', { type: 'button', class: 'birincil', disabled: !kabul && !red }, ikon('onay'), 'Uygula');
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
          govde: { projeId: s.proje.id, ekranId: s.ekranId, analizId: a.id, kabul: kabulListesi.map((b) => b.id), red: redListesi.map((b) => b.id),
            tablo: kabulListesi.filter((b) => b.tabloOnerisi && b.tabloOnerisi.uygulanabilir && !tabloDisi.has(b.id)).map((b) => b.id) }
        }));
        taslakSil(a.id);
        bildir(`${r.yeniSurum ? `Model v${r.surum} oluşturuldu (${r.kabul} kabul, ${r.red} red).` : `${r.red} bulgu reddedildi; model değişmedi.`}${r.baglanan ? ` ${r.baglanan} alan test verisi tablosuna bağlandı.` : ''}${r.tabloyaEklenen ? ` Tabloya ${r.tabloyaEklenen} seçenek eklendi.` : ''}${r.tablodanSilinen ? ` Tablodan ${r.tablodanSilinen} satır çıkarıldı.` : ''}`);
        await bulgularEkrani(icerik, s, secili);
      } catch (e) {
        if (e.durum === 423) return;
        const hatalar = e.govde && e.govde.hatalar ? e.govde.hatalar : [];
        yerlestir(altCubuk, h('div', { class: 'not-kutusu hata', role: 'alert' }, h('b', {}, e.message),
          hatalar.length ? h('ul', {}, hatalar.slice(0, 20).map((x) => h('li', {}, x.yer && x.yer !== 'model' ? `${x.yer}: ` : '', x.mesaj))) : null,
          // Model doğrulamasının teknik iletileri yalnız "Ayrıntı" altında.
          hatalar.some((x) => x.ayrinti) ? h('details', { class: 'hata-ayrintisi' }, h('summary', {}, 'Ayrıntı'),
            h('ul', {}, hatalar.slice(0, 20).filter((x) => x.ayrinti).map((x) => h('li', {}, h('code', {}, x.ayrinti))))) : null), altCubukIcerigi());
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

  if (secili) acik.add(secili);
  yerlestir(icerik, baslik, ozetAlani, listeAlani, gizli, ekBilgi, altCubuk);
  ciz();
}

