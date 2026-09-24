// "Senaryolar" ekranı (genel, veritabanı kaynaklı; senaryo kimliği = UUID).
//   Solda ürün/ekran listesi (Sonuçlar ile aynı düzen), sağda senaryo tablosu: Türkçe duyarsız arama,
//   filtreler (ekran, Koşuda, beklenen sonuç, son durum), seçim + toplu işlemler (Seçilenleri
//   çalıştır, Koşuya ekle/çıkar, Sil), satır eylemleri (▷ / Düzenle / ⋯: Kopyala, Geçmiş, Sil),
//   "Koşuyu başlat" (tam: Genel ya da ürün, filtresiz; aksi halde kısmi) ve canlı koşu paneli.
//   Oluşturma/düzenleme: model tabanlı form (senaryo-formu.js).
// Adresler: #/senaryolar, #/senaryolar/u/<ekranId>, #/senaryolar/yeni/<ekranId>, #/senaryolar/duzenle/<id>
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { api, yerlestir, bildir, bosDurum, h, ikon, iskelet, rozet } from './ortak.js';
import { aramaEslesiyorMu } from './model-formu.mjs';
import { dinle, durdur, kosuBaslat, kosuDurumu, kosuOnayi, kosuSuruyorMu, onayIste, riskliOrtamMi } from './kosu-paneli.js';
import { senaryoFormu } from './senaryo-formu.js';

const ORTAM_ANAHTARI = 'platform.senaryoOrtami';
const SAYFA_BOYU = 50;
const SON_DURUM = {
  basarili: { etiket: 'Başarılı', sinif: 'basari' },
  basarisiz: { etiket: 'Başarısız', sinif: 'hata' },
  atlanan: { etiket: 'Atlandı', sinif: 'atlanan' },
  durduruldu: { etiket: 'Durduruldu', sinif: 'durdu' }
};
const iki = (n) => String(n).padStart(2, '0');
const kisaTarih = (d) => { const t = new Date(d); return Number.isNaN(t.getTime()) ? '—' : `${iki(t.getDate())}.${iki(t.getMonth() + 1)} ${iki(t.getHours())}:${iki(t.getMinutes())}`; };
const hataKutusu = (hata) => h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message || String(hata));

/** Oturum boyunca korunan liste durumu (filtreler, sayfa). Seçim ekran değişince temizlenir. */
const liste = { arama: '', ekran: '', kosuda: '', beklenen: '', son: '', sayfa: 0, secim: new Set(), secimEkrani: null };

export function seciliOrtamOku() {
  try { return localStorage.getItem(ORTAM_ANAHTARI) || null; } catch { return null; }
}
function seciliOrtamYaz(id) {
  try { localStorage.setItem(ORTAM_ANAHTARI, id); } catch { /* yok sayılır */ }
}

/**
 * @param {HTMLElement} main
 * @param {string[]} parcalar hash parçaları (#/senaryolar/... sonrası)
 * @param {{ durum: { proje: { id: string; ad: string } } }} baglam
 */
export function senaryolarEkrani(main, parcalar, baglam) {
  const proje = baglam.durum.proje;
  const [tur, kimlik] = parcalar;
  const secili = tur === 'u' && kimlik ? decodeURIComponent(kimlik) : '';
  const icerik = h('section', { class: 'icerik-alani sonuc-icerik' }, iskelet('sayfa'));
  const nav = h('nav', { class: 'alt-nav', 'aria-label': 'Ürünler / ekranlar' }, iskelet('liste'));
  yerlestir(main, h('h1', { class: 'gorunmez' }, 'Senaryolar'),
    h('div', { class: 'kabuk-duzen' },
      h('aside', { class: 'yan-panel' }, nav,
        h('div', { class: 'yan-not' }, h('b', {}, 'Senaryo kimliği'), h('br', {}),
          'Senaryolar veritabanında tutulur; başlık değişse de koşu geçmişi ve sonuçlar aynı senaryoya bağlı kalır.')),
      icerik));
  const hata = (e) => { if (e && e.durum === 423) return; yerlestir(icerik, hataKutusu(e)); };

  (async () => {
    const { ortamlar } = await api(`/platform/ortamlar?projeId=${encodeURIComponent(proje.id)}`);
    if (!ortamlar.length) { yerlestir(icerik, bosDurum('Projede ortam yok.', 'Ayarlar > Ortamlar bölümünden bir ortam ekleyin.', { ikon: 'ag' })); return; }
    const kayitli = seciliOrtamOku();
    const ortam = ortamlar.find((o) => o.id === kayitli) || ortamlar.find((o) => o.varsayilan) || ortamlar[0];
    const veri = await api(`/platform/senaryolar?projeId=${encodeURIComponent(proje.id)}&ortamId=${encodeURIComponent(ortam.id)}`);
    ekranListesi(nav, veri, tur === 'u' || tur === undefined ? secili : null, tur === 'duzenle' ? veri.senaryolar.find((s) => s.id === decodeURIComponent(kimlik || ''))?.ekranId : tur === 'yeni' ? decodeURIComponent(kimlik || '') : null);
    if (tur === 'yeni' || tur === 'duzenle') {
      const senaryo = tur === 'duzenle' ? veri.senaryolar.find((s) => s.id === decodeURIComponent(kimlik || '')) : null;
      const ekranId = tur === 'yeni' ? decodeURIComponent(kimlik || '') : senaryo?.ekranId ?? null;
      senaryoFormu(icerik, {
        mod: tur, proje, ortam, ortamlar, ekranId, senaryoId: tur === 'duzenle' ? decodeURIComponent(kimlik || '') : null,
        ekranAdi: veri.ekranlar.find((e) => e.id === ekranId)?.ad ?? null,
        geri: () => { location.hash = ekranId ? `#/senaryolar/u/${encodeURIComponent(ekranId)}` : '#/senaryolar'; }
      });
      return;
    }
    listeGorunumu(icerik, { proje, ortamlar, ortam, veri, secili });
  })().catch(hata);
}

function ekranListesi(nav, veri, secili, formEkrani) {
  const toplam = veri.senaryolar.length;
  const baglanti = (id, ad, adet, ikonAd) => h('a', {
    href: id ? `#/senaryolar/u/${encodeURIComponent(id)}` : '#/senaryolar',
    'aria-current': (secili !== null && (secili || '') === (id || '')) || (formEkrani && formEkrani === id) ? 'page' : null
  }, ikonAd ? ikon(ikonAd) : h('span', { class: 'saglik', 'aria-hidden': 'true' }), ad, adet ? h('span', { class: 'adet' }, String(adet)) : null);
  const ekranlar = veri.ekranlar.filter((e) => e.senaryoSayisi || e.olusturulabilir);
  yerlestir(nav, 
    baglanti('', 'Genel', toplam, 'izgara'),
    h('div', { class: 'alt-nav-baslik', 'aria-hidden': 'true' }, 'Ürünler / ekranlar'),
    ...ekranlar.map((e) => baglanti(e.id, e.ad, e.senaryoSayisi, e.modelVar ? 'katman' : null)));
}

// ---------------------------------------------------------------------------------------
// Liste görünümü
// ---------------------------------------------------------------------------------------

function listeGorunumu(icerik, s) {
  const { proje, ortamlar } = s;
  let ortam = s.ortam;
  let veri = s.veri;
  const ekran = s.secili ? veri.ekranlar.find((e) => e.id === s.secili) || null : null;
  // Ekran değişince seçim ve arama sıfırlanır (filtre seçimleri korunur).
  if (liste.secimEkrani !== (s.secili || '')) { liste.secim = new Set(); liste.sayfa = 0; liste.arama = ''; liste.secimEkrani = s.secili || ''; }
  if (ekran) liste.ekran = '';

  const tabloAlani = h('div', {});
  const topluAlani = h('div', {});
  const ozetAlani = h('span', { class: 'liste-ozeti', 'aria-live': 'polite' });
  const baslikRozeti = h('span', {});
  const metaAlani = h('div', { class: 'meta' });

  // --- Filtreler ---
  const arama = h('input', { type: 'search', placeholder: 'Senaryo ara… (Türkçe karakter duyarsız)', value: liste.arama, 'aria-label': 'Senaryo ara' });
  const secimKutusu = (etiket, anahtar, secenekler) => {
    const sel = h('select', { 'aria-label': etiket }, secenekler.map(([d, m]) => h('option', { value: d, selected: liste[anahtar] === d }, m)));
    const kap = h('div', { class: `filtre-secimi ${liste[anahtar] ? 'etkin' : ''}` }, h('label', {}, etiket), sel);
    sel.addEventListener('change', () => { liste[anahtar] = sel.value; liste.sayfa = 0; kap.classList.toggle('etkin', Boolean(sel.value)); ciz(); });
    return { kap, sel };
  };
  const ekranSecimi = ekran ? null : secimKutusu('Ekran', 'ekran', [['', 'Tümü'], ...veri.ekranlar.filter((e) => e.senaryoSayisi).map((e) => [e.id, e.ad])]);
  const kosudaSecimi = secimKutusu('Koşuda', 'kosuda', [['', 'Tümü'], ['evet', 'Koşuda'], ['hayir', 'Hariç']]);
  const beklenenSecimi = secimKutusu('Beklenen', 'beklenen', [['', 'Tümü'], ['basari', 'Başarılı akış'], ['hata', 'İş kuralı hatası'], ['yok', 'Tanımsız']]);
  const sonSecimi = secimKutusu('Son durum', 'son', [['', 'Tümü'], ['basarili', 'Başarılı'], ['basarisiz', 'Başarısız'], ['atlanan', 'Atlandı'], ['durduruldu', 'Durduruldu'], ['yok', 'Koşulmadı']]);
  const temizle = h('button', { type: 'button', class: 'kucuk-dugme hayalet filtre-temizle', onclick: () => {
    Object.assign(liste, { arama: '', ekran: '', kosuda: '', beklenen: '', son: '', sayfa: 0 });
    arama.value = '';
    for (const x of [ekranSecimi, kosudaSecimi, beklenenSecimi, sonSecimi]) if (x) { x.sel.value = ''; x.kap.classList.remove('etkin'); }
    ciz();
  } }, ikon('carpi'), 'Filtreleri temizle');
  let aramaZamanlayici = null;
  arama.addEventListener('input', () => {
    clearTimeout(aramaZamanlayici);
    aramaZamanlayici = setTimeout(() => { liste.arama = arama.value; liste.sayfa = 0; ciz(); }, 120);
  });

  const filtreliMi = () => Boolean(liste.arama.trim() || liste.kosuda || liste.beklenen || liste.son || (!ekran && liste.ekran));
  const gorunenler = () => veri.senaryolar.filter((x) => {
    if (ekran && x.ekranId !== ekran.id) return false;
    if (!ekran && liste.ekran && x.ekranId !== liste.ekran) return false;
    if (liste.kosuda === 'evet' && !x.kosuyaDahil) return false;
    if (liste.kosuda === 'hayir' && x.kosuyaDahil) return false;
    if (liste.beklenen === 'basari' && x.beklenenSonuc?.tur !== 'basari') return false;
    if (liste.beklenen === 'hata' && x.beklenenSonuc?.tur !== 'hata') return false;
    if (liste.beklenen === 'yok' && x.beklenenSonuc) return false;
    if (liste.son === 'yok' && x.sonSonuc) return false;
    if (liste.son && liste.son !== 'yok' && x.sonSonuc?.durum !== liste.son) return false;
    return aramaEslesiyorMu(liste.arama, x.baslik, x.ekranAdi, x.baglamProfili?.ad, x.beklenenSonuc?.metin, x.kaynak?.dosya);
  });

  // --- Başlık ve eylemler ---
  const ortamSegmenti = ortamlar.length > 1 ? h('div', { class: 'segment', role: 'group', 'aria-label': 'Ortam' },
    ortamlar.map((o) => h('button', {
      type: 'button', 'aria-pressed': o.id === ortam.id ? 'true' : 'false', title: riskliOrtamMi(o) ? `${o.ad}: varsayılan test ortamı değil` : o.ad,
      onclick: async () => {
        if (o.id === ortam.id) return;
        seciliOrtamYaz(o.id);
        ortam = o;
        for (const b of ortamSegmenti.children) b.setAttribute('aria-pressed', b.textContent === o.ad ? 'true' : 'false');
        await yenile();
      }
    }, o.ad))) : null;
  const olusturulabilirler = veri.ekranlar.filter((e) => e.olusturulabilir);
  const yeniDugmesi = ekran
    ? (ekran.olusturulabilir ? h('a', { class: 'dugme', href: `#/senaryolar/yeni/${encodeURIComponent(ekran.id)}` }, ikon('artiYalin'), 'Yeni senaryo') : null)
    : olusturulabilirler.length ? yeniMenusu(olusturulabilirler) : null;
  const kosuDugmesi = h('button', { type: 'button', class: 'birincil' }, ikon('oynat'), 'Koşuyu başlat');
  kosuDugmesi.addEventListener('click', () => kosuyuBaslat());

  const baslikMetni = ekran ? ekran.ad : 'Genel';
  yerlestir(icerik, 
    h('div', { class: 'sayfa-basligi' },
      h('div', {},
        h('div', { class: 'kirinti' }, h('span', {}, proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: '#/senaryolar' }, 'Senaryolar'),
          h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, baslikMetni)),
        h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, h('span', { class: 'gorunmez' }, 'Senaryolar — '), baslikMetni), baslikRozeti),
        metaAlani),
      h('div', { class: 'eylemler' }, ortamSegmenti, yeniDugmesi, kosuDugmesi)),
    h('div', { class: 'senaryo-arac-cubugu' },
      h('div', { class: 'arama-kutusu' }, ikon('ara'), arama, h('kbd', { 'aria-hidden': 'true' }, '/')),
      ekranSecimi ? ekranSecimi.kap : null, kosudaSecimi.kap, beklenenSecimi.kap, sonSecimi.kap, temizle, ozetAlani),
    topluAlani,
    tabloAlani);
  const kisayol = (o) => {
    if (o.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') && !document.querySelector('dialog[open]')) { o.preventDefault(); arama.focus(); }
  };
  document.addEventListener('keydown', kisayol);

  async function yenile() {
    try {
      veri = await api(`/platform/senaryolar?projeId=${encodeURIComponent(proje.id)}&ortamId=${encodeURIComponent(ortam.id)}`);
      const gecerli = new Set(veri.senaryolar.map((x) => x.id));
      for (const id of [...liste.secim]) if (!gecerli.has(id)) liste.secim.delete(id);
      ciz();
    } catch (e) {
      if (e && e.durum === 423) return;
      bildir(e.message, 'hata');
    }
  }

  // Koşu durumu değişince satırlar yeniden çizilir; bir senaryo bitince son sonuç için liste yenilenir.
  let yenilemeZamanlayici = null;
  const birak = dinle((olay) => {
    if (!icerik.isConnected) { birak(); document.removeEventListener('keydown', kisayol); return; }
    if (olay === 'satir-bitti' || olay === 'bitti') { clearTimeout(yenilemeZamanlayici); yenilemeZamanlayici = setTimeout(yenile, 400); }
    else ciz();
  });

  function ciz() {
    const liste2 = gorunenler();
    const kapsam = ekran ? veri.senaryolar.filter((x) => x.ekranId === ekran.id) : veri.senaryolar;
    const dahil = kapsam.filter((x) => x.kosuyaDahil).length;
    yerlestir(baslikRozeti, rozet(`${kapsam.length} senaryo`, 'vurgu'));
    yerlestir(metaAlani, 
      h('span', {}, ikon('liste'), `${dahil} / ${kapsam.length} koşuda`),
      h('span', {}, ikon('ag'), `ortam: ${ortam.ad}`),
      ekran ? h('span', {}, ikon(ekran.modelVar ? 'katman' : 'ekran'), ekran.modelVar ? 'ekran modeli var' : 'ekran modeli yok') : h('span', {}, ikon('ekran'), `${veri.ekranlar.filter((e) => e.senaryoSayisi).length} ürün / ekran`));
    yerlestir(ozetAlani, liste2.length !== kapsam.length ? h('span', {}, h('b', {}, String(liste2.length)), ` / ${kapsam.length} gösteriliyor`) : '');
    temizle.hidden = !filtreliMi();
    kosuDugmesi.disabled = kosuSuruyorMu() || !liste2.some((x) => x.kosuyaDahil && !kosuDurumu(x.id));
    kosuDugmesi.title = kosuSuruyorMu() ? 'Sürmekte olan bir koşu var' : '';
    topluCubukCiz(liste2);
    tabloCiz(liste2);
  }

  function topluCubukCiz(gorunen) {
    const gorunenIdler = new Set(gorunen.map((x) => x.id));
    const secilenler = gorunen.filter((x) => liste.secim.has(x.id));
    const gizliSecili = [...liste.secim].filter((id) => !gorunenIdler.has(id)).length;
    if (!liste.secim.size) { yerlestir(topluAlani); return; }
    const koddaVar = secilenler.some((x) => !x.veriGudumlu);
    yerlestir(topluAlani, h('div', { class: 'toplu-cubuk', role: 'toolbar', 'aria-label': 'Seçili senaryolar için işlemler' },
      h('span', { class: 'secim-bilgisi' }, h('b', {}, String(secilenler.length)), 'seçili',
        gizliSecili ? h('span', { class: 'soluk kucuk' }, `(+${gizliSecili} filtre dışında; işlemlere dahil edilmez)`) : null),
      h('button', { type: 'button', class: 'kucuk-dugme birincil', disabled: !secilenler.length, onclick: () => seciliCalistir(secilenler) }, ikon('oynat'), 'Seçilenleri çalıştır'),
      h('span', { class: 'ayrac', 'aria-hidden': 'true' }),
      h('button', { type: 'button', class: 'kucuk-dugme', disabled: !secilenler.some((x) => !x.kosuyaDahil), onclick: () => kosuyaDahilEt(secilenler, true) }, ikon('onay'), 'Koşuya ekle'),
      h('button', { type: 'button', class: 'kucuk-dugme', disabled: !secilenler.some((x) => x.kosuyaDahil), onclick: () => kosuyaDahilEt(secilenler, false) }, ikon('eksi'), 'Koşudan çıkar'),
      h('button', {
        type: 'button', class: 'kucuk-dugme tehlike', disabled: !secilenler.length || koddaVar,
        title: koddaVar ? 'Kodda tanımlı senaryolar silinemez (Koşuda anahtarıyla koşudan çıkarın)' : null,
        onclick: () => sil(secilenler)
      }, ikon('cop'), 'Sil'),
      h('span', { class: 'sag' }, h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => { liste.secim.clear(); ciz(); } }, 'Seçimi temizle'))));
  }

  function tabloCiz(gorunen) {
    if (!gorunen.length) {
      yerlestir(tabloAlani, h('section', { class: 'kart' }, veri.senaryolar.length
        ? bosDurum('Filtreyle eşleşen senaryo yok.', 'Aramayı ya da filtreleri değiştirin.', { ikon: 'ara', eylem: h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => temizle.click() }, 'Filtreleri temizle') })
        : bosDurum('Bu ortamda senaryo yok.', 'Proje dosyalarını aktarın ya da ekran modeli olan bir ekranda yeni senaryo oluşturun.', { ikon: 'liste' })));
      return;
    }
    const sayfaSayisi = Math.max(1, Math.ceil(gorunen.length / SAYFA_BOYU));
    if (liste.sayfa >= sayfaSayisi) liste.sayfa = sayfaSayisi - 1;
    const dilim = gorunen.slice(liste.sayfa * SAYFA_BOYU, (liste.sayfa + 1) * SAYFA_BOYU);
    const tumu = h('input', { type: 'checkbox', 'aria-label': 'Görünen tüm senaryoları seç' });
    const secilenGorunen = gorunen.filter((x) => liste.secim.has(x.id)).length;
    tumu.checked = secilenGorunen > 0 && secilenGorunen === gorunen.length;
    tumu.indeterminate = secilenGorunen > 0 && secilenGorunen < gorunen.length;
    tumu.addEventListener('change', () => {
      for (const x of gorunen) { if (tumu.checked) liste.secim.add(x.id); else liste.secim.delete(x.id); }
      ciz();
    });
    const tablo = h('table', { class: 'senaryo-tablosu' },
      h('caption', { class: 'gorunmez' }, 'Senaryolar'),
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col', class: 'secim' }, tumu),
        h('th', { scope: 'col' }, 'Senaryo'),
        ekran ? null : h('th', { scope: 'col', class: 'ekran-sutunu' }, 'Ekran'),
        h('th', { scope: 'col', class: 'profil-sutunu' }, 'Bağlam profili'),
        h('th', { scope: 'col', class: 'beklenen-sutunu' }, 'Beklenen'),
        h('th', { scope: 'col' }, 'Son sonuç'),
        h('th', { scope: 'col', class: 'kosuda' }, 'Koşuda'),
        h('th', { scope: 'col', class: 'eylemler' }, h('span', { class: 'gorunmez' }, 'Eylemler')))),
      h('tbody', {}, dilim.map((x) => satir(x))));
    yerlestir(tabloAlani, h('section', { class: 'kart senaryo-karti' },
      h('div', { class: 'tablo-kaydirma' }, tablo),
      sayfaSayisi > 1 ? h('div', { class: 'tablo-alti' },
        h('span', {}, `Sayfa ${liste.sayfa + 1} / ${sayfaSayisi} · ${gorunen.length} senaryo`),
        h('span', { class: 'sag' },
          h('button', { type: 'button', class: 'kucuk-dugme', disabled: liste.sayfa === 0, onclick: () => { liste.sayfa--; ciz(); } }, '‹ Önceki'),
          h('button', { type: 'button', class: 'kucuk-dugme', disabled: liste.sayfa + 1 >= sayfaSayisi, onclick: () => { liste.sayfa++; ciz(); } }, 'Sonraki ›'))) : null));
  }

  function satir(x) {
    const kosu = kosuDurumu(x.id);
    const secim = h('input', { type: 'checkbox', 'aria-label': `Seç: ${x.baslik}`, checked: liste.secim.has(x.id) });
    secim.addEventListener('change', () => { if (secim.checked) liste.secim.add(x.id); else liste.secim.delete(x.id); ciz(); });
    const kosuda = h('input', { type: 'checkbox', class: 'anahtar', role: 'switch', checked: x.kosuyaDahil, 'aria-label': `Koşuda: ${x.baslik}` });
    kosuda.addEventListener('change', async () => {
      const yeni = kosuda.checked;
      kosuda.disabled = true;
      try {
        await api('/platform/senaryo/kosuya-dahil', { govde: { projeId: proje.id, idler: [x.id], dahil: yeni } });
        x.kosuyaDahil = yeni;
        bildir(yeni ? 'Senaryo koşuya eklendi.' : 'Senaryo koşudan çıkarıldı.');
      } catch (e) {
        kosuda.checked = !yeni;
        bildir(`Koşu listesi güncellenemedi: ${e.message}`, 'hata');
      } finally {
        kosuda.disabled = false;
        ciz();
      }
    });
    const bs = x.beklenenSonuc;
    const altBilgi = [
      x.veriGudumlu ? null : rozet('kodda', '', { title: 'Kodda tanımlı test: veri yok; yalnızca görünen ad ve Koşuda düzenlenir' }),
      !x.kosuyaDahil ? rozet('hariç', 'atlanan', { title: 'Koşu listesinde değil — Koşuyu başlat ve npm run test bu senaryoyu koşmaz' }) : null,
      x.mutlakaGorunmeliSayisi ? rozet(`${x.mutlakaGorunmeliSayisi} zorunlu görünür`, 'durdu', { title: '"Mutlaka görünmeli" işaretli alan sayısı' }) : null,
      x.kaynak && x.kaynak.ad !== x.baslik ? h('span', { title: 'Koddaki test adı' }, x.kaynak.ad) : null
    ].filter(Boolean);
    let sonHucre;
    if (kosu) {
      sonHucre = h('span', { class: 'son-sonuc calisiyor' }, kosu.durum === 'calisiyor' ? h('span', { class: 'donen-halka', 'aria-hidden': 'true' }) : ikon('saat'),
        h('span', { class: 'etiket' }, kosu.durum === 'calisiyor' ? 'Çalışıyor' : 'Sırada'));
    } else if (x.sonSonuc) {
      const g = SON_DURUM[x.sonSonuc.durum] || { etiket: x.sonSonuc.durum, sinif: '' };
      sonHucre = h('a', { class: `son-sonuc ${g.sinif}`, href: `#/sonuclar/sonuc/${encodeURIComponent(x.sonSonuc.sonucId)}`, title: 'Sonuç ayrıntısını aç' },
        h('span', { class: `nokta ${g.sinif}`, 'aria-hidden': 'true' }), h('span', { class: 'etiket' }, g.etiket), h('span', { class: 'zaman' }, kisaTarih(x.sonSonuc.zaman)));
    } else {
      sonHucre = h('span', { class: 'son-sonuc yok' }, '— koşulmadı');
    }
    const calistir = kosu
      ? h('button', {
        type: 'button', class: 'ikon-dugme durdur-dugmesi', disabled: Boolean(kosu.durduruluyor), title: kosu.durduruluyor ? 'Durduruluyor…' : 'Durdur',
        'aria-label': `Durdur: ${x.baslik}`, onclick: () => durdur(x.id)
      }, h('span', { class: 'kare', 'aria-hidden': 'true' }))
      : h('button', { type: 'button', class: 'ikon-dugme oynat-dugmesi', title: 'Çalıştır', 'aria-label': `Çalıştır: ${x.baslik}`, onclick: () => tekCalistir(x) }, ikon('oynat'));
    return h('tr', { class: [liste.secim.has(x.id) ? 'secili' : '', kosu ? 'calisiyor' : '', x.kosuyaDahil ? '' : 'haric'].join(' ').trim() || null, 'data-senaryo': x.id },
      h('td', { class: 'secim' }, secim),
      h('td', {}, h('div', { class: 'senaryo-adi' }, h('strong', {}, x.baslik), altBilgi.length ? h('small', {}, altBilgi) : null)),
      ekran ? null : h('td', { class: 'ekran-hucresi' }, x.ekranAdi || '—'),
      h('td', { class: 'profil-sutunu' }, x.baglamProfili
        ? h('span', { class: `profil-hapi ${x.baglamProfili.varsayilan ? 'varsayilan' : ''}`, title: x.baglamProfili.varsayilan ? 'Varsayılan bağlam profili' : 'Bağlam profili' }, ikon('kullanici'), x.baglamProfili.ad || 'varsayılan')
        : h('span', { class: 'cok-soluk' }, '—')),
      h('td', { class: 'beklenen-hucresi' }, bs ? rozet(bs.metin, bs.tur === 'hata' ? 'hata' : 'basari', { title: bs.aciklama }) : h('span', { class: 'cok-soluk' }, '—')),
      h('td', {}, sonHucre),
      h('td', { class: 'kosuda' }, kosuda),
      h('td', { class: 'eylemler' }, h('span', { class: 'satir-eylemleri' },
        calistir,
        h('a', { class: 'dugme ikon-dugme', href: `#/senaryolar/duzenle/${encodeURIComponent(x.id)}`, title: 'Düzenle', 'aria-label': `Düzenle: ${x.baslik}` }, ikon('duzenle')),
        satirMenusu(x))));
  }

  function satirMenusu(x) {
    const dugme = h('button', { type: 'button', class: 'ikon-dugme', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': `Diğer işlemler: ${x.baslik}`, title: 'Diğer' }, '⋯');
    const menu = h('div', { class: 'acilir-menu', role: 'menu', hidden: true },
      h('button', { type: 'button', role: 'menuitem', disabled: !x.veriGudumlu, title: x.veriGudumlu ? null : 'Kodda tanımlı senaryolar kopyalanamaz', onclick: () => { kapat(); kopyala(x); } }, ikon('kopya'), 'Kopyala'),
      h('button', { type: 'button', role: 'menuitem', onclick: () => { kapat(); gecmisCekmecesi(x); } }, ikon('tarih'), 'Geçmiş'),
      h('hr', {}),
      h('button', { type: 'button', role: 'menuitem', class: 'tehlikeli', disabled: !x.veriGudumlu, title: x.veriGudumlu ? null : 'Kodda tanımlı senaryolar silinemez', onclick: () => { kapat(); sil([x]); } }, ikon('cop'), 'Sil'));
    const kap = h('span', { class: 'satir-menusu-kap' }, dugme, menu);
    const disTik = (o) => { if (!kap.contains(o.target)) kapat(); };
    function kapat() { menu.hidden = true; dugme.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', disTik); }
    dugme.addEventListener('click', () => {
      if (!menu.hidden) { kapat(); return; }
      menu.hidden = false; dugme.setAttribute('aria-expanded', 'true');
      setTimeout(() => document.addEventListener('click', disTik), 0);
      menu.querySelector('button:not(:disabled)')?.focus();
    });
    menu.addEventListener('keydown', (o) => {
      const ogeler = [...menu.querySelectorAll('button:not(:disabled)')];
      const i = ogeler.indexOf(document.activeElement);
      if (o.key === 'Escape') { kapat(); dugme.focus(); }
      else if (o.key === 'ArrowDown') { o.preventDefault(); ogeler[(i + 1) % ogeler.length]?.focus(); }
      else if (o.key === 'ArrowUp') { o.preventDefault(); ogeler[(i - 1 + ogeler.length) % ogeler.length]?.focus(); }
    });
    return kap;
  }

  // --- İşlemler ---
  async function tekCalistir(x) {
    if (riskliOrtamMi(ortam) && !(await kosuOnayi({ baslik: 'Senaryoyu çalıştır?', senaryolar: [x], ortam, tur: 'tekil', esZamanli: true, dugme: 'Çalıştır' }))) return;
    kosuBaslat({ projeId: proje.id, ortam, senaryolar: [x], tur: 'tekil', esZamanli: true, baslik: x.baslik });
  }

  async function seciliCalistir(secilenler) {
    const calisabilir = secilenler.filter((x) => !kosuDurumu(x.id));
    if (!calisabilir.length) return;
    const onay = await kosuOnayi({ baslik: 'Seçilenleri çalıştır?', senaryolar: calisabilir, ortam, tur: 'tekil', esZamanli: true });
    if (!onay) return;
    kosuBaslat({ projeId: proje.id, ortam, senaryolar: calisabilir, tur: 'tekil', esZamanli: true, baslik: `${calisabilir.length} seçili senaryo` });
  }

  async function kosuyuBaslat() {
    const gorunen = gorunenler();
    const kosacaklar = gorunen.filter((x) => x.kosuyaDahil && !kosuDurumu(x.id));
    if (!kosacaklar.length) return;
    const tam = !filtreliMi();
    const kapsam = ekran ? ekran.ad : 'Genel';
    const onay = await kosuOnayi({
      baslik: tam ? 'Koşuyu başlat?' : 'Kısmi koşuyu başlat?', senaryolar: kosacaklar, ortam, tur: tam ? 'tam' : 'tekil', kapsam, esZamanli: false,
      haricSayisi: gorunen.filter((x) => !x.kosuyaDahil).length,
      not: tam
        ? (kapsam === 'Genel'
          ? 'Tam koşu olarak kaydedilir; bitince Genel kartlar, Genel trend ve koşulan her ürünün kartları güncellenir.'
          : `Tam koşu olarak kaydedilir; bitince ${kapsam} kartları ve trendi güncellenir (Genel trend değişmez).`)
        : 'Arama ya da filtre etkin: yalnızca listelenenler koşar. Kısmi koşu olarak kaydedilir; kartları ve trendi değiştirmez.'
    });
    if (!onay) return;
    kosuBaslat({ projeId: proje.id, ortam, senaryolar: kosacaklar, tur: tam ? 'tam' : 'tekil', kapsam, esZamanli: false, baslik: tam ? `${kapsam} koşusu` : `${kapsam} (kısmi)` });
  }

  async function kosuyaDahilEt(secilenler, dahil) {
    const hedef = secilenler.filter((x) => x.kosuyaDahil !== dahil);
    if (!hedef.length) return;
    try {
      const { degisen } = await api('/platform/senaryo/kosuya-dahil', { govde: { projeId: proje.id, idler: hedef.map((x) => x.id), dahil } });
      bildir(`${degisen} senaryo ${dahil ? 'koşuya eklendi' : 'koşudan çıkarıldı'}.`);
      await yenile();
    } catch (e) { bildir(e.message, 'hata'); }
  }

  async function sil(secilenler) {
    const tamam = await onayIste({
      baslik: secilenler.length === 1 ? 'Senaryo silinsin mi?' : `${secilenler.length} senaryo silinsin mi?`,
      metin: 'Senaryo veritabanından silinir; testleri bir sonraki koşuda üretilmez. Geçmiş sonuçlar ve değişiklik geçmişi korunur.',
      liste: secilenler.map((x) => x.baslik), dugme: 'Sil', tehlikeli: true
    });
    if (!tamam) return;
    try {
      const { silinen } = await api('/platform/senaryo/sil', { govde: { projeId: proje.id, idler: secilenler.map((x) => x.id) } });
      for (const x of secilenler) liste.secim.delete(x.id);
      bildir(`${silinen} senaryo silindi.`);
      await yenile();
    } catch (e) { bildir(e.message, 'hata'); }
  }

  async function kopyala(x) {
    try {
      const k = await api('/platform/senaryo/kopyala', { govde: { projeId: proje.id, id: x.id } });
      bildir(`Kopya oluşturuldu: "${k.baslik}" (Koşuda kapalı).`);
      await yenile();
      const tr = tabloAlani.querySelector(`tr[data-senaryo="${CSS.escape(k.id)}"]`);
      tr?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (e) { bildir(e.message, 'hata'); }
  }

  ciz();
}

function yeniMenusu(ekranlar) {
  const dugme = h('button', { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, ikon('artiYalin'), 'Yeni senaryo', ikon('asagi'));
  const menu = h('div', { class: 'acilir-menu', role: 'menu', hidden: true },
    h('div', { class: 'menu-baslik', 'aria-hidden': 'true' }, 'Ekran modeli olan ekranlar'),
    ekranlar.map((e) => h('button', { type: 'button', role: 'menuitem', onclick: () => { location.hash = `#/senaryolar/yeni/${encodeURIComponent(e.id)}`; } }, ikon('katman'), e.ad)));
  const kap = h('div', { class: 'proje-secici-kap' }, dugme, menu);
  const disTik = (o) => { if (!kap.contains(o.target)) kapat(); };
  function kapat() { menu.hidden = true; dugme.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', disTik); }
  dugme.addEventListener('click', () => {
    if (!menu.hidden) { kapat(); return; }
    menu.hidden = false; dugme.setAttribute('aria-expanded', 'true');
    setTimeout(() => document.addEventListener('click', disTik), 0);
    menu.querySelector('button')?.focus();
  });
  menu.addEventListener('keydown', (o) => { if (o.key === 'Escape') { kapat(); dugme.focus(); } });
  menu.style.setProperty('left', 'auto');
  menu.style.setProperty('right', '0');
  return kap;
}

// ---------------------------------------------------------------------------------------
// Geçmiş çekmecesi
// ---------------------------------------------------------------------------------------

const ISLEM = {
  olustur: { etiket: 'Oluşturuldu', ikon: 'artiYalin' },
  guncelle: { etiket: 'Güncellendi', ikon: 'duzenle' },
  sil: { etiket: 'Silindi', ikon: 'cop' },
  birlestirme_cakismasi: { etiket: 'Birleştirme çakışması', ikon: 'uyari' },
  ice_aktarma_uzerine_yazildi: { etiket: 'İçe aktarmada üzerine yazıldı', ikon: 'yukle' }
};

export async function gecmisCekmecesi(x) {
  const govde = h('div', {}, iskelet('liste'));
  const kapat = h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': 'Kapat' }, ikon('carpi'));
  const diyalog = h('dialog', { class: 'cekmece', 'aria-labelledby': 'gecmis-baslik' },
    h('div', { class: 'cekmece-ust' }, h('div', {}, h('h2', { id: 'gecmis-baslik' }, 'Değişiklik geçmişi'), h('p', { class: 'soluk' }, x.baslik)), kapat),
    govde);
  kapat.addEventListener('click', () => diyalog.close());
  diyalog.addEventListener('close', () => diyalog.remove());
  document.body.append(diyalog);
  diyalog.showModal();
  try {
    const { kayitlar, makineler } = await api(`/platform/senaryo/gecmis?id=${encodeURIComponent(x.id)}`);
    const yapanAdi = (y) => {
      const i = String(y).indexOf('@');
      if (i < 0) return y;
      const m = makineler[y.slice(i + 1)];
      return m ? `${y.slice(0, i)} (${m})` : y.slice(0, i);
    };
    yerlestir(govde, kayitlar.length
      ? h('ol', { class: 'gecmis-zaman-cizelgesi' }, kayitlar.map((k) => {
        const g = ISLEM[k.islem] || { etiket: k.islem, ikon: 'isaret' };
        return h('li', { class: k.islem },
          h('span', { class: 'islem-simgesi', 'aria-hidden': 'true' }, ikon(g.ikon)),
          h('div', { class: 'ust' }, h('b', {}, g.etiket), h('span', {}, `${new Date(k.zaman).toLocaleString('tr-TR')} · ${yapanAdi(k.yapan)}`)),
          k.degisenler.length ? h('ul', {}, k.degisenler.map((d) => h('li', {}, d))) : k.islem === 'guncelle' ? h('p', { class: 'soluk kucuk' }, 'İçerik aynı kaldı (yeniden kaydedildi).') : null,
          k.aciklama ? h('p', { class: 'soluk kucuk' }, k.aciklama) : null);
      }))
      : bosDurum('Geçmiş kaydı yok.', null, { ikon: 'tarih' }));
  } catch (e) {
    yerlestir(govde, hataKutusu(e));
  }
}
