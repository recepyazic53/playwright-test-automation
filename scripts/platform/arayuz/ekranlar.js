// "Ekranlar" bölümü (genel; ekran = projenin test edilen bir sayfası/ürünü).
//   Liste: ekran kartları (model sürümü, adım/alan/senaryo sayıları, bekleyen analiz) + "Sayfa ekle".
//   Ayrıntı: güncel model (adım › bölüm › alan; seçenekler, görünürlük, bağlam profiline göre görünürlük),
//   Model geçmişi (sürümler ve sürümler arası fark), Kanıtlar (şifreli ekran görüntüleri), eylemler:
//   "Paket yükle", "Tekrar analiz et" (bağlam profili seçimi), "Claude ile yorumla".
// Adresler: #/ekranlar · #/ekranlar/yeni · #/ekranlar/e/<id>[/gecmis[/<sürüm>] | /kanitlar | /yukle | /bulgular]
// Ekran keşfinin ana yolu: kullanıcı sayfa bağlantısını Claude Code'a verir, Claude sayfayı yalnızca okuyarak
// inceleyip bir "sayfa paketi" (docs/sayfa-paketi.md) üretir; paket burada yüklenir. Claude API kullanılmaz.
import { TOKEN, api, bosDurum, h, ikon, iskelet, rozet, tarihMetni, yerlestir } from './ortak.js';
import {
  BULGU_TURLERI, bulguRozeti, claudeDosyasiOlustur, farkGosterimi, goreliZaman, gorselDiyalogu, kopyalaDugmesi, modelAgaciCiz, tekrarAnalizDiyalogu
} from './ekran-ortak.js';
import { sayfaPaketiAkisi } from './sayfa-paketi.js';
import { bulgularEkrani } from './bulgular.js';

const medyaUrl = (id) => `/platform/medya/${encodeURIComponent(id)}?token=${encodeURIComponent(TOKEN)}`;
const hataKutusu = (hata) => h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message || String(hata));
export const CLAUDE_ISTEK_CUMLESI = (adres) =>
  `${adres || '<sayfa bağlantısı>'} sayfasını yalnızca okuyarak (form göndermeden) incele ve docs/sayfa-paketi.md biçiminde bir sayfa paketi JSON dosyası üret.`;

/**
 * @param {HTMLElement} main
 * @param {string[]} parcalar hash parçaları (#/ekranlar/... sonrası)
 * @param {{ durum: { proje: { id: string; ad: string } } }} baglam
 */
export function ekranlarEkrani(main, parcalar, baglam) {
  const proje = baglam.durum.proje;
  const [tur, kimlik, alt, altKimlik] = parcalar.map((p) => decodeURIComponent(p || ''));
  const icerik = h('section', { class: 'icerik-alani sonuc-icerik' }, iskelet('sayfa'));
  const nav = h('nav', { class: 'alt-nav', 'aria-label': 'Ekranlar' }, iskelet('liste'));
  yerlestir(main, h('h1', { class: 'gorunmez' }, 'Ekranlar'),
    h('div', { class: 'kabuk-duzen' },
      h('aside', { class: 'yan-panel' }, nav,
        h('div', { class: 'yan-not' }, h('b', {}, 'Sayfa paketi'), h('br', {}),
          'Yeni sayfaları Claude Code inceler (yalnızca okuma) ve bir paket üretir; paketi "Sayfa ekle" ile yükleyin. Aynı ekran için yeni paket = tekrar analiz.')),
      icerik));
  const hata = (e) => { if (e && e.durum === 423) return; yerlestir(icerik, hataKutusu(e)); };

  (async () => {
    const liste = await api(`/platform/ekranlar?projeId=${encodeURIComponent(proje.id)}`);
    yanListe(nav, liste.ekranlar, tur === 'e' ? kimlik : tur === 'yeni' ? '__yeni' : '');
    if (tur === 'yeni') {
      sayfaPaketiAkisi(icerik, { mod: 'yeni', proje, bitti: (id) => { location.hash = `#/ekranlar/e/${encodeURIComponent(id)}`; } });
      return;
    }
    if (tur === 'e' && kimlik) {
      const ekran = liste.ekranlar.find((e) => e.id === kimlik);
      if (!ekran) { yerlestir(icerik, bosDurum('Ekran bulunamadı.', 'Silinmiş ya da başka bir projeye ait olabilir.', { ikon: 'ekran' })); return; }
      if (alt === 'yukle') {
        sayfaPaketiAkisi(icerik, {
          mod: ekran.modelSurumu ? 'analiz' : 'yeni', proje, ekran,
          bitti: (id, analiz) => { location.hash = analiz ? `#/ekranlar/e/${encodeURIComponent(id)}/bulgular` : `#/ekranlar/e/${encodeURIComponent(id)}`; }
        });
        return;
      }
      if (alt === 'bulgular') { bulgularEkrani(icerik, { proje, ekranId: kimlik }); return; }
      await ekranAyrintisi(icerik, { proje, ekranId: kimlik, sekme: alt || 'model', surum: altKimlik ? Number(altKimlik) : null });
      return;
    }
    listeGorunumu(icerik, proje, liste);
  })().catch(hata);
}

function yanListe(nav, ekranlar, secili) {
  const ekranModelli = ekranlar.filter((e) => e.modelTuru !== 'altModel');
  const altModeller = ekranlar.filter((e) => e.modelTuru === 'altModel');
  const baglanti = (e) => h('a', { href: `#/ekranlar/e/${encodeURIComponent(e.id)}`, 'aria-current': secili === e.id ? 'page' : null },
    e.modelSurumu ? ikon(e.modelTuru === 'altModel' ? 'arsiv' : 'katman') : h('span', { class: 'saglik', 'aria-hidden': 'true' }),
    h('span', { class: 'nav-metni' }, e.ad),
    e.bekleyenAnaliz ? h('span', { class: 'adet bekleyen', title: `${e.bekleyenAnaliz.bulguSayisi} bulgu karar bekliyor` }, String(e.bekleyenAnaliz.bulguSayisi))
      : e.modelSurumu ? h('span', { class: 'adet', title: `model sürümü ${e.modelSurumu}` }, `v${e.modelSurumu}`) : null);
  yerlestir(nav,
    h('a', { href: '#/ekranlar', 'aria-current': secili === '' ? 'page' : null }, ikon('izgara'), 'Tüm ekranlar', h('span', { class: 'adet' }, String(ekranModelli.length))),
    h('a', { href: '#/ekranlar/yeni', 'aria-current': secili === '__yeni' ? 'page' : null }, ikon('artiYalin'), 'Sayfa ekle'),
    h('div', { class: 'alt-nav-baslik', 'aria-hidden': 'true' }, 'Ürünler / ekranlar'),
    ...ekranModelli.map(baglanti),
    altModeller.length ? h('div', { class: 'alt-nav-baslik', 'aria-hidden': 'true' }, 'Alt modeller') : null,
    ...altModeller.map(baglanti));
}

// ---------------------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------------------

function listeGorunumu(icerik, proje, liste) {
  const ekranlar = liste.ekranlar.filter((e) => e.modelTuru !== 'altModel');
  const modelli = ekranlar.filter((e) => e.modelSurumu).length;
  const bekleyen = ekranlar.filter((e) => e.bekleyenAnaliz);
  const cumle = CLAUDE_ISTEK_CUMLESI('');
  yerlestir(icerik,
    h('div', { class: 'sayfa-basligi' },
      h('div', {},
        h('div', { class: 'kirinti' }, h('span', {}, proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, 'Ekranlar')),
        h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, 'Ekranlar'), rozet(`${ekranlar.length} ekran`, 'vurgu')),
        h('div', { class: 'meta' },
          h('span', {}, ikon('katman'), `${modelli} ekranın modeli var`),
          h('span', {}, ikon('uyari'), bekleyen.length ? `${bekleyen.length} ekranda karar bekleyen bulgu` : 'bekleyen bulgu yok'),
          h('span', {}, ikon('liste'), `${ekranlar.reduce((t, e) => t + e.senaryoSayisi, 0)} senaryo`))),
      h('div', { class: 'eylemler' }, h('a', { class: 'dugme birincil', href: '#/ekranlar/yeni' }, ikon('artiYalin'), 'Sayfa ekle'))),
    h('section', { class: 'kesif-seridi', 'aria-label': 'Yeni sayfa nasıl eklenir' },
      h('ol', { class: 'kesif-adimlari' },
        h('li', {}, h('b', {}, 'Bağlantıyı Claude Code\'a verin'), h('span', {}, 'Sayfa yalnızca okunarak incelenir; form gönderilmez.')),
        h('li', {}, h('b', {}, 'Sayfa paketi üretilir'), h('span', {}, 'Model, senaryo önerileri, gereken ayarlar, bilinmeyenler — gizli değer yok.')),
        h('li', {}, h('b', {}, 'Paketi yükleyin'), h('span', {}, 'Önizleyin, seçin, kabul edin. Aynı ekran için yeni paket = tekrar analiz.'))),
      h('div', { class: 'kesif-cumlesi' }, h('code', {}, cumle), kopyalaDugmesi(cumle, 'Cümleyi kopyala'))),
    ekranlar.length
      ? h('div', { class: 'ekran-izgarasi' }, ekranlar.slice().sort((x, y) => Number(Boolean(y.bekleyenAnaliz)) - Number(Boolean(x.bekleyenAnaliz)) || Number(Boolean(y.modelSurumu)) - Number(Boolean(x.modelSurumu))).map((e) => ekranKarti(e)))
      : bosDurum('Henüz ekran yok.', 'İlk sayfanızı "Sayfa ekle" ile ekleyin.', { ikon: 'ekran', eylem: h('a', { class: 'dugme birincil', href: '#/ekranlar/yeni' }, ikon('artiYalin'), 'Sayfa ekle') }));
}

function ekranKarti(e) {
  const adres = `#/ekranlar/e/${encodeURIComponent(e.id)}`;
  const sayi = (deger, etiket) => h('div', { class: 'ekran-sayisi' }, h('b', {}, String(deger)), h('span', {}, etiket));
  return h('article', { class: `ekran-karti ${e.modelSurumu ? '' : 'modelsiz'} ${e.bekleyenAnaliz ? 'bekleyen' : ''}`.trim() },
    h('div', { class: 'ekran-karti-ust' },
      h('span', { class: 'kayit-ikon', 'aria-hidden': 'true' }, ikon(e.modelSurumu ? 'katman' : 'ekran')),
      h('div', { class: 'ekran-karti-ad' }, h('h3', {}, h('a', { href: adres }, e.ad)), h('code', {}, e.anahtar)),
      e.modelSurumu ? rozet(`model v${e.modelSurumu}`, 'vurgu') : rozet('model yok', '')),
    e.modelSurumu
      ? h('div', { class: 'ekran-sayilari' }, sayi(e.adimSayisi, 'adım'), sayi(e.alanSayisi, 'alan'), sayi(e.senaryoSayisi, 'senaryo'))
      : h('p', { class: 'kucuk soluk' }, `${e.senaryoSayisi} senaryo · modeli yok — sayfa paketi yükleyerek model oluşturun.`),
    e.bekleyenAnaliz
      ? h('a', { class: 'bekleyen-bant', href: `${adres}/bulgular` }, ikon('uyari'), h('span', {}, h('b', {}, String(e.bekleyenAnaliz.bulguSayisi)), ' bulgu karar bekliyor'), ikon('ok'))
      : null,
    h('div', { class: 'ekran-karti-alt' },
      e.urlYolu ? h('span', { class: 'mono cok-soluk' }, e.urlYolu) : null,
      e.modelTarihi ? h('span', { class: 'cok-soluk zaman', title: tarihMetni(e.modelTarihi) }, goreliZaman(e.modelTarihi)) : null,
      h('a', { class: 'dugme kucuk-dugme', href: `${adres}/yukle` }, ikon('yukle'), e.modelSurumu ? 'Paket yükle' : 'Model ekle')));
}

// ---------------------------------------------------------------------------------------
// Ayrıntı
// ---------------------------------------------------------------------------------------

async function ekranAyrintisi(icerik, s) {
  const d = await api(`/platform/ekran?projeId=${encodeURIComponent(s.proje.id)}&id=${encodeURIComponent(s.ekranId)}`);
  const e = d.ekran;
  const adres = `#/ekranlar/e/${encodeURIComponent(e.id)}`;
  const paketYukle = () => { location.hash = `${adres}/yukle`; };
  const yorumla = h('button', { type: 'button', class: 'hayalet', title: 'Model, bulgular ve senaryo özetlerini Claude Code için dosyaya yazar' }, ikon('simsek'), 'Claude ile yorumla');
  yorumla.addEventListener('click', () => claudeDosyasiOlustur({ proje: s.proje, ekranId: e.id, tur: 'yorumla' }, yorumla));
  const tekrar = h('button', { type: 'button' }, ikon('yenile'), 'Tekrar analiz et');
  tekrar.addEventListener('click', () => tekrarAnalizDiyalogu({ proje: s.proje, ekran: e, baglamProfilleri: d.baglamProfilleri, sonSecim: d.analiz.sonBaglamProfilleri, paketYukle }));
  const agac = d.agac || (d.altModel ? d.altModel.agac : null);
  const sekmeler = [
    ['model', 'Model', null], ['gecmis', 'Model geçmişi', d.gecmis.length], ['kanitlar', 'Kanıtlar', d.analiz.kanitlar.length]
  ];
  const sekmeAlani = h('div', {});
  yerlestir(icerik,
    h('div', { class: 'sayfa-basligi' },
      h('div', {},
        h('div', { class: 'kirinti' }, h('span', {}, s.proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: '#/ekranlar' }, 'Ekranlar'),
          h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, e.ad)),
        h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, e.ad),
          d.surum ? rozet(`model v${d.surum}`, 'vurgu') : rozet('model yok'), d.modelTuru === 'altModel' ? rozet('alt model', 'durdu') : null),
        h('div', { class: 'meta' },
          h('span', {}, ikon('isaret'), h('code', { class: 'duz' }, e.anahtar)),
          agac && agac.ekranUrl ? h('span', {}, ikon('ag'), h('code', { class: 'duz' }, agac.ekranUrl)) : null,
          h('span', {}, ikon('liste'), h('a', { href: `#/senaryolar/u/${encodeURIComponent(e.id)}` }, `${d.senaryoSayisi} senaryo`)),
          d.gecmis[0] ? h('span', { title: tarihMetni(d.gecmis[0].olusturulma) }, ikon('saat'), `son sürüm ${goreliZaman(d.gecmis[0].olusturulma)}`) : null)),
      h('div', { class: 'eylemler' }, d.surum && d.modelTuru !== 'altModel' ? yorumla : null, d.surum && d.modelTuru !== 'altModel' ? tekrar : null,
        d.modelTuru !== 'altModel' ? h('a', { class: 'dugme birincil', href: `${adres}/yukle` }, ikon('yukle'), d.surum ? 'Paket yükle' : 'Model ekle') : null)),
    d.analiz.bekleyen ? h('a', { class: 'bekleyen-bant genis', href: `${adres}/bulgular` }, ikon('uyari'),
      h('span', {}, h('b', {}, `${d.analiz.bekleyen.bulguSayisi} bulgu`), ` karar bekliyor · paket ${goreliZaman(d.analiz.bekleyen.zaman)} yüklendi`),
      h('span', { class: 'sag' }, 'Bulgulara git', ikon('ok'))) : null,
    !d.analiz.bekleyen && d.analiz.son ? h('div', { class: 'bilgi-seridi' }, ikon('onay'),
      h('span', {}, `Son analiz ${goreliZaman(d.analiz.son.zaman)} uygulandı${d.analiz.son.sonucSurum ? ` → model v${d.analiz.son.sonucSurum}` : ' (model değişmedi)'}.`),
      h('a', { href: `${adres}/bulgular` }, 'Bulgular ve etki paneli')) : null,
    h('div', { class: 'segment sekme-cubugu', role: 'tablist', 'aria-label': 'Ekran bölümleri' },
      sekmeler.map(([ad, etiket, sayi]) => h('button', {
        type: 'button', role: 'tab', 'aria-selected': s.sekme === ad ? 'true' : 'false',
        onclick: () => { location.hash = ad === 'model' ? adres : `${adres}/${ad}`; }
      }, etiket, sayi !== null ? h('span', { class: 'sekme-sayisi' }, String(sayi)) : null))),
    sekmeAlani);

  if (s.sekme === 'gecmis') { await gecmisSekmesi(sekmeAlani, s, d); return; }
  if (s.sekme === 'kanitlar') { kanitSekmesi(sekmeAlani, d); return; }
  if (!agac) {
    yerlestir(sekmeAlani, bosDurum('Bu ekranın modeli yok.', 'Claude Code ile üretilen bir sayfa paketini yükleyerek model oluşturun. Mevcut senaryolar korunur.', {
      ikon: 'katman', eylem: h('a', { class: 'dugme birincil', href: `${adres}/yukle` }, ikon('yukle'), 'Sayfa paketi yükle')
    }));
    return;
  }
  yerlestir(sekmeAlani, h('div', { class: 'form-duzeni' },
    h('div', { class: 'form-sutunu' }, modelAgaciCiz(agac)),
    h('aside', { class: 'ozet-sutunu', 'aria-label': 'Model özeti' }, modelOzetKarti(agac, d))));
}

function modelOzetKarti(agac, d) {
  const sayilar = agac.sayilar;
  const satir = (etiket, deger) => [h('dt', {}, etiket), h('dd', {}, String(deger))];
  return [
    h('section', { class: 'kart' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('katman'), 'Model özeti'), h('span', { class: 'sag' }, d.surum ? rozet(`v${d.surum}`, 'vurgu') : null)),
      h('div', { class: 'mini-sayilar' },
        [['Adım', sayilar.adim], ['Alan', sayilar.alan], ['Senaryoda', sayilar.senaryoAlani]].map(([e, v]) => h('div', {}, h('b', {}, String(v)), h('span', {}, e)))),
      h('dl', { class: 'ozet-satirlari' }, satir('Zorunlu alan', sayilar.zorunlu), satir('Koşullu alan', sayilar.kosullu), satir('Bölüm', sayilar.bolum))),
    agac.adimKapsami.length ? h('section', { class: 'kart' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('pusula'), 'İsteğe bağlı adımlar')),
      h('ul', { class: 'duz-liste kucuk' }, agac.adimKapsami.map((k) => h('li', {}, h('b', {}, k.etiket), ` → ${k.adimlar.join(', ')}`)))) : null,
    agac.profiller.length ? h('section', { class: 'kart' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('hedef'), 'İncelenen bağlam profilleri')),
      h('div', { class: 'etiketler' }, agac.profiller.map((p) => rozet(p, ''))),
      h('p', { class: 'kucuk cok-soluk ust-bosluk' }, 'Alanlardaki ✓ / – / ? çipleri gözlemdir: koşuda alan görünüyorsa doldurulur, görünmüyorsa atlanır ("mutlaka görünmeli" işaretli değilse).')) : null,
    agac.bilinmeyenler.length ? h('section', { class: 'kart bilinmeyen-karti' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('uyari'), 'Bilinmeyenler'), h('span', { class: 'sag' }, rozet(String(agac.bilinmeyenler.length), 'uyari'))),
      h('ul', { class: 'bilinmeyen-listesi' }, agac.bilinmeyenler.map((b) => h('li', {}, b)))) : null
  ];
}

async function gecmisSekmesi(alan, s, d) {
  if (!d.gecmis.length) { yerlestir(alan, bosDurum('Model sürümü yok.', null, { ikon: 'tarih' })); return; }
  const secili = s.surum && d.gecmis.some((g) => g.surum === s.surum) ? s.surum : d.gecmis[0].surum;
  const farkAlani = h('div', {}, iskelet('liste'));
  const adres = `#/ekranlar/e/${encodeURIComponent(d.ekran.id)}/gecmis`;
  yerlestir(alan, h('div', { class: 'gecmis-duzeni' },
    h('section', { class: 'kart surum-listesi-karti' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('tarih'), 'Sürümler'), h('span', { class: 'sag cok-soluk kucuk' }, 'yeniden eskiye')),
      h('ol', { class: 'surum-listesi' }, d.gecmis.map((g) => h('li', { class: g.surum === secili ? 'secili' : null },
        h('a', { href: `${adres}/${g.surum}`, 'aria-current': g.surum === secili ? 'true' : null },
          h('span', { class: 'surum-no' }, `v${g.surum}`),
          h('span', { class: 'surum-bilgisi' },
            h('b', {}, g.aciklama || (g.surum === 1 ? 'İlk sürüm' : 'Güncelleme')),
            h('small', {}, tarihMetni(g.olusturulma))),
          g.degisiklikSayisi !== null ? rozet(`${g.degisiklikSayisi} değişiklik`, g.degisiklikSayisi ? 'vurgu' : '') : rozet('ilk', 'basari')))))),
    farkAlani));
  try {
    const f = await api(`/platform/ekran/surum?projeId=${encodeURIComponent(s.proje.id)}&id=${encodeURIComponent(d.ekran.id)}&surum=${secili}`);
    yerlestir(farkAlani, h('section', { class: 'kart surum-farki-karti' },
      h('div', { class: 'kart-basligi' },
        h('h3', {}, ikon('katman'), f.oncekiSurum ? `v${f.oncekiSurum} → v${f.surum}` : `v${f.surum} (ilk sürüm)`),
        h('span', { class: 'sag' }, Object.entries(f.ozet.turler).map(([t, n]) => h('span', { class: 'tur-sayaci', title: BULGU_TURLERI[t]?.etiket || t }, bulguRozeti(t), h('b', {}, String(n)))))),
      f.aciklama ? h('p', { class: 'kucuk soluk' }, f.aciklama) : null,
      f.bulgular.length
        ? h('ul', { class: 'bulgu-listesi salt-okunur' }, f.bulgular.map((b) => h('li', { class: 'bulgu-satiri' },
          h('div', { class: 'bulgu-tur' }, bulguRozeti(b.tur)),
          h('div', { class: 'bulgu-ana' }, h('strong', {}, b.baslik), h('small', {}, b.konum), farkGosterimi(b)))))
        : h('p', { class: 'soluk' }, f.oncekiSurum ? 'Bu sürümde alan/adım değişikliği yok.' : 'İlk sürüm: sayfa paketinden oluşturuldu.'),
      f.agac ? h('details', { class: 'fark ust-bosluk' }, h('summary', {}, `v${f.surum} modelini göster`), modelAgaciCiz(f.agac, { kompakt: true, vurgulu: new Set(f.bulgular.map((b) => b.alanId).filter(Boolean)) })) : null));
  } catch (e) {
    if (e.durum !== 423) yerlestir(farkAlani, hataKutusu(e));
  }
}

function kanitSekmesi(alan, d) {
  const k = d.analiz.kanitlar;
  if (!k.length) { yerlestir(alan, bosDurum('Kanıt yok.', 'Sayfa paketlerindeki ekran görüntüleri burada şifreli saklanır.', { ikon: 'ekran' })); return; }
  yerlestir(alan, h('section', { class: 'kart' },
    h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('ekran'), 'Paket ekran görüntüleri'), h('span', { class: 'sag cok-soluk kucuk' }, 'medya deposunda şifreli')),
    h('ul', { class: 'gorsel-izgarasi genis-gorseller' }, k.slice().reverse().map((m) => h('li', {},
      h('button', { type: 'button', class: 'gorsel-dugmesi', onclick: () => gorselDiyalogu(medyaUrl(m.medyaId), m.ad), 'aria-label': `${m.ad} — büyüt` },
        h('img', { src: medyaUrl(m.medyaId), alt: '', loading: 'lazy' })),
      h('div', { class: 'gorsel-adi' }, h('span', {}, m.ad)),
      h('small', { class: 'cok-soluk kucuk' }, [m.kaynak, tarihMetni(m.zaman)].filter(Boolean).join(' · ')))))));
}

